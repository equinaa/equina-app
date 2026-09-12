begin;

-- The daily ride loop is the retention engine of the product and was the only
-- core journey with no backend at all: elapsed time, completed phases, the
-- rider note and the horse-feel check-in lived in a single React state and were
-- lost on every reload.
--
-- Discipline reuses the existing public.discipline enum rather than a parallel
-- capitalised type, so ride entries stay joinable with horses and profiles. The
-- client maps between its own casing and the enum in RideEntriesRepository.

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_key_check;
alter table public.app_feature_flags
  add constraint app_feature_flags_key_check
  check (key in (
    'account_settings',
    'coach_chat',
    'push_notifications',
    'record_mutations',
    'horse_management',
    'ride_logging',
    'club_publishing',
    'club_interactions',
    'shop_listing_creation',
    'shop_messaging',
    'shop_transactions'
  ));

insert into public.app_feature_flags(key, enabled, rollout_percent, note) values
  ('ride_logging', false, 0, 'Enable after ride persistence, edit/delete, and restart QA on iOS, Android, and web.')
on conflict (key) do nothing;

create table public.ride_entries (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users(id) on delete cascade,
  horse_id uuid references public.horses(id) on delete set null,
  discipline public.discipline not null,
  focus text not null check (char_length(trim(focus)) between 1 and 120),
  planned_duration text check (planned_duration is null or char_length(planned_duration) <= 40),
  started_at timestamptz not null,
  completed_at timestamptz not null,
  elapsed_seconds integer not null check (elapsed_seconds between 0 and 86400),
  completed_phases smallint not null check (completed_phases >= 0),
  total_phases smallint not null check (total_phases >= 0),
  -- The horse-feel check-in stays attributed to the rider. It is an observation,
  -- never an inferred training-quality score.
  mood text check (mood is null or mood in ('fresh', 'focused', 'tender')),
  rider_note text check (rider_note is null or char_length(rider_note) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ride_entries_finishes_after_start check (completed_at >= started_at),
  constraint ride_entries_phases_consistent check (completed_phases <= total_phases)
);

-- The journal is always read newest-first for one rider.
create index ride_entries_rider_completed_idx
on public.ride_entries(rider_id, completed_at desc);

-- Covering index for the foreign key, so archiving a horse does not seq-scan.
create index ride_entries_horse_idx
on public.ride_entries(horse_id)
where horse_id is not null;

alter table public.ride_entries enable row level security;

create trigger ride_entries_set_updated_at
before update on public.ride_entries
for each row execute function private.set_updated_at();

-- A ride journal is private to its rider. There is no collaborator path here,
-- unlike horse records: a shared horse does not imply shared training notes.
create policy ride_entries_read_self
on public.ride_entries for select to authenticated
using (rider_id = auth.uid());

create policy ride_entries_create_self
on public.ride_entries for insert to authenticated
with check (rider_id = auth.uid());

create policy ride_entries_update_self
on public.ride_entries for update to authenticated
using (rider_id = auth.uid())
with check (rider_id = auth.uid());

create policy ride_entries_delete_self
on public.ride_entries for delete to authenticated
using (rider_id = auth.uid());

grant select, insert, update, delete on public.ride_entries to authenticated;

commit;
