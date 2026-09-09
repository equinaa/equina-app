begin;

create type public.upload_kind as enum ('avatar', 'horse_photo', 'horse_record', 'club_post', 'listing_photo', 'dispute_evidence');
create type public.upload_status as enum ('issued', 'uploaded', 'completed', 'expired', 'canceled');

create table public.upload_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind public.upload_kind not null,
  entity_id uuid not null,
  bucket_id text not null,
  object_path text not null unique,
  original_name text not null check (char_length(original_name) between 1 and 180),
  mime_type text not null,
  byte_size integer not null check (byte_size between 1 and 52428800),
  status public.upload_status not null default 'issued',
  expires_at timestamptz not null default (now() + interval '15 minutes'),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index upload_tickets_user_idx on public.upload_tickets(user_id, created_at desc);

create table public.app_feature_flags (
  key text primary key check (key in ('record_mutations', 'horse_management', 'club_publishing', 'club_interactions', 'shop_listing_creation', 'shop_messaging', 'shop_transactions')),
  enabled boolean not null default false,
  rollout_percent smallint not null default 0 check (rollout_percent between 0 and 100),
  note text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.upload_tickets enable row level security;
alter table public.app_feature_flags enable row level security;

create policy upload_tickets_read_self on public.upload_tickets for select to authenticated
using (user_id = auth.uid());
create policy feature_flags_read on public.app_feature_flags for select to anon, authenticated using (true);
create policy feature_flags_staff_manage on public.app_feature_flags for all to authenticated
using (private.has_role('admin')) with check (private.has_role('admin'));

grant select on public.upload_tickets to authenticated;
grant select on public.app_feature_flags to anon, authenticated;
grant insert, update, delete on public.app_feature_flags to authenticated;

insert into public.app_feature_flags(key, enabled, rollout_percent, note) values
  ('record_mutations', false, 0, 'Enable after authenticated upload and deletion QA.'),
  ('horse_management', false, 0, 'Enable after account recovery and ownership QA.'),
  ('club_publishing', false, 0, 'Enable after report and moderation operations pass.'),
  ('club_interactions', false, 0, 'Enable after realtime and block flows pass.'),
  ('shop_listing_creation', false, 0, 'Enable after seller onboarding and media review pass.'),
  ('shop_messaging', false, 0, 'Enable after report, block, and delivery-state QA.'),
  ('shop_transactions', false, 0, 'Enable only after live payment, webhook, tax, shipping, and legal sign-off.')
on conflict (key) do nothing;

create or replace function private.valid_order_transition(old_status public.order_status, new_status public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select old_status = new_status or (old_status, new_status) in (
    ('payment_pending', 'processing_payment'), ('payment_pending', 'paid'), ('payment_pending', 'payment_failed'), ('payment_pending', 'canceled'),
    ('processing_payment', 'paid'), ('processing_payment', 'payment_failed'), ('processing_payment', 'canceled'),
    ('payment_failed', 'payment_pending'), ('payment_failed', 'canceled'),
    ('paid', 'seller_preparing'), ('paid', 'shipped'), ('paid', 'disputed'), ('paid', 'refund_pending'),
    ('seller_preparing', 'shipped'), ('seller_preparing', 'disputed'), ('seller_preparing', 'refund_pending'),
    ('shipped', 'inspection'), ('shipped', 'disputed'), ('shipped', 'refund_pending'),
    ('inspection', 'accepted'), ('inspection', 'disputed'),
    ('accepted', 'transfer_pending'), ('accepted', 'completed'),
    ('transfer_pending', 'completed'), ('transfer_pending', 'disputed'),
    ('completed', 'disputed'), ('completed', 'refund_pending'),
    ('disputed', 'refund_pending'), ('disputed', 'completed'),
    ('refund_pending', 'refunded'), ('refund_pending', 'disputed')
  );
$$;

create or replace function public.mark_order_shipped(target_order_id uuid, carrier_name text, tracking_code text, tracking_link text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
begin
  select * into target_order from public.orders where id = target_order_id for update;
  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_order.seller_id <> auth.uid() then raise exception 'Only the seller can add shipment details'; end if;
  if target_order.status not in ('paid', 'seller_preparing') then raise exception 'Order is not ready to ship'; end if;
  if char_length(trim(carrier_name)) < 2 or char_length(trim(tracking_code)) < 3 then raise exception 'Carrier and tracking number are required'; end if;

  insert into public.shipments(order_id, carrier, tracking_number, tracking_url)
  values (target_order.id, trim(carrier_name), trim(tracking_code), nullif(trim(tracking_link), ''))
  on conflict (order_id) do update set
    carrier = excluded.carrier,
    tracking_number = excluded.tracking_number,
    tracking_url = excluded.tracking_url;

  update public.orders set status = 'shipped', shipped_at = now() where id = target_order.id returning * into target_order;
  return target_order;
end;
$$;

create or replace function public.start_order_inspection(target_order_id uuid)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
begin
  select * into target_order from public.orders where id = target_order_id for update;
  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_order.buyer_id <> auth.uid() and not private.is_staff() then raise exception 'Only the buyer can confirm delivery'; end if;
  if target_order.status <> 'shipped' then raise exception 'Order must be shipped first'; end if;

  update public.shipments set delivered_at = coalesce(delivered_at, now()) where order_id = target_order.id;
  update public.orders
    set status = 'inspection', inspection_ends_at = now() + interval '5 days'
    where id = target_order.id
    returning * into target_order;
  return target_order;
end;
$$;

create or replace function public.create_order_dispute(target_order_id uuid, dispute_reason public.dispute_reason, dispute_detail text)
returns public.order_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
  created_dispute public.order_disputes;
begin
  select * into target_order from public.orders where id = target_order_id for update;
  if target_order.id is null then raise exception 'Order not found'; end if;
  if auth.uid() not in (target_order.buyer_id, target_order.seller_id) then raise exception 'Only order participants can open a dispute'; end if;
  if target_order.status not in ('paid', 'seller_preparing', 'shipped', 'inspection', 'completed') then raise exception 'This order cannot be disputed now'; end if;
  if target_order.buyer_id = auth.uid() and target_order.inspection_ends_at is not null and now() > target_order.inspection_ends_at then
    raise exception 'The inspection window has ended';
  end if;

  insert into public.order_disputes(order_id, opened_by, reason, detail)
  values (target_order.id, auth.uid(), dispute_reason, trim(dispute_detail))
  on conflict (order_id) do update set detail = public.order_disputes.detail
  returning * into created_dispute;

  update public.orders set status = 'disputed' where id = target_order.id and status <> 'disputed';
  return created_dispute;
end;
$$;

revoke execute on function public.mark_order_shipped(uuid, text, text, text) from public, anon;
revoke execute on function public.start_order_inspection(uuid) from public, anon;
revoke execute on function public.create_order_dispute(uuid, public.dispute_reason, text) from public, anon;
grant execute on function public.mark_order_shipped(uuid, text, text, text) to authenticated;
grant execute on function public.start_order_inspection(uuid) to authenticated;
grant execute on function public.create_order_dispute(uuid, public.dispute_reason, text) to authenticated;

commit;

