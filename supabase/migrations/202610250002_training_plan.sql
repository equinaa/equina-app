begin;

-- The rider's training week: which days they plan to ride, and for each day
-- the horse and the kind of training. The streak counts against it, the
-- reminders follow it, and Home's next ride starts from it.
--
-- A plan is kept as versions. Changing it writes a new version from that day
-- on; the weeks before keep the plan they had, so changing Tuesday for
-- Wednesday never rewrites a week already ridden, nor breaks or makes a
-- streak after the fact. Saving twice on the same day changes that day's
-- version.
--
-- days is a jsonb array, at most one entry per weekday (1 = Monday):
--   [{"weekday": 1, "training_type": "dressage", "horse_id": "<uuid>"}, ...]
-- training_type is the app's id, shape-checked like ride_entries.training_type
-- (202610070001). horse_id may be absent for a rider without a horse; it is
-- not a foreign key, so archiving a horse leaves the plan readable and the
-- app falls back to Home's horse.
create or replace function private.training_plan_days_valid(value jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  day jsonb;
  seen int[] := '{}';
  weekday int;
begin
  if value is null or jsonb_typeof(value) <> 'array' or jsonb_array_length(value) > 7 then
    return false;
  end if;
  -- One check per statement, as in private.ride_phases_valid: a cast only
  -- runs once the type is known.
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
    weekday := (day ->> 'weekday')::int;
    if weekday = any(seen) then
      return false;
    end if;
    seen := seen || weekday;
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
  end loop;
  return true;
end;
$$;

-- A CHECK runs as the rider who writes the row, so authenticated needs to
-- execute it. It reads nothing but its argument.
revoke execute on function private.training_plan_days_valid(jsonb) from public, anon;
grant execute on function private.training_plan_days_valid(jsonb) to authenticated, service_role;

create table public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The rider's local day the version starts on.
  effective_from date not null,
  days jsonb not null default '[]'::jsonb,
  -- A reminder on the morning of each planned day. On unless the rider turns it off.
  reminders boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint training_plans_one_per_day unique (user_id, effective_from),
  constraint training_plans_days_valid check (private.training_plan_days_valid(days))
);

-- The past stays as it was. A version starts on the rider's today, which is
-- within a day of the server's whatever their time zone; and only today's
-- version can still change. A trigger, not a CHECK: a CHECK against the
-- date is re-run on a restore, and every old version would fail it.
create or replace function private.training_plan_dates_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.effective_from not between current_date - 1 and current_date + 1 then
      raise exception 'A training plan starts today.' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.effective_from <> old.effective_from then
    raise exception 'A training plan keeps the day it started.' using errcode = '22023';
  end if;
  if old.effective_from < current_date - 1 then
    raise exception 'A past week''s plan stays as it was. Save a new one from today.' using errcode = '22023';
  end if;
  return new;
end;
$$;

revoke execute on function private.training_plan_dates_guard() from public, anon, authenticated;

create trigger training_plans_dates_guard
before insert or update on public.training_plans
for each row execute function private.training_plan_dates_guard();

create trigger training_plans_set_updated_at
before update on public.training_plans
for each row execute function private.set_updated_at();

alter table public.training_plans enable row level security;
revoke all on public.training_plans from public, anon, authenticated;
grant select on public.training_plans to authenticated;
grant insert (user_id, effective_from, days, reminders) on public.training_plans to authenticated;
grant update (days, reminders) on public.training_plans to authenticated;
grant select, insert, update, delete on public.training_plans to service_role;

-- Private to the rider, like the ride journal. No delete: the versions are
-- the history the streak is counted against. Erasure removes them.
create policy training_plans_read_self
on public.training_plans for select to authenticated
using (user_id = (select auth.uid()));

create policy training_plans_create_self
on public.training_plans for insert to authenticated
with check (user_id = (select auth.uid()));

create policy training_plans_update_self
on public.training_plans for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Account erasure (latest in 202610060004), now with the training plan.
-- ---------------------------------------------------------------------------
create or replace function public.erase_account_data(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_user_id is null then
    raise exception 'A user is required';
  end if;

  -- Media rows of the rider's posts. The posts themselves stay, redacted
  -- below, so threads other riders replied to keep their shape.
  delete from public.club_post_media
  where post_id in (select id from public.club_posts where author_id = target_user_id);

  -- Horses take their records, record files and collaborators with them.
  -- Other riders' rides on these horses keep their entry, without the horse.
  delete from public.horses where owner_id = target_user_id;
  -- Collaborations on other riders' horses.
  delete from public.horse_collaborators
  where user_id = target_user_id or invited_by = target_user_id;

  delete from public.ride_entries where rider_id = target_user_id;
  delete from public.training_plans where user_id = target_user_id;
  delete from public.academy_progress where user_id = target_user_id;
  delete from public.academy_lesson_picks where user_id = target_user_id;
  delete from public.plan_subscriptions where user_id = target_user_id;
  update public.plan_subscriptions set granted_by = null where granted_by = target_user_id;
  delete from public.beta_invites
  where email = (select lower(trim(account.email)) from auth.users account where account.id = target_user_id);
  update public.beta_invites set invited_by = null where invited_by = target_user_id;
  delete from public.onboarding_starter_packs where user_id = target_user_id;
  -- Messages, their operations and feedback cascade from the conversation.
  delete from public.coach_conversations where user_id = target_user_id;
  delete from public.coach_message_feedback where user_id = target_user_id;
  delete from public.coach_usage_events where user_id = target_user_id;
  delete from public.data_export_requests where user_id = target_user_id;
  delete from public.push_devices where user_id = target_user_id;
  delete from public.notification_outbox where recipient_id = target_user_id;
  delete from public.upload_tickets where user_id = target_user_id;
  delete from public.club_memberships where user_id = target_user_id;
  delete from public.club_reactions where user_id = target_user_id;
  -- What the rider was told about, and what others were told the rider did.
  delete from public.club_activity
  where recipient_id = target_user_id or actor_id = target_user_id;
  delete from public.saved_listings where user_id = target_user_id;
  delete from public.user_blocks
  where blocker_id = target_user_id or blocked_id = target_user_id;
  delete from public.user_preferences where user_id = target_user_id;
  delete from public.notification_preferences where user_id = target_user_id;
  delete from public.feature_flag_overrides where user_id = target_user_id;
  delete from public.user_roles where user_id = target_user_id;

  -- Redacted in place rather than deleted: other riders replied to them.
  -- moderate_club_post keeps 'deleted' when the body changes in the same update.
  update public.club_posts
  set body = '[Deleted by rider]', moderation_status = 'deleted'
  where author_id = target_user_id;
  update public.club_comments
  set body = '[Deleted by rider]', moderation_status = 'deleted'
  where author_id = target_user_id;
  update public.marketplace_messages
  set body = '[Deleted by rider]', deleted_at = now()
  where sender_id = target_user_id;

  update public.profiles
  set
    display_name = 'Deleted rider',
    avatar_path = null,
    location = null,
    discipline = null,
    skill_level = null,
    bio = null
  where id = target_user_id;
end;
$$;

commit;
