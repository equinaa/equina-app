begin;

drop policy listings_public_read on public.listings;
create policy listings_public_read on public.listings for select to anon, authenticated
using (
  status in ('active', 'reserved', 'sold')
  or seller_id = auth.uid()
  or private.is_staff()
  or exists (
    select 1 from public.marketplace_conversations c
    where c.listing_id = id and (c.buyer_id = auth.uid() or c.seller_id = auth.uid())
  )
  or exists (
    select 1 from public.orders o
    where o.listing_id = id and (o.buyer_id = auth.uid() or o.seller_id = auth.uid())
  )
);

commit;
