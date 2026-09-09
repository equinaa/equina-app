begin;

create type public.sanction_kind as enum ('warning', 'suspension');

create table public.user_sanctions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.sanction_kind not null,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  issued_by uuid not null references auth.users(id) on delete restrict,
  starts_at timestamptz not null default now(),
  expires_at timestamptz,
  lifted_at timestamptz,
  lifted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (kind = 'warning' or expires_at is not null)
);
create index user_sanctions_active_idx on public.user_sanctions(user_id, expires_at)
where kind = 'suspension' and lifted_at is null;

alter table public.user_sanctions enable row level security;
create policy user_sanctions_read on public.user_sanctions for select to authenticated
using (user_id = auth.uid() or private.is_staff());
create policy user_sanctions_staff_update on public.user_sanctions for update to authenticated
using (private.is_staff()) with check (private.is_staff());
grant select, update on public.user_sanctions to authenticated;

create or replace function private.is_user_suspended(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.user_sanctions s
    where s.user_id = target_user and s.kind = 'suspension' and s.lifted_at is null
      and s.starts_at <= now() and s.expires_at > now()
  );
$$;
revoke execute on function private.is_user_suspended(uuid) from public, anon;
grant execute on function private.is_user_suspended(uuid) to authenticated;

create or replace function private.reject_suspended_mutation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id uuid;
begin
  if tg_table_name = 'club_posts' or tg_table_name = 'club_comments' then actor_id := new.author_id;
  elsif tg_table_name = 'marketplace_messages' then actor_id := new.sender_id;
  elsif tg_table_name = 'listings' then actor_id := new.seller_id;
  else actor_id := auth.uid();
  end if;
  if tg_op = 'UPDATE' and auth.uid() is distinct from actor_id then return new; end if;
  if private.is_user_suspended(actor_id) then raise exception 'This account is temporarily restricted'; end if;
  return new;
end;
$$;

create trigger club_posts_reject_suspended before insert or update of body on public.club_posts
for each row execute function private.reject_suspended_mutation();
create trigger club_comments_reject_suspended before insert or update of body on public.club_comments
for each row execute function private.reject_suspended_mutation();
create trigger messages_reject_suspended before insert on public.marketplace_messages
for each row execute function private.reject_suspended_mutation();
create trigger listings_reject_suspended before insert or update on public.listings
for each row execute function private.reject_suspended_mutation();

alter table public.moderation_actions drop constraint moderation_actions_target_type_check;
alter table public.moderation_actions add constraint moderation_actions_target_type_check
check (target_type in ('post', 'comment', 'listing', 'message', 'user'));
alter table public.moderation_actions add column marketplace_report_id uuid references public.marketplace_reports(id) on delete set null;

create or replace function public.create_marketplace_conversation(target_listing_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_seller uuid;
  conversation_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if private.is_user_suspended(auth.uid()) then raise exception 'This account is temporarily restricted'; end if;
  if not private.feature_enabled('shop_messaging') then raise exception 'Messaging is not enabled for this account'; end if;

  select seller_id into target_seller from public.listings
  where id = target_listing_id and status in ('active', 'reserved', 'sold');
  if target_seller is null then raise exception 'Listing is not available'; end if;
  if target_seller = auth.uid() then raise exception 'You cannot message yourself'; end if;
  if private.is_user_suspended(target_seller) then raise exception 'Messaging is unavailable for this account'; end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = target_seller)
       or (b.blocker_id = target_seller and b.blocked_id = auth.uid())
  ) then raise exception 'Messaging is unavailable for this account'; end if;

  insert into public.marketplace_conversations (listing_id, buyer_id, seller_id)
  values (target_listing_id, auth.uid(), target_seller)
  on conflict (listing_id, buyer_id) do update set buyer_archived_at = null
  returning id into conversation_id;
  return conversation_id;
end;
$$;

commit;
