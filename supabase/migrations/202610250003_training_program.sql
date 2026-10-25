begin;

-- The training program, seen from each horse: the rider's week (202610250002)
-- can now put more than one horse on the same day, and a horse can be off --
-- resting, on a break, on stall rest, injured or under vet treatment. A
-- planned ride on a horse that is off is not missed: the streak does not
-- break, and no reminder goes out for it.

-- ---------------------------------------------------------------------------
-- Several horses on one day.
-- ---------------------------------------------------------------------------
-- Before, a weekday appeared once. A rider with two horses rides both on a
-- Monday; what has to be unique is the weekday with the horse. A day without
-- a horse (a rider with none yet) counts as one more key.
create or replace function private.training_plan_days_valid(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  day jsonb;
  seen text[] := '{}';
  entry_key text;
begin
  -- Seven days of up to thirty horses: the weekday-and-horse rule below is
  -- what really bounds it.
  if value is null or jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 210 then
    return false;
  end if;
  -- One check per statement: a cast only runs once the type is known.
  for day in select element from jsonb_array_elements(value) as element loop
    if jsonb_typeof(day) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(day) as key
      where key not in ('weekday', 'training_type', 'horse_id')
    ) then
      return false;
    end if;
    if coalesce(jsonb_typeof(day -> 'weekday'), '') <> 'number' then
      return false;
    end if;
    if (day ->> 'weekday')::numeric not in (1, 2, 3, 4, 5, 6, 7) then
      return false;
    end if;
    if coalesce(jsonb_typeof(day -> 'training_type'), '') <> 'string' then
      return false;
    end if;
    if (day ->> 'training_type') !~ '^[a-z][a-z0-9-]{1,39}$' then
      return false;
    end if;
    if coalesce(jsonb_typeof(day -> 'horse_id'), 'null') not in ('string', 'null') then
      return false;
    end if;
    if jsonb_typeof(day -> 'horse_id') = 'string'
       and (day ->> 'horse_id') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      return false;
    end if;
    entry_key := ((day ->> 'weekday')::numeric)::int::text || ':' || coalesce(day ->> 'horse_id', '-');
    if entry_key = any(seen) then
      return false;
    end if;
    seen := seen || entry_key;
  end loop;
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- A horse's time off.
-- ---------------------------------------------------------------------------
-- A period with a first and last day (the horse's local days, as the rider
-- enters them) and a kind. The kind is an id the app owns ('rest', 'break',
-- 'stall-rest', 'injury', 'vet', 'other'); like a training type it is checked
-- for shape, so a new kind needs no migration. It belongs to the horse: whoever
-- can see the horse sees it, whoever can edit the horse can add and remove it,
-- and it goes with the horse.
create table public.horse_time_off (
  id uuid primary key default gen_random_uuid(),
  horse_id uuid not null references public.horses(id) on delete cascade,
  kind text not null constraint horse_time_off_kind_shape check (kind ~ '^[a-z][a-z0-9-]{1,39}$'),
  starts_on date not null,
  ends_on date not null,
  note text constraint horse_time_off_note_length check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint horse_time_off_in_order check (ends_on >= starts_on),
  constraint horse_time_off_within_a_year check (ends_on - starts_on <= 366)
);

create index horse_time_off_horse_idx on public.horse_time_off(horse_id, starts_on desc);

-- Days a period has already covered stay covered: they decided whether past
-- planned rides counted, and taking them back would break a streak after the
-- fact. So a period under way is ended early -- its last day moved back --
-- rather than deleted; one is taken back whole only before it starts, or on
-- the day it was entered (a period put on the wrong horse). A period can start
-- up to a week back -- a horse that went lame on Monday is entered on
-- Wednesday -- matching how far back Add activity reaches. The day before the
-- server's today is the slack for time zones. Triggers, not CHECKs: a CHECK
-- against the date is re-run on a restore.
create or replace function private.horse_time_off_dates_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    -- A horse deleted, or an account erased, takes all its time off: the
    -- cascade runs one trigger level down and is not a rider taking one back.
    if pg_trigger_depth() = 1
       and old.starts_on < current_date - 1
       and old.created_at < now() - interval '1 day' then
      raise exception 'Time off that has started is ended early, not taken back.' using errcode = '22023';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    if old.ends_on < current_date - 1 then
      raise exception 'A time off that is over stays as it was.' using errcode = '22023';
    end if;
    if new.ends_on > old.ends_on then
      raise exception 'Time off can only be ended early. Add a new one to extend it.' using errcode = '22023';
    end if;
    if new.ends_on < current_date - 1 then
      raise exception 'Time off can end yesterday at the earliest.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.starts_on < current_date - 8 then
    raise exception 'Time off can start up to a week back.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function private.horse_time_off_dates_guard() from public, anon, authenticated;

create trigger horse_time_off_dates_guard
before insert or update or delete on public.horse_time_off
for each row execute function private.horse_time_off_dates_guard();

create trigger horse_time_off_set_updated_at
before update on public.horse_time_off
for each row execute function private.set_updated_at();

alter table public.horse_time_off enable row level security;
revoke all on public.horse_time_off from public, anon, authenticated;
grant select, delete on public.horse_time_off to authenticated;
grant insert (horse_id, kind, starts_on, ends_on, note) on public.horse_time_off to authenticated;
-- Ending a period early is the one change after the fact.
grant update (ends_on) on public.horse_time_off to authenticated;
grant select, insert, update, delete on public.horse_time_off to service_role;

create policy horse_time_off_read on public.horse_time_off for select to authenticated
using (private.can_view_horse(horse_id));

create policy horse_time_off_create_editor on public.horse_time_off for insert to authenticated
with check (private.can_edit_horse(horse_id));

create policy horse_time_off_end_editor on public.horse_time_off for update to authenticated
using (private.can_edit_horse(horse_id))
with check (private.can_edit_horse(horse_id));

create policy horse_time_off_delete_editor on public.horse_time_off for delete to authenticated
using (private.can_edit_horse(horse_id));

-- Like the horse itself, written only while horse management is on.
create policy horse_time_off_insert_feature_gate on public.horse_time_off as restrictive for insert to authenticated
with check (private.feature_enabled('horse_management'));
create policy horse_time_off_update_feature_gate on public.horse_time_off as restrictive for update to authenticated
using (private.feature_enabled('horse_management'))
with check (private.feature_enabled('horse_management'));
create policy horse_time_off_delete_feature_gate on public.horse_time_off as restrictive for delete to authenticated
using (private.feature_enabled('horse_management'));

commit;
