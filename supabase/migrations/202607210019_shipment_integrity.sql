begin;

create or replace function public.mark_order_shipped(target_order_id uuid, carrier_name text, tracking_code text, tracking_link text default null)
returns public.orders
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_order public.orders;
  shipping_service text;
  insured_amount integer;
begin
  select * into target_order from public.orders where id = target_order_id for update;
  if target_order.id is null then raise exception 'Order not found'; end if;
  if target_order.seller_id <> auth.uid() then raise exception 'Only the seller can add shipment details'; end if;
  if target_order.status not in ('paid', 'seller_preparing') then raise exception 'Order is not ready to ship'; end if;
  if char_length(trim(carrier_name)) < 2 or char_length(trim(tracking_code)) < 3 then raise exception 'Carrier and tracking number are required'; end if;
  if nullif(trim(tracking_link), '') is not null and trim(tracking_link) !~ '^https://' then raise exception 'Tracking URL must use HTTPS'; end if;

  select r.service_name, r.insured_up_to_minor into shipping_service, insured_amount
  from public.checkout_quotes q
  join public.listing_shipping_rates r on r.id = q.shipping_rate_id
  where q.id = target_order.quote_id;

  insert into public.shipments(order_id, carrier, service, tracking_number, tracking_url, insured_amount_minor)
  values (
    target_order.id, trim(carrier_name), shipping_service, trim(tracking_code),
    nullif(trim(tracking_link), ''), coalesce(insured_amount, 0)
  )
  on conflict (order_id) do update set
    carrier = excluded.carrier,
    service = excluded.service,
    tracking_number = excluded.tracking_number,
    tracking_url = excluded.tracking_url,
    insured_amount_minor = excluded.insured_amount_minor;

  update public.orders set status = 'shipped', shipped_at = now()
  where id = target_order.id returning * into target_order;
  return target_order;
end;
$$;

commit;
