begin;

-- A ride set up before the rider gets on: the kind of training, and the
-- phases with the minutes the rider chose for each.
--
-- The training is no longer the horse's discipline. A jumping rider rides
-- dressage most days and jumps twice a week, and a hack or a lunge session is
-- not a discipline at all. training_type is an id the app owns ("dressage",
-- "pole-work", "hunting"); the list is still growing with the yard, so it is
-- checked for shape, not membership, and a new type needs no migration.
-- discipline stays, filled from the training or the horse, for the journal
-- summaries and Ralf.

alter table public.ride_entries
  add column training_type text
    constraint ride_entries_training_type_shape
    check (training_type is null or training_type ~ '^[a-z][a-z0-9-]{1,39}$'),
  add column phases jsonb;

-- Each phase as planned and as ridden:
--   {"title": "Warm-up", "detail": "Trot", "planned_seconds": 420, "actual_seconds": 431}
-- actual_seconds is absent or null for a phase the ride never reached. The
-- app caps a plan at 8 phases of 1 to 90 minutes; the database allows a
-- little more, so a later app can grow without a migration.
create or replace function private.ride_phases_valid(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  phase jsonb;
begin
  if value is null then
    return true;
  end if;
  if jsonb_typeof(value) <> 'array' or jsonb_array_length(value) not between 1 and 12 then
    return false;
  end if;
  -- One check per statement: a cast only runs once the type is known, so a
  -- malformed phase is refused rather than raising a cast error.
  for phase in select element from jsonb_array_elements(value) as element loop
    if jsonb_typeof(phase) <> 'object' then
      return false;
    end if;
    if exists (
      select 1 from jsonb_object_keys(phase) as key
      where key not in ('title', 'detail', 'planned_seconds', 'actual_seconds')
    ) then
      return false;
    end if;
    if coalesce(jsonb_typeof(phase -> 'title'), '') <> 'string' then
      return false;
    end if;
    if char_length(btrim(phase ->> 'title')) not between 1 and 60 then
      return false;
    end if;
    if coalesce(jsonb_typeof(phase -> 'detail'), 'null') not in ('string', 'null') then
      return false;
    end if;
    if char_length(coalesce(phase ->> 'detail', '')) > 60 then
      return false;
    end if;
    if coalesce(jsonb_typeof(phase -> 'planned_seconds'), '') <> 'number' then
      return false;
    end if;
    if (phase ->> 'planned_seconds')::numeric not between 60 and 5400
       or (phase ->> 'planned_seconds')::numeric <> trunc((phase ->> 'planned_seconds')::numeric) then
      return false;
    end if;
    if coalesce(jsonb_typeof(phase -> 'actual_seconds'), 'null') not in ('number', 'null') then
      return false;
    end if;
    if jsonb_typeof(phase -> 'actual_seconds') = 'number' then
      if (phase ->> 'actual_seconds')::numeric not between 0 and 86400
         or (phase ->> 'actual_seconds')::numeric <> trunc((phase ->> 'actual_seconds')::numeric) then
        return false;
      end if;
    end if;
  end loop;
  return true;
end;
$$;

-- A CHECK runs as the rider who writes the row, so authenticated needs to
-- execute it. It reads nothing but its argument.
revoke execute on function private.ride_phases_valid(jsonb) from public, anon;
grant execute on function private.ride_phases_valid(jsonb) to authenticated, service_role;

-- The phases and the phase count describe the same ride. The CASE keeps the
-- length check from running on something that is not an array.
alter table public.ride_entries
  add constraint ride_entries_phases_valid
  check (
    case
      when phases is null then true
      when not private.ride_phases_valid(phases) then false
      else jsonb_array_length(phases) = total_phases
    end
  );

-- Written once, with the ride (src/backend/ride-repository.ts). Corrections
-- after the fact stay limited to what 202610020004 already allows.
grant insert (training_type, phases) on public.ride_entries to authenticated;

commit;
