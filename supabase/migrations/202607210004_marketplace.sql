begin;

create type public.seller_type as enum ('private', 'business');
create type public.listing_category as enum ('saddle', 'bridle', 'bit', 'girth', 'stirrup', 'boot', 'pad', 'blanket', 'helmet', 'apparel', 'grooming', 'training_aid', 'transport');
create type public.condition_grade as enum ('new', 'like_new', 'good', 'fair', 'for_parts');
create type public.listing_status as enum ('draft', 'pending_review', 'active', 'reserved', 'sold', 'rejected', 'archived');
create type public.order_status as enum ('payment_pending', 'processing_payment', 'payment_failed', 'paid', 'seller_preparing', 'shipped', 'inspection', 'accepted', 'transfer_pending', 'completed', 'disputed', 'refund_pending', 'refunded', 'canceled');
create type public.message_delivery_status as enum ('sent', 'delivered', 'read');
create type public.dispute_reason as enum ('misrepresented', 'counterfeit_suspected', 'damaged', 'not_received', 'other');
create type public.dispute_status as enum ('open', 'awaiting_buyer', 'awaiting_seller', 'under_review', 'resolved');
create type public.dispute_resolution as enum ('release', 'partial_refund', 'return_refund', 'full_refund', 'dismissed');

create table public.marketplace_category_rules (
  category public.listing_category primary key,
  required_photo_angles jsonb not null check (jsonb_typeof(required_photo_angles) = 'array'),
  max_photo_count smallint not null default 12 check (max_photo_count between 1 and 20),
  permits_for_parts boolean not null default true,
  safety_notice text
);

create table public.marketplace_brands (
  id uuid primary key default gen_random_uuid(),
  name extensions.citext not null unique,
  website text,
  is_verified boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.seller_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seller_type public.seller_type not null default 'private',
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  verification_status public.seller_verification_status not null default 'unstarted',
  stripe_account_id text unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  details_submitted boolean not null default false,
  tax_collection_ready boolean not null default false,
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  payout_hold_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users(id) on delete cascade,
  category public.listing_category not null,
  title text not null check (char_length(trim(title)) between 8 and 140),
  description text not null default '' check (char_length(description) <= 5000),
  brand_id uuid references public.marketplace_brands(id) on delete set null,
  brand_name text not null check (char_length(trim(brand_name)) between 2 and 80),
  model text check (model is null or char_length(model) <= 100),
  condition_grade public.condition_grade not null,
  price_minor integer not null check (price_minor between 1 and 100000000),
  currency text not null check (currency in ('EUR', 'USD', 'GBP')),
  country_code text not null check (country_code ~ '^[A-Z]{2}$'),
  locality text not null check (char_length(trim(locality)) between 2 and 120),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  status public.listing_status not null default 'draft',
  moderation_note text,
  published_at timestamptz,
  reserved_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listings_discovery_idx on public.listings(status, category, published_at desc);
create index listings_seller_idx on public.listings(seller_id, created_at desc);

create table public.listing_photos (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  object_path text not null unique,
  required_angle text not null check (char_length(required_angle) between 2 and 60),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/heic', 'image/heif')),
  byte_size integer not null check (byte_size between 1 and 15728640),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  position smallint not null check (position between 0 and 19),
  evidence_status text not null default 'pending' check (evidence_status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  unique (listing_id, position),
  unique (listing_id, required_angle)
);

create table public.listing_shipping_rates (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  country_code text not null check (country_code = '*' or country_code ~ '^[A-Z]{2}$'),
  service_name text not null check (char_length(service_name) between 2 and 80),
  amount_minor integer not null check (amount_minor between 0 and 1000000),
  min_days smallint not null check (min_days between 1 and 90),
  max_days smallint not null check (max_days between min_days and 120),
  tracked boolean not null default true,
  insured_up_to_minor integer not null default 0 check (insured_up_to_minor >= 0),
  created_at timestamptz not null default now(),
  unique (listing_id, country_code, service_name)
);

create table public.saved_listings (
  user_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, listing_id)
);

create table public.marketplace_conversations (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  buyer_id uuid not null references auth.users(id) on delete cascade,
  seller_id uuid not null references auth.users(id) on delete cascade,
  last_message_at timestamptz not null default now(),
  buyer_archived_at timestamptz,
  seller_archived_at timestamptz,
  created_at timestamptz not null default now(),
  unique (listing_id, buyer_id),
  check (buyer_id <> seller_id)
);
create index marketplace_conversations_buyer_idx on public.marketplace_conversations(buyer_id, last_message_at desc);
create index marketplace_conversations_seller_idx on public.marketplace_conversations(seller_id, last_message_at desc);

create table public.marketplace_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.marketplace_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  client_nonce uuid not null,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  delivery_status public.message_delivery_status not null default 'sent',
  read_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (sender_id, client_nonce)
);
create index marketplace_messages_thread_idx on public.marketplace_messages(conversation_id, created_at);

create table public.checkout_quotes (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  shipping_rate_id uuid not null references public.listing_shipping_rates(id) on delete restrict,
  item_amount_minor integer not null check (item_amount_minor > 0),
  shipping_amount_minor integer not null check (shipping_amount_minor >= 0),
  tax_amount_minor integer not null check (tax_amount_minor >= 0),
  protection_fee_minor integer not null check (protection_fee_minor >= 0),
  total_amount_minor integer generated always as (item_amount_minor + shipping_amount_minor + tax_amount_minor + protection_fee_minor) stored,
  currency text not null check (currency in ('EUR', 'USD', 'GBP')),
  destination_country text not null check (destination_country ~ '^[A-Z]{2}$'),
  tax_basis text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);
create index checkout_quotes_buyer_idx on public.checkout_quotes(buyer_id, created_at desc);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_id uuid not null references auth.users(id) on delete restrict,
  seller_id uuid not null references auth.users(id) on delete restrict,
  quote_id uuid not null references public.checkout_quotes(id) on delete restrict,
  idempotency_key uuid not null,
  item_amount_minor integer not null check (item_amount_minor > 0),
  shipping_amount_minor integer not null check (shipping_amount_minor >= 0),
  tax_amount_minor integer not null check (tax_amount_minor >= 0),
  protection_fee_minor integer not null check (protection_fee_minor >= 0),
  total_amount_minor integer not null check (total_amount_minor > 0),
  seller_net_minor integer not null check (seller_net_minor >= 0),
  currency text not null check (currency in ('EUR', 'USD', 'GBP')),
  shipping_address jsonb not null check (jsonb_typeof(shipping_address) = 'object'),
  status public.order_status not null default 'payment_pending',
  stripe_payment_intent_id text unique,
  stripe_charge_id text,
  stripe_transfer_id text unique,
  stripe_refund_id text,
  inspection_ends_at timestamptz,
  paid_at timestamptz,
  shipped_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (buyer_id, idempotency_key),
  check (buyer_id <> seller_id)
);
create index orders_buyer_idx on public.orders(buyer_id, created_at desc);
create index orders_seller_idx on public.orders(seller_id, created_at desc);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  from_status public.order_status,
  to_status public.order_status not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events(order_id, created_at);

create table public.shipments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  carrier text not null check (char_length(carrier) between 2 and 80),
  service text,
  tracking_number text not null check (char_length(tracking_number) between 3 and 120),
  tracking_url text,
  insured_amount_minor integer not null default 0 check (insured_amount_minor >= 0),
  delivered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_disputes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete cascade,
  opened_by uuid not null references auth.users(id) on delete restrict,
  reason public.dispute_reason not null,
  detail text not null check (char_length(trim(detail)) between 10 and 3000),
  status public.dispute_status not null default 'open',
  resolution public.dispute_resolution,
  refund_amount_minor integer check (refund_amount_minor is null or refund_amount_minor >= 0),
  assigned_to uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dispute_evidence (
  id uuid primary key default gen_random_uuid(),
  dispute_id uuid not null references public.order_disputes(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  object_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf')),
  byte_size integer not null check (byte_size between 1 and 20971520),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now()
);

create table public.marketplace_reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewee_id uuid not null references auth.users(id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  body text check (body is null or char_length(body) <= 1200),
  verified boolean not null default true,
  created_at timestamptz not null default now(),
  unique (order_id, reviewer_id),
  check (reviewer_id <> reviewee_id)
);

create table public.payment_webhook_events (
  id text primary key,
  event_type text not null,
  livemode boolean not null,
  object_id text,
  processing_status text not null default 'processing' check (processing_status in ('processing', 'processed', 'ignored', 'failed')),
  error_message text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

create or replace function private.is_conversation_member(target_conversation_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.marketplace_conversations c
    where c.id = target_conversation_id
      and (c.buyer_id = auth.uid() or c.seller_id = auth.uid() or private.is_staff())
  );
$$;

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

  select seller_id into target_seller
  from public.listings
  where id = target_listing_id and status in ('active', 'reserved', 'sold');

  if target_seller is null then raise exception 'Listing is not available'; end if;
  if target_seller = auth.uid() then raise exception 'You cannot message yourself'; end if;

  insert into public.marketplace_conversations (listing_id, buyer_id, seller_id)
  values (target_listing_id, auth.uid(), target_seller)
  on conflict (listing_id, buyer_id)
  do update set buyer_archived_at = null
  returning id into conversation_id;

  return conversation_id;
end;
$$;

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

  update public.listings
    set status = case when target_listing.category = 'saddle' and target_listing.price_minor >= 100000 then 'pending_review'::public.listing_status else 'active'::public.listing_status end,
        published_at = case when target_listing.category = 'saddle' and target_listing.price_minor >= 100000 then null else now() end,
        moderation_note = null
    where id = target_listing.id
    returning * into target_listing;

  return target_listing;
end;
$$;

create or replace function public.begin_checkout(target_quote_id uuid, request_key uuid, address jsonb)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_quote public.checkout_quotes;
  target_listing public.listings;
  target_seller public.seller_accounts;
  created_order public.orders;
  platform_fee integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if jsonb_typeof(address) <> 'object' or nullif(address ->> 'country', '') is null or nullif(address ->> 'postal_code', '') is null then
    raise exception 'A complete shipping address is required';
  end if;

  select * into created_order from public.orders where buyer_id = auth.uid() and idempotency_key = request_key;
  if created_order.id is not null then return created_order; end if;

  select * into target_quote from public.checkout_quotes where id = target_quote_id for update;
  if target_quote.id is null or target_quote.buyer_id <> auth.uid() then raise exception 'Checkout quote not found'; end if;
  if target_quote.expires_at <= now() or target_quote.consumed_at is not null then raise exception 'Checkout quote expired'; end if;

  select * into target_listing from public.listings where id = target_quote.listing_id for update;
  if target_listing.status <> 'active' then raise exception 'Listing is no longer available'; end if;
  if target_listing.seller_id = auth.uid() then raise exception 'You cannot buy your own listing'; end if;
  if target_listing.price_minor <> target_quote.item_amount_minor or target_listing.currency <> target_quote.currency then raise exception 'Listing price changed'; end if;

  select * into target_seller from public.seller_accounts where user_id = target_listing.seller_id;
  if target_seller.verification_status <> 'verified' or not target_seller.payouts_enabled then
    raise exception 'Seller payments are not ready';
  end if;

  platform_fee := target_quote.protection_fee_minor;
  insert into public.orders (
    listing_id, buyer_id, seller_id, quote_id, idempotency_key,
    item_amount_minor, shipping_amount_minor, tax_amount_minor, protection_fee_minor,
    total_amount_minor, seller_net_minor, currency, shipping_address
  ) values (
    target_listing.id, auth.uid(), target_listing.seller_id, target_quote.id, request_key,
    target_quote.item_amount_minor, target_quote.shipping_amount_minor, target_quote.tax_amount_minor, platform_fee,
    target_quote.total_amount_minor, target_quote.item_amount_minor + target_quote.shipping_amount_minor + target_quote.tax_amount_minor,
    target_quote.currency, address
  ) returning * into created_order;

  update public.checkout_quotes set consumed_at = now() where id = target_quote.id;
  update public.listings set status = 'reserved', reserved_until = now() + interval '30 minutes' where id = target_listing.id;
  return created_order;
end;
$$;

create or replace function private.valid_order_transition(old_status public.order_status, new_status public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select old_status = new_status or (old_status, new_status) in (
    ('payment_pending', 'processing_payment'), ('payment_pending', 'paid'), ('payment_pending', 'payment_failed'), ('payment_pending', 'canceled'),
    ('processing_payment', 'paid'), ('processing_payment', 'payment_failed'), ('processing_payment', 'canceled'),
    ('payment_failed', 'payment_pending'), ('payment_failed', 'canceled'),
    ('paid', 'seller_preparing'), ('paid', 'disputed'), ('paid', 'refund_pending'),
    ('seller_preparing', 'shipped'), ('seller_preparing', 'disputed'), ('seller_preparing', 'refund_pending'),
    ('shipped', 'inspection'), ('shipped', 'disputed'), ('shipped', 'refund_pending'),
    ('inspection', 'accepted'), ('inspection', 'disputed'),
    ('accepted', 'transfer_pending'), ('accepted', 'completed'),
    ('transfer_pending', 'completed'), ('transfer_pending', 'disputed'),
    ('disputed', 'refund_pending'), ('disputed', 'completed'),
    ('refund_pending', 'refunded'), ('refund_pending', 'disputed')
  );
$$;

create or replace function private.enforce_order_transition()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.valid_order_transition(old.status, new.status) then
    raise exception 'Invalid order transition from % to %', old.status, new.status;
  end if;
  return new;
end;
$$;

create or replace function private.record_order_event()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_events(order_id, actor_id, to_status) values (new.id, auth.uid(), new.status);
  elsif new.status is distinct from old.status then
    insert into public.order_events(order_id, actor_id, from_status, to_status) values (new.id, auth.uid(), old.status, new.status);
  end if;
  return new;
end;
$$;

create trigger seller_accounts_set_updated_at before update on public.seller_accounts for each row execute function private.set_updated_at();
create trigger listings_set_updated_at before update on public.listings for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders for each row execute function private.set_updated_at();
create trigger shipments_set_updated_at before update on public.shipments for each row execute function private.set_updated_at();
create trigger disputes_set_updated_at before update on public.order_disputes for each row execute function private.set_updated_at();
create trigger orders_transition before update of status on public.orders for each row execute function private.enforce_order_transition();
create trigger orders_event after insert or update of status on public.orders for each row execute function private.record_order_event();

alter table public.marketplace_category_rules enable row level security;
alter table public.marketplace_brands enable row level security;
alter table public.seller_accounts enable row level security;
alter table public.listings enable row level security;
alter table public.listing_photos enable row level security;
alter table public.listing_shipping_rates enable row level security;
alter table public.saved_listings enable row level security;
alter table public.marketplace_conversations enable row level security;
alter table public.marketplace_messages enable row level security;
alter table public.checkout_quotes enable row level security;
alter table public.orders enable row level security;
alter table public.order_events enable row level security;
alter table public.shipments enable row level security;
alter table public.order_disputes enable row level security;
alter table public.dispute_evidence enable row level security;
alter table public.marketplace_reviews enable row level security;
alter table public.payment_webhook_events enable row level security;

create policy category_rules_public_read on public.marketplace_category_rules for select to anon, authenticated using (true);
create policy brands_public_read on public.marketplace_brands for select to anon, authenticated using (true);
create policy seller_account_read_own on public.seller_accounts for select to authenticated using (user_id = auth.uid() or private.is_staff());

create policy listings_public_read on public.listings for select to anon, authenticated
using (status in ('active', 'reserved', 'sold') or seller_id = auth.uid() or private.is_staff());
create policy listings_create_draft on public.listings for insert to authenticated
with check (seller_id = auth.uid() and status = 'draft');
create policy listings_update_draft on public.listings for update to authenticated
using (seller_id = auth.uid() and status in ('draft', 'rejected'))
with check (seller_id = auth.uid() and status in ('draft', 'rejected'));
create policy listings_archive_own on public.listings for delete to authenticated
using (seller_id = auth.uid() and status in ('draft', 'rejected', 'archived'));

create policy listing_photos_public_read on public.listing_photos for select to anon, authenticated
using (exists (select 1 from public.listings l where l.id = listing_id));
create policy listing_photos_create_own on public.listing_photos for insert to authenticated
with check (uploaded_by = auth.uid() and exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid() and l.status in ('draft', 'rejected')));
create policy listing_photos_change_own on public.listing_photos for update to authenticated
using (uploaded_by = auth.uid() and exists (select 1 from public.listings l where l.id = listing_id and l.status in ('draft', 'rejected')))
with check (uploaded_by = auth.uid());
create policy listing_photos_delete_own on public.listing_photos for delete to authenticated using (uploaded_by = auth.uid());

create policy shipping_rates_public_read on public.listing_shipping_rates for select to anon, authenticated
using (exists (select 1 from public.listings l where l.id = listing_id));
create policy shipping_rates_manage_seller on public.listing_shipping_rates for all to authenticated
using (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid() and l.status in ('draft', 'active')))
with check (exists (select 1 from public.listings l where l.id = listing_id and l.seller_id = auth.uid() and l.status in ('draft', 'active')));

create policy saved_listings_manage_self on public.saved_listings for all to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy conversations_read_member on public.marketplace_conversations for select to authenticated
using (buyer_id = auth.uid() or seller_id = auth.uid() or private.is_staff());
create policy conversations_archive_member on public.marketplace_conversations for update to authenticated
using (buyer_id = auth.uid() or seller_id = auth.uid())
with check (buyer_id = auth.uid() or seller_id = auth.uid());

create policy messages_read_member on public.marketplace_messages for select to authenticated
using (private.is_conversation_member(conversation_id));
create policy messages_send_member on public.marketplace_messages for insert to authenticated
with check (sender_id = auth.uid() and private.is_conversation_member(conversation_id));
create policy messages_mark_read_member on public.marketplace_messages for update to authenticated
using (private.is_conversation_member(conversation_id))
with check (private.is_conversation_member(conversation_id));

create policy quotes_read_buyer on public.checkout_quotes for select to authenticated using (buyer_id = auth.uid());
create policy orders_read_participant on public.orders for select to authenticated using (buyer_id = auth.uid() or seller_id = auth.uid() or private.is_staff());
create policy order_events_read_participant on public.order_events for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or private.is_staff())));
create policy shipments_read_participant on public.shipments for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or private.is_staff())));
create policy shipments_seller_create on public.shipments for insert to authenticated
with check (exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid() and o.status in ('paid', 'seller_preparing')));
create policy shipments_seller_update on public.shipments for update to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid() and o.status in ('seller_preparing', 'shipped')))
with check (exists (select 1 from public.orders o where o.id = order_id and o.seller_id = auth.uid()));

create policy disputes_read_participant on public.order_disputes for select to authenticated
using (exists (select 1 from public.orders o where o.id = order_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or private.is_staff())));
create policy dispute_evidence_read_participant on public.dispute_evidence for select to authenticated
using (exists (select 1 from public.order_disputes d join public.orders o on o.id = d.order_id where d.id = dispute_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid() or private.is_staff())));
create policy dispute_evidence_create_participant on public.dispute_evidence for insert to authenticated
with check (uploaded_by = auth.uid() and exists (select 1 from public.order_disputes d join public.orders o on o.id = d.order_id where d.id = dispute_id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())));

create policy reviews_public_read on public.marketplace_reviews for select to anon, authenticated using (true);
create policy reviews_create_verified on public.marketplace_reviews for insert to authenticated
with check (
  reviewer_id = auth.uid()
  and exists (
    select 1 from public.orders o where o.id = order_id and o.status = 'completed'
      and ((o.buyer_id = reviewer_id and o.seller_id = reviewee_id) or (o.seller_id = reviewer_id and o.buyer_id = reviewee_id))
  )
);

grant select on public.marketplace_category_rules, public.marketplace_brands, public.listings, public.listing_photos, public.listing_shipping_rates, public.marketplace_reviews to anon, authenticated;
grant select on public.seller_accounts to authenticated;
grant insert, update, delete on public.listings, public.listing_photos, public.listing_shipping_rates, public.saved_listings to authenticated;
grant select on public.saved_listings, public.marketplace_conversations, public.marketplace_messages, public.checkout_quotes, public.orders, public.order_events, public.shipments, public.order_disputes, public.dispute_evidence to authenticated;
grant update on public.marketplace_conversations to authenticated;
grant insert, update on public.marketplace_messages to authenticated;
grant insert, update on public.shipments to authenticated;
grant insert on public.dispute_evidence, public.marketplace_reviews to authenticated;
grant execute on function public.create_marketplace_conversation(uuid) to authenticated;
grant execute on function public.publish_listing(uuid) to authenticated;
grant execute on function public.begin_checkout(uuid, uuid, jsonb) to authenticated;
grant execute on function private.is_conversation_member(uuid) to authenticated;

revoke execute on function public.create_marketplace_conversation(uuid) from public, anon;
revoke execute on function public.publish_listing(uuid) from public, anon;
revoke execute on function public.begin_checkout(uuid, uuid, jsonb) from public, anon;

insert into public.marketplace_category_rules(category, required_photo_angles, permits_for_parts, safety_notice) values
  ('saddle', '["left_side","right_side","tree_headplate","panels","billets","seat","serial_number"]', true, 'High-value saddles require identity verification and ownership evidence.'),
  ('bridle', '["front","buckles","bit_attachment","wear_closeup"]', true, null),
  ('bit', '["front","side","markings"]', true, null),
  ('girth', '["front","elastic","buckles","wear_closeup"]', true, null),
  ('stirrup', '["pair","treads","hinges_or_safety_release"]', true, 'Safety releases must be photographed clearly.'),
  ('boot', '["pair","soles","zippers_or_closures","wear_closeup"]', true, null),
  ('pad', '["top","underside","binding","wear_closeup"]', true, null),
  ('blanket', '["front","inside","straps","wear_closeup"]', true, null),
  ('helmet', '["front","inside_label","certification","shell_closeup"]', false, 'Used helmets with impact history or expired certification are prohibited.'),
  ('apparel', '["front","back","label","wear_closeup"]', true, null),
  ('grooming', '["set","labels","wear_closeup"]', true, null),
  ('training_aid', '["full_item","hardware","wear_closeup"]', true, null),
  ('transport', '["full_item","connectors","safety_labels","wear_closeup"]', true, 'Structural and safety damage must be disclosed.')
on conflict (category) do update set required_photo_angles = excluded.required_photo_angles, permits_for_parts = excluded.permits_for_parts, safety_notice = excluded.safety_notice;

insert into public.marketplace_brands(name, is_verified) values
  ('Antares', true), ('Childeric', true), ('CWD', true), ('Devoucoux', true), ('Passier', true), ('Stubben', true), ('Prestige', true),
  ('Kentucky', true), ('Parlanti', true), ('Sprenger', true), ('Horseware', true), ('Freejump', true)
on conflict (name) do nothing;

commit;
