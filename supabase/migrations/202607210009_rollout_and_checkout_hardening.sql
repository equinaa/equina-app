begin;

create or replace function private.rollout_bucket(target_user uuid, flag_key text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select mod(
    (('x' || substr(encode(extensions.digest(convert_to(target_user::text || ':' || flag_key, 'UTF8'), 'sha256'), 'hex'), 1, 8))::bit(32)::bigint),
    100
  )::smallint;
$$;

create or replace function private.feature_enabled(flag_key text, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    target_user is not null
    and f.enabled
    and f.rollout_percent > 0
    and (f.rollout_percent = 100 or private.rollout_bucket(target_user, f.key) < f.rollout_percent),
    false
  )
  from public.app_feature_flags f
  where f.key = flag_key;
$$;

create or replace function public.current_feature_flags()
returns table(key text, enabled boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select f.key, private.feature_enabled(f.key, auth.uid())
  from public.app_feature_flags f
  order by f.key;
$$;

revoke execute on function private.rollout_bucket(uuid, text) from public, anon;
revoke execute on function private.feature_enabled(text, uuid) from public, anon;
revoke execute on function public.current_feature_flags() from public, anon;
grant execute on function private.rollout_bucket(uuid, text) to authenticated;
grant execute on function private.feature_enabled(text, uuid) to authenticated;
grant execute on function public.current_feature_flags() to authenticated;

create policy horses_insert_feature_gate on public.horses as restrictive for insert to authenticated
with check (private.feature_enabled('horse_management'));
create policy horses_update_feature_gate on public.horses as restrictive for update to authenticated
using (private.feature_enabled('horse_management'))
with check (private.feature_enabled('horse_management'));
create policy collaborators_insert_feature_gate on public.horse_collaborators as restrictive for insert to authenticated
with check (private.feature_enabled('horse_management'));
create policy collaborators_update_feature_gate on public.horse_collaborators as restrictive for update to authenticated
using (private.feature_enabled('horse_management'))
with check (private.feature_enabled('horse_management'));
create policy records_insert_feature_gate on public.horse_records as restrictive for insert to authenticated
with check (private.feature_enabled('record_mutations'));
create policy records_update_feature_gate on public.horse_records as restrictive for update to authenticated
using (private.feature_enabled('record_mutations'))
with check (private.feature_enabled('record_mutations'));
create policy record_files_insert_feature_gate on public.horse_record_files as restrictive for insert to authenticated
with check (private.feature_enabled('record_mutations'));

create policy memberships_insert_feature_gate on public.club_memberships as restrictive for insert to authenticated
with check (private.feature_enabled('club_interactions'));
create policy posts_insert_feature_gate on public.club_posts as restrictive for insert to authenticated
with check (private.feature_enabled('club_publishing'));
create policy posts_update_feature_gate on public.club_posts as restrictive for update to authenticated
using (private.feature_enabled('club_publishing'))
with check (private.feature_enabled('club_publishing'));
create policy post_media_insert_feature_gate on public.club_post_media as restrictive for insert to authenticated
with check (private.feature_enabled('club_publishing'));
create policy comments_insert_feature_gate on public.club_comments as restrictive for insert to authenticated
with check (private.feature_enabled('club_interactions'));
create policy comments_update_feature_gate on public.club_comments as restrictive for update to authenticated
using (private.feature_enabled('club_interactions'))
with check (private.feature_enabled('club_interactions'));
create policy reactions_insert_feature_gate on public.club_reactions as restrictive for insert to authenticated
with check (private.feature_enabled('club_interactions'));
create policy reactions_update_feature_gate on public.club_reactions as restrictive for update to authenticated
using (private.feature_enabled('club_interactions'))
with check (private.feature_enabled('club_interactions'));

create policy listings_insert_feature_gate on public.listings as restrictive for insert to authenticated
with check (private.feature_enabled('shop_listing_creation'));
create policy listings_update_feature_gate on public.listings as restrictive for update to authenticated
using (private.feature_enabled('shop_listing_creation'))
with check (private.feature_enabled('shop_listing_creation'));
create policy listing_photos_insert_feature_gate on public.listing_photos as restrictive for insert to authenticated
with check (private.feature_enabled('shop_listing_creation'));
create policy listing_photos_update_feature_gate on public.listing_photos as restrictive for update to authenticated
using (private.feature_enabled('shop_listing_creation'))
with check (private.feature_enabled('shop_listing_creation'));
create policy shipping_rates_insert_feature_gate on public.listing_shipping_rates as restrictive for insert to authenticated
with check (private.feature_enabled('shop_listing_creation'));
create policy shipping_rates_update_feature_gate on public.listing_shipping_rates as restrictive for update to authenticated
using (private.feature_enabled('shop_listing_creation'))
with check (private.feature_enabled('shop_listing_creation'));
create policy messages_insert_feature_gate on public.marketplace_messages as restrictive for insert to authenticated
with check (private.feature_enabled('shop_messaging'));

create or replace function private.protect_horse_owner_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and auth.uid() <> old.owner_id and (
    new.is_primary is distinct from old.is_primary
    or new.archived_at is distinct from old.archived_at
  ) then
    raise exception 'Only the horse owner can change primary or archive state';
  end if;
  return new;
end;
$$;

create trigger horses_protect_owner_fields before update on public.horses
for each row execute function private.protect_horse_owner_fields();

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
  if not private.feature_enabled('shop_messaging') then raise exception 'Messaging is not enabled for this account'; end if;

  select seller_id into target_seller
  from public.listings
  where id = target_listing_id and status in ('active', 'reserved', 'sold');

  if target_seller is null then raise exception 'Listing is not available'; end if;
  if target_seller = auth.uid() then raise exception 'You cannot message yourself'; end if;
  if exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = auth.uid() and b.blocked_id = target_seller)
       or (b.blocker_id = target_seller and b.blocked_id = auth.uid())
  ) then raise exception 'Messaging is unavailable for this account'; end if;

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

  update public.listings
    set status = case when target_listing.category = 'saddle' and target_listing.price_minor >= 100000 then 'pending_review'::public.listing_status else 'active'::public.listing_status end,
        published_at = case when target_listing.category = 'saddle' and target_listing.price_minor >= 100000 then null else now() end,
        moderation_note = null
    where id = target_listing.id
    returning * into target_listing;

  return target_listing;
end;
$$;

alter table public.orders add column marketplace_terms_version text;
alter table public.orders add column terms_accepted_at timestamptz;
update public.orders set marketplace_terms_version = 'legacy', terms_accepted_at = created_at
where marketplace_terms_version is null or terms_accepted_at is null;
alter table public.orders alter column marketplace_terms_version set not null;
alter table public.orders alter column terms_accepted_at set not null;
alter table public.orders add constraint orders_terms_version_valid
check (char_length(marketplace_terms_version) between 1 and 80);

drop function public.begin_checkout(uuid, uuid, jsonb);
create function public.begin_checkout(target_quote_id uuid, request_key uuid, address jsonb, accepted_terms_version text)
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
  if not private.feature_enabled('shop_transactions') then raise exception 'Checkout is not enabled for this account'; end if;
  if nullif(trim(accepted_terms_version), '') is null then raise exception 'Marketplace terms must be accepted'; end if;
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
    total_amount_minor, seller_net_minor, currency, shipping_address,
    marketplace_terms_version, terms_accepted_at
  ) values (
    target_listing.id, auth.uid(), target_listing.seller_id, target_quote.id, request_key,
    target_quote.item_amount_minor, target_quote.shipping_amount_minor, target_quote.tax_amount_minor, platform_fee,
    target_quote.total_amount_minor, target_quote.item_amount_minor + target_quote.shipping_amount_minor + target_quote.tax_amount_minor,
    target_quote.currency, address, trim(accepted_terms_version), now()
  ) returning * into created_order;

  update public.checkout_quotes set consumed_at = now() where id = target_quote.id;
  update public.listings set status = 'reserved', reserved_until = now() + interval '30 minutes' where id = target_listing.id;
  return created_order;
end;
$$;

revoke execute on function public.begin_checkout(uuid, uuid, jsonb, text) from public, anon;
grant execute on function public.begin_checkout(uuid, uuid, jsonb, text) to authenticated;

revoke delete on public.horses, public.horse_records, public.horse_record_files,
  public.club_posts, public.club_post_media, public.listings, public.listing_photos,
  public.dispute_evidence from authenticated;
revoke insert, update on public.shipments from authenticated;

commit;
