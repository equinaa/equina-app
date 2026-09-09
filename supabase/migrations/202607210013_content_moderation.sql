begin;

create type public.moderation_target_type as enum ('club_post', 'club_comment', 'listing');

create table public.content_moderation_jobs (
  id bigint generated always as identity primary key,
  target_type public.moderation_target_type not null,
  target_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'approved', 'rejected', 'manual_review', 'failed')),
  attempts smallint not null default 0 check (attempts between 0 and 20),
  next_attempt_at timestamptz not null default now(),
  provider_ref text,
  result jsonb not null default '{}'::jsonb check (jsonb_typeof(result) = 'object'),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_type, target_id)
);
create index content_moderation_queue_idx on public.content_moderation_jobs(next_attempt_at, id)
where status in ('pending', 'failed') and attempts < 20;
create trigger content_moderation_jobs_set_updated_at before update on public.content_moderation_jobs
for each row execute function private.set_updated_at();

alter table public.content_moderation_jobs enable row level security;
create policy content_moderation_jobs_staff on public.content_moderation_jobs for select to authenticated
using (private.is_staff());
grant select on public.content_moderation_jobs to authenticated;

create or replace function private.club_content_status(content text)
returns public.content_status
language sql
immutable
set search_path = ''
as $$
  select case
    when lower(content) ~ '(ignore the vet|colic cure|laminitis cure|animal abuse|buy followers|crypto investment)'
      then 'hidden'::public.content_status
    else 'pending'::public.content_status
  end;
$$;

create or replace function private.moderate_club_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.moderation_status = 'deleted' then
    new.edited_at = now();
    return new;
  end if;
  if tg_op = 'INSERT' or new.body is distinct from old.body then
    new.moderation_status = private.club_content_status(new.body);
    if tg_op = 'UPDATE' then new.edited_at = now(); end if;
  end if;
  return new;
end;
$$;

create or replace function private.queue_content_moderation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queued_type public.moderation_target_type;
  queued_id uuid;
begin
  if tg_table_name = 'club_posts' then
    if new.moderation_status = 'deleted' then return new; end if;
    queued_type := 'club_post'; queued_id := new.id;
  elsif tg_table_name = 'club_comments' then
    if new.moderation_status = 'deleted' then return new; end if;
    queued_type := 'club_comment'; queued_id := new.id;
  elsif tg_table_name = 'club_post_media' then
    queued_type := 'club_post'; queued_id := case when tg_op = 'DELETE' then old.post_id else new.post_id end;
    if exists (select 1 from public.club_posts p where p.id = queued_id and p.moderation_status = 'deleted') then
      return coalesce(new, old);
    end if;
  elsif tg_table_name = 'listings' then
    if new.status <> 'pending_review' or (tg_op = 'UPDATE' and old.status = new.status) then return new; end if;
    queued_type := 'listing'; queued_id := new.id;
  else
    return coalesce(new, old);
  end if;

  insert into public.content_moderation_jobs(target_type, target_id)
  values (queued_type, queued_id)
  on conflict (target_type, target_id) do update set
    status = 'pending', attempts = 0, next_attempt_at = now(),
    provider_ref = null, result = '{}'::jsonb, last_error = null, completed_at = null;
  return coalesce(new, old);
end;
$$;

create trigger club_posts_queue_moderation after insert or update of body on public.club_posts
for each row execute function private.queue_content_moderation();
create trigger club_comments_queue_moderation after insert or update of body on public.club_comments
for each row execute function private.queue_content_moderation();
create trigger club_media_queue_moderation after insert or delete on public.club_post_media
for each row execute function private.queue_content_moderation();
create trigger listings_queue_moderation after insert or update of status on public.listings
for each row execute function private.queue_content_moderation();

create or replace function public.publish_listing(target_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_listing public.listings;
  rule public.marketplace_category_rules;
  missing_angle text;
  target_verification public.seller_verification_status;
begin
  if not private.feature_enabled('shop_listing_creation') then raise exception 'Listing creation is not enabled for this account'; end if;
  select * into target_listing from public.listings where id = target_listing_id for update;
  if target_listing.id is null then raise exception 'Listing not found'; end if;
  if target_listing.seller_id <> auth.uid() and not private.is_staff() then raise exception 'Not allowed'; end if;
  if target_listing.status not in ('draft', 'rejected') then raise exception 'Only drafts can be published'; end if;

  select * into rule from public.marketplace_category_rules where category = target_listing.category;
  select angle into missing_angle
  from jsonb_array_elements_text(rule.required_photo_angles) angle
  where not exists (
    select 1 from public.listing_photos p
    where p.listing_id = target_listing.id and p.required_angle = angle
  ) limit 1;

  if missing_angle is not null then raise exception 'Missing required photo: %', missing_angle; end if;
  if target_listing.category = 'helmet' and coalesce((target_listing.metadata ->> 'impact_history')::boolean, false) then
    raise exception 'Helmets with known impact history cannot be listed';
  end if;

  select verification_status into target_verification from public.seller_accounts where user_id = target_listing.seller_id;
  if target_listing.category = 'saddle' and target_listing.price_minor >= 100000 then
    if target_verification is distinct from 'verified' then raise exception 'High-value saddles require seller verification'; end if;
    if nullif(target_listing.metadata ->> 'serial_number', '') is null or coalesce((target_listing.metadata ->> 'proof_of_ownership')::boolean, false) is false then
      raise exception 'High-value saddles require serial number and proof of ownership';
    end if;
  end if;

  update public.listings set status = 'pending_review', published_at = null, moderation_note = null
  where id = target_listing.id returning * into target_listing;
  return target_listing;
end;
$$;

commit;
