begin;

-- A training logged by hand afterwards ("Add activity"), next to the rides
-- the app timed. source says which: the minutes of a logged activity are what
-- the rider typed, not what a clock measured, so the journal shows them as
-- logged rather than tracked.
alter table public.ride_entries
  add column source text not null default 'live'
    constraint ride_entries_source_known check (source in ('live', 'manual'));

-- Dates come from the phone, and nothing stopped a ride dated next year,
-- which would then sit on top of the journal and of Ralf's context. This is a
-- trigger, not a CHECK: a CHECK against now() is re-run on a restore, and
-- every old activity would fail it.
--
-- Both get an hour of slack for a phone whose clock runs fast: the app
-- already checks on the rider's own clock that a logged activity has ended,
-- and cannot see the server's. A logged activity is also at most 31 days
-- old; the app offers the last 7 days, and the room above that lets the app
-- change its window without a migration.
create or replace function private.ride_entry_dates_plausible()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'manual' then
    if new.completed_at > now() + interval '1 hour' then
      raise exception 'A logged activity has to have ended already.' using errcode = '22023';
    end if;
    if new.completed_at < now() - interval '31 days' then
      raise exception 'An activity can be logged up to a month back.' using errcode = '22023';
    end if;
  elsif new.completed_at > now() + interval '1 hour' then
    raise exception 'A ride cannot finish in the future.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function private.ride_entry_dates_plausible() from public, anon, authenticated;

drop trigger if exists ride_entries_dates_plausible on public.ride_entries;
create trigger ride_entries_dates_plausible
before insert on public.ride_entries
for each row execute function private.ride_entry_dates_plausible();

-- Written once, with the entry (src/backend/ride-repository.ts). A ride never
-- turns into a logged activity or back.
grant insert (source) on public.ride_entries to authenticated;

commit;
