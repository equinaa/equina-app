begin;

create function public.complete_order_transfer(target_order_id uuid, transfer_id text)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
begin
  if nullif(trim(transfer_id), '') is null then raise exception 'Transfer ID is required'; end if;
  select * into target_order from public.orders where id = target_order_id for update;
  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_order.status = 'completed' and target_order.stripe_transfer_id = transfer_id then return target_order; end if;
  if target_order.status not in ('accepted', 'transfer_pending', 'disputed') then raise exception 'Order cannot be completed from its current state'; end if;

  update public.orders set
    status = 'completed',
    stripe_transfer_id = transfer_id,
    completed_at = coalesce(completed_at, now())
  where id = target_order.id
  returning * into target_order;

  update public.listings set status = 'sold', reserved_until = null where id = target_order.listing_id;
  return target_order;
end;
$$;

revoke execute on function public.complete_order_transfer(uuid, text) from public, anon, authenticated;
grant execute on function public.complete_order_transfer(uuid, text) to service_role;

commit;
