begin;

create unique index listing_risk_signal_active_once
on public.listing_risk_signals(listing_id, signal)
where resolved_at is null;

create or replace function private.screen_listing_risk()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_age interval;
  recent_listings integer;
  comparable_count integer;
  median_price numeric;
begin
  if old.status not in ('draft', 'rejected') or new.status <> 'pending_review' or old.status = new.status then return new; end if;

  select now() - u.created_at into account_age from auth.users u where u.id = new.seller_id;
  if new.price_minor >= 100000 and account_age < interval '30 days' then
    insert into public.listing_risk_signals(listing_id, signal, severity, detail)
    values (new.id, 'new_account_high_value', 'high', jsonb_build_object('account_age_days', extract(day from account_age)))
    on conflict (listing_id, signal) where resolved_at is null do nothing;
  end if;

  select count(*) into recent_listings from public.listings l
  where l.seller_id = new.seller_id and l.id <> new.id and l.created_at > now() - interval '24 hours';
  if recent_listings >= 10 then
    insert into public.listing_risk_signals(listing_id, signal, severity, detail)
    values (new.id, 'suspicious_velocity', 'high', jsonb_build_object('prior_24h_listings', recent_listings))
    on conflict (listing_id, signal) where resolved_at is null do nothing;
  end if;

  select count(*), percentile_cont(0.5) within group (order by l.price_minor)
    into comparable_count, median_price
  from public.listings l
  where l.status = 'sold' and l.category = new.category
    and lower(l.brand_name) = lower(new.brand_name) and l.currency = new.currency;
  if comparable_count >= 5 and median_price > 0 and new.price_minor < median_price * 0.55 then
    insert into public.listing_risk_signals(listing_id, signal, severity, detail)
    values (
      new.id, 'price_outlier',
      case when new.price_minor < median_price * 0.35 then 'high' else 'medium' end,
      jsonb_build_object('median_price_minor', round(median_price), 'comparable_sales', comparable_count)
    )
    on conflict (listing_id, signal) where resolved_at is null do nothing;
  end if;
  return new;
end;
$$;

create or replace function private.enforce_listing_creation_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare recent_count integer;
begin
  select count(*) into recent_count from public.listings l
  where l.seller_id = new.seller_id and l.created_at > now() - interval '24 hours';
  if recent_count >= 30 then raise exception 'Daily listing limit exceeded'; end if;
  return new;
end;
$$;
create trigger listings_creation_rate before insert on public.listings
for each row execute function private.enforce_listing_creation_rate();

commit;
