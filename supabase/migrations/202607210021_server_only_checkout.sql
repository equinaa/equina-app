begin;

drop function public.begin_checkout(uuid, uuid, jsonb, text);

create function public.begin_checkout_for_user(
  target_buyer_id uuid,
  target_quote_id uuid,
  request_key uuid,
  address jsonb,
  accepted_terms_version text
)
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
  if target_buyer_id is null then raise exception 'Buyer is required'; end if;
  if private.is_user_suspended(target_buyer_id) then raise exception 'This account is temporarily restricted'; end if;
  if not private.feature_enabled('shop_transactions', target_buyer_id) then raise exception 'Checkout is not enabled for this account'; end if;
  if nullif(trim(accepted_terms_version), '') is null then raise exception 'Marketplace terms must be accepted'; end if;
  if jsonb_typeof(address) <> 'object' or nullif(address ->> 'country', '') is null or nullif(address ->> 'postal_code', '') is null then
    raise exception 'A complete shipping address is required';
  end if;

  select * into created_order from public.orders where buyer_id = target_buyer_id and idempotency_key = request_key;
  if created_order.id is not null then return created_order; end if;

  select * into target_quote from public.checkout_quotes where id = target_quote_id for update;
  if target_quote.id is null or target_quote.buyer_id <> target_buyer_id then raise exception 'Checkout quote not found'; end if;
  if target_quote.expires_at <= now() or target_quote.consumed_at is not null then raise exception 'Checkout quote expired'; end if;

  select * into target_listing from public.listings where id = target_quote.listing_id for update;
  if target_listing.status <> 'active' then raise exception 'Listing is no longer available'; end if;
  if target_listing.seller_id = target_buyer_id then raise exception 'You cannot buy your own listing'; end if;
  if private.is_user_suspended(target_listing.seller_id) then raise exception 'Seller is temporarily unavailable'; end if;
  if target_listing.price_minor <> target_quote.item_amount_minor or target_listing.currency <> target_quote.currency then raise exception 'Listing price changed'; end if;

  select * into target_seller from public.seller_accounts where user_id = target_listing.seller_id;
  if target_seller.verification_status <> 'verified' or not target_seller.payouts_enabled then
    raise exception 'Seller payments are not ready';
  end if;

  platform_fee := target_quote.protection_fee_minor;
  insert into public.orders (
    listing_id, buyer_id, seller_id, quote_id, idempotency_key,
    item_amount_minor, shipping_amount_minor, tax_amount_minor, protection_fee_minor,
    total_amount_minor, seller_net_minor, currency, shipping_address,
    marketplace_terms_version, terms_accepted_at
  ) values (
    target_listing.id, target_buyer_id, target_listing.seller_id, target_quote.id, request_key,
    target_quote.item_amount_minor, target_quote.shipping_amount_minor, target_quote.tax_amount_minor, platform_fee,
    target_quote.total_amount_minor, target_quote.item_amount_minor + target_quote.shipping_amount_minor + target_quote.tax_amount_minor,
    target_quote.currency, address, trim(accepted_terms_version), now()
  ) returning * into created_order;

  update public.checkout_quotes set consumed_at = now() where id = target_quote.id;
  update public.listings set status = 'reserved', reserved_until = now() + interval '30 minutes' where id = target_listing.id;
  return created_order;
end;
$$;

revoke execute on function public.begin_checkout_for_user(uuid, uuid, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function public.begin_checkout_for_user(uuid, uuid, uuid, jsonb, text) to service_role;

commit;
