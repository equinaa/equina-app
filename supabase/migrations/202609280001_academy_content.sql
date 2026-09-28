begin;

-- The Academy has no backend at all. Across every migration before this one
-- there is not a single content table: the catalogue is a hardcoded array of
-- ten lessons in src/App.tsx, and `progress` on each is the literal number 0,
-- which no code ever changes. A rider who watches a lesson to the end and
-- comes back tomorrow finds it untouched.
--
-- Two things follow from that, and this migration only does the first:
--
--   1. Lessons become data, so publishing one is an insert rather than a
--      release. That is what this migration builds.
--   2. Which lessons a rider may open is a tier question -- the founder's plan
--      has 1-2 on free, 30 on mid, all on premium, each the rider's own pick.
--      That needs the entitlement layer, which does not exist yet, so it is
--      deliberately absent here. `access` below is the seam it will read.
--
-- Nothing is seeded. The ten lessons in the client name coaches who do not
-- exist -- "Elena Marquez, Olympic trainer" was written as a placeholder --
-- and copying invented people into the database would make them look like
-- records. The table ships empty and fills when real lessons arrive.

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_key_check;
alter table public.app_feature_flags
  add constraint app_feature_flags_key_check
  check (key in (
    'account_settings',
    'academy_progress',
    'coach_chat',
    'coach_credits',
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
  ('academy_progress', false, 0,
   'Turn on once there are real lessons to make progress through. Reading the catalogue never needs this flag; only writing progress does.')
on conflict (key) do nothing;

create type public.academy_access as enum ('free', 'paid');

-- ---------------------------------------------------------------------------
-- The catalogue.
-- ---------------------------------------------------------------------------
-- Category, level and discipline are the three axes the client already ranks
-- on, so they are columns rather than tags: the existing relevance scoring
-- keeps working unchanged, reading rows instead of a literal.
--
-- Level is nullable on purpose. A lesson about checking legs after a ride
-- suits every rider, and forcing a level onto it would push it out of
-- somebody's list for no reason -- the client already treats a missing level
-- as "suits anyone".
create table public.academy_lessons (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (char_length(trim(slug)) between 2 and 80),
  title text not null check (char_length(trim(title)) between 2 and 120),
  summary text not null check (char_length(trim(summary)) between 2 and 500),
  category text not null check (char_length(trim(category)) between 2 and 60),
  discipline public.discipline,
  level public.rider_level,
  access public.academy_access not null default 'paid',
  -- Seconds, so the client can format it and the sum of a path is arithmetic
  -- rather than string parsing. The current array stores "18 min" as text.
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 86400),
  -- Who actually taught it. Null until someone real did: a named coach is a
  -- claim about a person, and the placeholder names in the client are not one.
  coach_name text check (coach_name is null or char_length(trim(coach_name)) <= 120),
  coach_title text check (coach_title is null or char_length(trim(coach_title)) <= 120),
  -- Paths in private Storage, never public URLs, matching every other asset in
  -- this project.
  video_path text check (video_path is null or char_length(video_path) <= 400),
  poster_path text check (poster_path is null or char_length(poster_path) <= 400),
  -- Ordering within a category. Ties fall back to title.
  position integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index academy_lessons_published_idx
  on public.academy_lessons(category, position, title)
  where published_at is not null;

create trigger academy_lessons_set_updated_at
before update on public.academy_lessons
for each row execute function private.set_updated_at();

-- Chapter marks inside one lesson.
create table public.academy_chapters (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  starts_at_seconds integer not null check (starts_at_seconds >= 0),
  title text not null check (char_length(trim(title)) between 1 and 120),
  created_at timestamptz not null default now(),
  unique (lesson_id, starts_at_seconds)
);

create index academy_chapters_lesson_idx
  on public.academy_chapters(lesson_id, starts_at_seconds);

-- ---------------------------------------------------------------------------
-- Progress.
-- ---------------------------------------------------------------------------
-- One row per rider per lesson, written by the rider. Position is where they
-- stopped, so picking a lesson back up resumes rather than restarts.
--
-- completed_at is separate from position on purpose: a rider who watches to
-- 95% and walks away has finished it in every sense that matters, and a rider
-- who scrubs to the end has not. Position is a fact about the player;
-- completion is a fact about the rider, and only the client can say which
-- happened.
create table public.academy_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  position_seconds integer not null default 0 check (position_seconds >= 0),
  completed_at timestamptz,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index academy_progress_recent_idx
  on public.academy_progress(user_id, last_seen_at desc);

create trigger academy_progress_set_updated_at
before update on public.academy_progress
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Access.
-- ---------------------------------------------------------------------------
alter table public.academy_lessons enable row level security;
alter table public.academy_chapters enable row level security;
alter table public.academy_progress enable row level security;

-- The catalogue is product information: a rider has to be able to browse
-- before owning anything, exactly like the plan table. Only published rows --
-- a draft lesson is not a lesson.
create policy academy_lessons_read_published on public.academy_lessons
for select to anon, authenticated using (published_at is not null);
create policy academy_lessons_staff_manage on public.academy_lessons
for all to authenticated
using (private.is_staff()) with check (private.is_staff());

create policy academy_chapters_read_published on public.academy_chapters
for select to anon, authenticated using (
  exists (
    select 1 from public.academy_lessons lesson
    where lesson.id = academy_chapters.lesson_id and lesson.published_at is not null
  )
);
create policy academy_chapters_staff_manage on public.academy_chapters
for all to authenticated
using (private.is_staff()) with check (private.is_staff());

-- Progress belongs to the rider who made it, and writing needs the flag --
-- the same two-layer gate every other mutation in this project goes through.
create policy academy_progress_read_self on public.academy_progress
for select to authenticated using (user_id = auth.uid());

create policy academy_progress_write_self on public.academy_progress
for insert to authenticated
with check (user_id = auth.uid() and private.feature_enabled('academy_progress', auth.uid()));

create policy academy_progress_update_self on public.academy_progress
for update to authenticated
using (user_id = auth.uid() and private.feature_enabled('academy_progress', auth.uid()))
with check (user_id = auth.uid());

create policy academy_progress_delete_self on public.academy_progress
for delete to authenticated using (user_id = auth.uid());

revoke all on public.academy_lessons from public, anon;
revoke all on public.academy_chapters from public, anon;
revoke all on public.academy_progress from public, anon;

grant select on public.academy_lessons, public.academy_chapters to anon, authenticated;
grant insert, update, delete on public.academy_lessons, public.academy_chapters to authenticated;
grant select, insert, update, delete on public.academy_progress to authenticated;

grant select, insert, update, delete on
  public.academy_lessons,
  public.academy_chapters,
  public.academy_progress
to service_role;

commit;
