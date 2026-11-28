begin;

-- Activities the rider schedules for a day still ahead: a training on the
-- calendar, with its horse, its kind and its phases, at a time. It is not a
-- ride: the journal, the streak and the summaries only ever count what was
-- done. When the day comes the rider marks it done, which saves a logged
-- activity (ride_entries, source 'manual') from it and links the two, or
-- lets it go.
--
-- status:
--   planned  still to come, or come and not answered yet
--   done     logged; ride_entry_id is the journal entry it became (null if
--            that entry was deleted later)
--   skipped  the rider said it did not happen
create table public.planned_activities (
  id uuid primary key default gen_random_uuid(),
  rider_id uuid not null references auth.users(id) on delete cascade,
  horse_id uuid references public.horses(id) on delete set null,
  -- The rider's local day and minutes after local midnight, as Add activity sets them.
  day date not null,
  start_minutes smallint not null,
  training_type text not null,
  phases jsonb not null,
  note text,
  status text not null default 'planned',
  ride_entry_id uuid references public.ride_entries(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint planned_activities_start_valid check (start_minutes between 0 and 1439),
  constraint planned_activities_training_type_valid check (training_type ~ '^[a-z][a-z0-9-]{1,39}$'),
  -- The same shape as a ride's phases (202610070001); a plan has no actual_seconds.
  constraint planned_activities_phases_valid check (
    phases is not null and private.ride_phases_valid(phases)
    and not jsonb_path_exists(phases, '$[*].actual_seconds')
  ),
  -- As long as a ride's note (ride_entries.rider_note): Done carries it over.
  constraint planned_activities_note_valid check (note is null or char_length(note) <= 2000),
  constraint planned_activities_status_known check (status in ('planned', 'done', 'skipped')),
  constraint planned_activities_entry_only_when_done check (ride_entry_id is null or status = 'done')
);

create index planned_activities_rider_day_idx
on public.planned_activities(rider_id, day);

-- A plan is made for today or a day ahead (a day of slack either way for the
-- rider's time zone), at most three months out. Once its day has passed it
-- can only be answered: done or skipped, never moved.
create or replace function private.planned_activity_dates_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.day not between current_date - 1 and current_date + 92 then
      raise exception 'An activity can be scheduled from today up to three months ahead.' using errcode = '22023';
    end if;
    if new.status <> 'planned' then
      raise exception 'A scheduled activity starts as planned.' using errcode = '22023';
    end if;
    return new;
  end if;
  -- An answer stays given: done or skipped never goes back to planned or
  -- to the other answer. (A deleted journal entry unlinks a done plan
  -- through on delete set null; its status does not change.)
  if old.status <> 'planned' and new.status <> old.status then
    raise exception 'An answered activity stays as it was.' using errcode = '22023';
  end if;
  if new.day <> old.day
     or new.start_minutes <> old.start_minutes
     or new.training_type <> old.training_type
     or new.phases <> old.phases
     -- A horse that is deleted leaves the plan without one (on delete set
     -- null), whatever its status: only picking another horse is a change.
     or (new.horse_id is not null and new.horse_id is distinct from old.horse_id) then
    if old.status <> 'planned' then
      raise exception 'An answered activity stays as it was.' using errcode = '22023';
    end if;
    -- A day gone by is answered, not moved to another day.
    if old.day < current_date - 1 then
      raise exception 'A past activity can only be marked done or let go.' using errcode = '22023';
    end if;
    if new.day not between current_date - 1 and current_date + 92 then
      raise exception 'An activity can be scheduled from today up to three months ahead.' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

revoke execute on function private.planned_activity_dates_guard() from public, anon, authenticated;

create trigger planned_activities_dates_guard
before insert or update on public.planned_activities
for each row execute function private.planned_activity_dates_guard();

create trigger planned_activities_set_updated_at
before update on public.planned_activities
for each row execute function private.set_updated_at();

alter table public.planned_activities enable row level security;
revoke all on public.planned_activities from public, anon, authenticated;
grant select on public.planned_activities to authenticated;
grant insert (rider_id, horse_id, day, start_minutes, training_type, phases, note) on public.planned_activities to authenticated;
grant update (horse_id, day, start_minutes, training_type, phases, note, status, ride_entry_id) on public.planned_activities to authenticated;
grant delete on public.planned_activities to authenticated;
grant select, insert, update, delete on public.planned_activities to service_role;

-- Private to the rider, like the ride journal. A done activity points at the
-- rider's own journal entry, never someone else's.
create policy planned_activities_read_self
on public.planned_activities for select to authenticated
using (rider_id = (select auth.uid()));

create policy planned_activities_create_self
on public.planned_activities for insert to authenticated
with check (rider_id = (select auth.uid()));

create policy planned_activities_update_self
on public.planned_activities for update to authenticated
using (rider_id = (select auth.uid()))
with check (
  rider_id = (select auth.uid())
  and (
    ride_entry_id is null
    or exists (
      select 1 from public.ride_entries entry
      where entry.id = ride_entry_id and entry.rider_id = (select auth.uid())
    )
  )
);

create policy planned_activities_delete_self
on public.planned_activities for delete to authenticated
using (rider_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Account erasure (latest in 202610250002), now with scheduled activities.
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
  delete from public.planned_activities where rider_id = target_user_id;
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
