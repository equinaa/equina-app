begin;

create table public.listing_risk_signals (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  signal text not null check (signal in ('price_outlier', 'new_account_high_value', 'duplicate_media', 'identity_mismatch', 'suspicious_velocity', 'manual_review')),
  severity text not null check (severity in ('low', 'medium', 'high')),
  detail jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.listing_photos add column content_hash text check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$');
alter table public.dispute_evidence add column content_hash text check (content_hash is null or content_hash ~ '^[a-f0-9]{64}$');
create index listing_photos_hash_idx on public.listing_photos(content_hash) where content_hash is not null;
create index listing_risk_signals_review_idx on public.listing_risk_signals(severity, created_at) where resolved_at is null;
alter table public.listing_risk_signals enable row level security;
create policy listing_risk_signals_staff on public.listing_risk_signals for all to authenticated
using (private.is_staff()) with check (private.is_staff());
create policy listing_risk_signals_seller_read on public.listing_risk_signals for select to authenticated
using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid()));
grant select, insert, update, delete on public.listing_risk_signals to authenticated;

create or replace function private.screen_listing_risk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_age interval;
begin
  if old.status not in ('draft', 'rejected') or new.status not in ('active', 'pending_review') or old.status = new.status then return new; end if;
  if exists (select 1 from public.listing_risk_signals r where r.listing_id = new.id and r.severity = 'high' and r.resolved_at is null) then
    new.status = 'pending_review';
  end if;
  select now() - u.created_at into account_age from auth.users u where u.id = new.seller_id;
  if new.price_minor >= 100000 and account_age < interval '30 days' then
    insert into public.listing_risk_signals(listing_id, signal, severity, detail)
    values (new.id, 'new_account_high_value', 'high', jsonb_build_object('account_age_days', extract(day from account_age)))
    on conflict do nothing;
    new.status = 'pending_review';
  end if;
  return new;
end;
$$;

create or replace function private.enforce_message_safety()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  other_user uuid;
  recent_count integer;
begin
  select case when c.buyer_id = new.sender_id then c.seller_id else c.buyer_id end
    into other_user from public.marketplace_conversations c where c.id = new.conversation_id;
  if other_user is null then raise exception 'Conversation participant mismatch'; end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = new.sender_id and b.blocked_id = other_user)
       or (b.blocker_id = other_user and b.blocked_id = new.sender_id)
  ) then raise exception 'Messaging is unavailable for this conversation'; end if;
  select count(*) into recent_count from public.marketplace_messages m
    where m.sender_id = new.sender_id and m.created_at > now() - interval '1 minute';
  if recent_count >= 30 then raise exception 'Message rate limit exceeded'; end if;
  return new;
end;
$$;

create or replace function private.prevent_message_identity_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.conversation_id is distinct from old.conversation_id or new.sender_id is distinct from old.sender_id or new.client_nonce is distinct from old.client_nonce then
    raise exception 'Message identity cannot be changed';
  end if;
  if new.body is distinct from old.body and old.deleted_at is not null then
    raise exception 'Deleted messages cannot be edited';
  end if;
  if auth.uid() is not null and new.deleted_at is distinct from old.deleted_at and old.sender_id <> auth.uid() then
    raise exception 'Only the sender can delete a message';
  end if;
  return new;
end;
$$;

create or replace function private.protect_conversation_archive_state()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() = old.buyer_id and new.seller_archived_at is distinct from old.seller_archived_at then
    raise exception 'Buyer cannot change seller archive state';
  end if;
  if auth.uid() = old.seller_id and new.buyer_archived_at is distinct from old.buyer_archived_at then
    raise exception 'Seller cannot change buyer archive state';
  end if;
  return new;
end;
$$;

create or replace function private.touch_conversation_after_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.marketplace_conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end;
$$;

create or replace function private.enforce_club_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recent_count integer;
begin
  if tg_table_name = 'club_posts' then
    select count(*) into recent_count from public.club_posts where author_id = new.author_id and created_at > now() - interval '1 hour';
    if recent_count >= 12 then raise exception 'Post rate limit exceeded'; end if;
  else
    select count(*) into recent_count from public.club_comments where author_id = new.author_id and created_at > now() - interval '1 minute';
    if recent_count >= 20 then raise exception 'Comment rate limit exceeded'; end if;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_server_creation_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recent_count integer;
begin
  if tg_table_name = 'checkout_quotes' then
    select count(*) into recent_count from public.checkout_quotes where buyer_id = new.buyer_id and created_at > now() - interval '1 minute';
    if recent_count >= 20 then raise exception 'Checkout quote rate limit exceeded'; end if;
  else
    select count(*) into recent_count from public.upload_tickets where user_id = new.user_id and created_at > now() - interval '1 hour';
    if recent_count >= 100 then raise exception 'Upload ticket rate limit exceeded'; end if;
  end if;
  return new;
end;
$$;

create trigger listings_risk_screen before update of status on public.listings
for each row execute function private.screen_listing_risk();
create trigger marketplace_messages_safety before insert on public.marketplace_messages
for each row execute function private.enforce_message_safety();
create trigger marketplace_messages_touch_conversation after insert on public.marketplace_messages
for each row execute function private.touch_conversation_after_message();
create trigger marketplace_conversations_protect_archive before update on public.marketplace_conversations
for each row execute function private.protect_conversation_archive_state();
create trigger club_posts_rate_limit before insert on public.club_posts
for each row execute function private.enforce_club_rate_limit();
create trigger club_comments_rate_limit before insert on public.club_comments
for each row execute function private.enforce_club_rate_limit();
create trigger checkout_quotes_rate_limit before insert on public.checkout_quotes
for each row execute function private.enforce_server_creation_rate();
create trigger upload_tickets_rate_limit before insert on public.upload_tickets
for each row execute function private.enforce_server_creation_rate();

create or replace function private.valid_order_transition(old_status public.order_status, new_status public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select old_status = new_status or (old_status, new_status) in (
    ('payment_pending', 'processing_payment'), ('payment_pending', 'paid'), ('payment_pending', 'payment_failed'), ('payment_pending', 'canceled'),
    ('processing_payment', 'paid'), ('processing_payment', 'payment_failed'), ('processing_payment', 'canceled'),
    ('payment_failed', 'payment_pending'), ('payment_failed', 'paid'), ('payment_failed', 'canceled'),
    ('paid', 'seller_preparing'), ('paid', 'shipped'), ('paid', 'disputed'), ('paid', 'refund_pending'),
    ('seller_preparing', 'shipped'), ('seller_preparing', 'disputed'), ('seller_preparing', 'refund_pending'),
    ('shipped', 'inspection'), ('shipped', 'disputed'), ('shipped', 'refund_pending'),
    ('inspection', 'accepted'), ('inspection', 'disputed'),
    ('accepted', 'transfer_pending'), ('accepted', 'completed'),
    ('transfer_pending', 'completed'), ('transfer_pending', 'disputed'),
    ('completed', 'disputed'), ('completed', 'refund_pending'),
    ('disputed', 'refund_pending'), ('disputed', 'completed'),
    ('refund_pending', 'refunded'), ('refund_pending', 'completed'), ('refund_pending', 'disputed')
  );
$$;

commit;
