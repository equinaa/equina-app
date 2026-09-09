begin;

alter table public.payment_webhook_events add column attempts smallint not null default 1 check (attempts between 1 and 50);
alter table public.payment_webhook_events add column processing_started_at timestamptz not null default now();

alter table public.order_disputes add column source text not null default 'participant' check (source in ('participant', 'payment_processor'));
alter table public.order_disputes add column external_dispute_id text unique;

create or replace function private.valid_order_transition(old_status public.order_status, new_status public.order_status)
returns boolean language sql immutable set search_path = '' as $$
  select old_status = new_status or (old_status, new_status) in (
    ('payment_pending', 'processing_payment'), ('payment_pending', 'paid'), ('payment_pending', 'payment_failed'), ('payment_pending', 'canceled'),
    ('processing_payment', 'paid'), ('processing_payment', 'payment_failed'), ('processing_payment', 'canceled'),
    ('payment_failed', 'payment_pending'), ('payment_failed', 'paid'), ('payment_failed', 'canceled'),
    ('paid', 'seller_preparing'), ('paid', 'shipped'), ('paid', 'disputed'), ('paid', 'refund_pending'),
    ('seller_preparing', 'shipped'), ('seller_preparing', 'disputed'), ('seller_preparing', 'refund_pending'),
    ('shipped', 'inspection'), ('shipped', 'disputed'), ('shipped', 'refund_pending'),
    ('inspection', 'accepted'), ('inspection', 'disputed'), ('inspection', 'refund_pending'),
    ('accepted', 'transfer_pending'), ('accepted', 'completed'), ('accepted', 'disputed'), ('accepted', 'refund_pending'),
    ('transfer_pending', 'completed'), ('transfer_pending', 'disputed'), ('transfer_pending', 'refund_pending'),
    ('completed', 'disputed'), ('completed', 'refund_pending'),
    ('disputed', 'refund_pending'), ('disputed', 'completed'),
    ('refund_pending', 'refunded'), ('refund_pending', 'completed'), ('refund_pending', 'disputed')
  );
$$;

create function public.finalize_dispute_refund(
  target_dispute_id uuid,
  refund_id text,
  refund_amount integer,
  is_partial boolean
)
returns public.order_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_dispute public.order_disputes;
  target_order public.orders;
begin
  select * into target_dispute from public.order_disputes where id = target_dispute_id for update;
  if target_dispute.id is null then raise exception 'Dispute not found'; end if;
  select * into target_order from public.orders where id = target_dispute.order_id for update;
  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_dispute.status = 'resolved' and target_order.stripe_refund_id = refund_id then return target_dispute; end if;
  if target_dispute.resolution not in ('partial_refund', 'return_refund', 'full_refund') then raise exception 'Dispute is not a refund decision'; end if;
  if refund_amount < 1 or refund_amount > target_order.total_amount_minor then raise exception 'Invalid refund amount'; end if;

  update public.orders set
    status = case when is_partial then 'completed'::public.order_status else 'refunded'::public.order_status end,
    stripe_refund_id = refund_id,
    completed_at = case when is_partial then coalesce(completed_at, now()) else completed_at end
  where id = target_order.id;

  update public.listings set
    status = case when is_partial then 'sold'::public.listing_status else 'archived'::public.listing_status end,
    reserved_until = null
  where id = target_order.listing_id;

  update public.order_disputes set
    status = 'resolved',
    refund_amount_minor = refund_amount,
    resolved_at = now()
  where id = target_dispute.id
  returning * into target_dispute;
  return target_dispute;
end;
$$;

create function public.finalize_dispute_release(target_dispute_id uuid, transfer_id text)
returns public.order_disputes
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_dispute public.order_disputes;
  target_order public.orders;
begin
  select * into target_dispute from public.order_disputes where id = target_dispute_id for update;
  if target_dispute.id is null then raise exception 'Dispute not found'; end if;
  select * into target_order from public.orders where id = target_dispute.order_id for update;
  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_dispute.status = 'resolved' and target_order.stripe_transfer_id = transfer_id then return target_dispute; end if;
  if target_dispute.resolution not in ('release', 'dismissed') then raise exception 'Dispute is not a release decision'; end if;

  update public.orders set status = 'completed', stripe_transfer_id = transfer_id, completed_at = coalesce(completed_at, now())
  where id = target_order.id;
  update public.listings set status = 'sold', reserved_until = null where id = target_order.listing_id;
  update public.order_disputes set status = 'resolved', resolved_at = now()
  where id = target_dispute.id returning * into target_dispute;
  return target_dispute;
end;
$$;

revoke execute on function public.finalize_dispute_refund(uuid, text, integer, boolean) from public, anon, authenticated;
revoke execute on function public.finalize_dispute_release(uuid, text) from public, anon, authenticated;
grant execute on function public.finalize_dispute_refund(uuid, text, integer, boolean) to service_role;
grant execute on function public.finalize_dispute_release(uuid, text) to service_role;

commit;
