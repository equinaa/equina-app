begin;

create type public.marketplace_report_reason as enum ('scam', 'counterfeit', 'unsafe_item', 'harassment', 'spam', 'prohibited_item', 'other');

drop policy collaborators_manage_owner on public.horse_collaborators;
create policy collaborators_manage_owner on public.horse_collaborators for all to authenticated
using (exists (select 1 from public.horses h where h.id = horse_id and h.owner_id = auth.uid()))
with check (invited_by = auth.uid() and exists (select 1 from public.horses h where h.id = horse_id and h.owner_id = auth.uid()));
create policy collaborators_accept_self on public.horse_collaborators for update to authenticated
using (user_id = auth.uid() and accepted_at is null)
with check (user_id = auth.uid() and accepted_at is not null);
revoke update on public.horse_collaborators from authenticated;
grant update (accepted_at) on public.horse_collaborators to authenticated;

create table public.marketplace_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  listing_id uuid references public.listings(id) on delete cascade,
  message_id uuid references public.marketplace_messages(id) on delete cascade,
  reported_user_id uuid references auth.users(id) on delete cascade,
  reason public.marketplace_report_reason not null,
  detail text check (detail is null or char_length(detail) <= 1200),
  status public.report_status not null default 'open',
  assigned_to uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  check (num_nonnulls(listing_id, message_id, reported_user_id) = 1),
  check (reported_user_id is null or reported_user_id <> reporter_id)
);
create index marketplace_reports_queue_idx on public.marketplace_reports(status, created_at);
create unique index marketplace_report_listing_once on public.marketplace_reports(reporter_id, listing_id) where listing_id is not null and status in ('open', 'reviewing');
create unique index marketplace_report_message_once on public.marketplace_reports(reporter_id, message_id) where message_id is not null and status in ('open', 'reviewing');

alter table public.marketplace_reports enable row level security;
create policy marketplace_reports_read on public.marketplace_reports for select to authenticated
using (reporter_id = auth.uid() or private.is_staff());
create policy marketplace_reports_create on public.marketplace_reports for insert to authenticated
with check (
  reporter_id = auth.uid()
  and (
    (listing_id is not null and exists (select 1 from public.listings l where l.id = listing_id))
    or (message_id is not null and exists (
      select 1 from public.marketplace_messages m where m.id = message_id and private.is_conversation_member(m.conversation_id)
    ))
    or (reported_user_id is not null and exists (
      select 1 from public.marketplace_conversations c
      where (c.buyer_id = auth.uid() and c.seller_id = reported_user_id)
         or (c.seller_id = auth.uid() and c.buyer_id = reported_user_id)
    ))
  )
);
create policy marketplace_reports_staff_update on public.marketplace_reports for update to authenticated
using (private.is_staff()) with check (private.is_staff());
grant select, insert, update on public.marketplace_reports to authenticated;

create or replace function public.archive_listing(target_listing_id uuid)
returns public.listings
language plpgsql
security definer
set search_path = ''
as $$
declare target_listing public.listings;
begin
  select * into target_listing from public.listings where id = target_listing_id for update;
  if target_listing.id is null then raise exception 'Listing not found'; end if;
  if target_listing.seller_id <> auth.uid() then raise exception 'Only the seller can archive this listing'; end if;
  if target_listing.status in ('reserved', 'sold') or exists (
    select 1 from public.orders o where o.listing_id = target_listing.id and o.status not in ('payment_failed', 'refunded', 'canceled', 'completed')
  ) then raise exception 'Listing has an active order'; end if;
  update public.listings set status = 'archived', reserved_until = null where id = target_listing.id returning * into target_listing;
  return target_listing;
end;
$$;

revoke execute on function public.archive_listing(uuid) from public, anon;
grant execute on function public.archive_listing(uuid) to authenticated;

commit;

