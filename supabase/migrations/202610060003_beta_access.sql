begin;

-- The beta door: who is in Equina's closed beta.
--
-- Until now each tester was let in by five to ten per-person rows in
-- feature_flag_overrides, with every global flag off at 0%. That made one
-- mechanism do two jobs -- "is this feature ready?" and "is this person in the
-- beta?" -- and left plans looking like they did nothing. The three jobs are
-- now separate:
--
--   1. Feature flags   is the feature ready to be live? Readiness, and the
--                      emergency off switch. Unchanged.
--   2. The beta door   who is in the beta? An invite list by email, kept from
--                      Admin -> Beta, and one flag, `public_access`, that opens
--                      Equina to everyone at launch.
--   3. Plans           what does this rider get? Unchanged (202610060001).
--
-- The door is enforced where every flag already is, in private.feature_enabled:
-- an account outside the beta gets no feature at all, whatever the global row
-- says. So the flags can be turned on globally for the beta without opening
-- the public web app to anyone who signs up.
--
-- Two things stay open to every account holder:
--
--   * `account_settings`, so anyone can export and delete their own data while
--     they wait outside (the deletion and storage cleanup workers run in
--     production);
--   * a per-person override, which still wins in both directions: the testers
--     let in by overrides keep exactly what they have.

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_key_check;
alter table public.app_feature_flags
  add constraint app_feature_flags_key_check
  check (key in (
    'account_settings',
    'academy_progress',
    'coach_chat',
    'coach_credits',
    'plans',
    'public_access',
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
  ('public_access', false, 0,
   'Equina is open to everyone. While it is off only invited riders (Admin -> Beta) and accounts with their own public_access override get in. Opened at launch from Admin -> Beta; a partial rollout opens the door to that share of accounts.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- The invite list.
-- ---------------------------------------------------------------------------
-- By email, because an invite comes before the account: the person signs up
-- afterwards with the address they were invited with. Stored lower-cased and
-- trimmed, so one address is one row however it was typed.
create table public.beta_invites (
  email text primary key check (
    email = lower(trim(email))
    and char_length(email) between 3 and 320
    and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  -- For staff only: who this is ("Ilinca's coach", "TestFlight cohort 2").
  note text check (note is null or char_length(note) <= 200),
  invited_by uuid references auth.users(id) on delete set null,
  invited_at timestamptz not null default now(),
  revoked_at timestamptz,
  updated_at timestamptz not null default now()
);

create index beta_invites_invited_by_idx on public.beta_invites(invited_by);

create trigger beta_invites_set_updated_at
before update on public.beta_invites
for each row execute function private.set_updated_at();

-- Staff read and write it through the staff_ functions below; nothing else.
alter table public.beta_invites enable row level security;
revoke all on public.beta_invites from public, anon, authenticated;
grant select, insert, update, delete on public.beta_invites to service_role;

-- ---------------------------------------------------------------------------
-- Who is inside.
-- ---------------------------------------------------------------------------
-- An invite that was not taken back matches the account's current email, and
-- the account has confirmed that email -- so nobody gets in by signing up with
-- someone else's invited address.
create or replace function private.is_beta_member(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users account
    join public.beta_invites invite on invite.email = lower(trim(account.email))
    where account.id = target_user
      and account.email_confirmed_at is not null
      and invite.revoked_at is null
  );
$$;

-- Through the door: a beta member, or let in by `public_access` -- its global
-- rollout at launch, or a per-person override for one account without an
-- invite.
create or replace function private.has_app_access(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_user is not null
    and (private.is_beta_member(target_user) or private.feature_enabled('public_access', target_user));
$$;

-- Every server-side flag decision (202607290002), now behind the door:
--
--   1. a live per-person override wins, as before;
--   2. otherwise an account without app access gets nothing -- except
--      `public_access` itself, which is what decides it (asking has_app_access
--      here would never finish), and `account_settings`, which every account
--      holder keeps;
--   3. otherwise the global row and its rollout bucket, as before.
create or replace function private.feature_enabled(flag_key text, target_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select o.enabled
      from public.feature_flag_overrides o
      where o.user_id = target_user
        and o.key = flag_key
        and (o.expires_at is null or o.expires_at > now())
    ),
    case
      when target_user is null then false
      when flag_key not in ('public_access', 'account_settings')
        and not private.has_app_access(target_user) then false
      else (
        select
          f.enabled
          and f.rollout_percent > 0
          and (
            f.rollout_percent = 100
            or private.rollout_bucket(target_user, f.key) < f.rollout_percent
          )
        from public.app_feature_flags f
        where f.key = flag_key
      )
    end,
    false
  );
$$;

revoke execute on function private.is_beta_member(uuid) from public, anon, authenticated;
revoke execute on function private.has_app_access(uuid) from public, anon;
revoke execute on function private.feature_enabled(text, uuid) from public, anon;
-- Policies below call has_app_access with the rider's own session.
grant execute on function private.has_app_access(uuid) to authenticated;
grant execute on function private.feature_enabled(text, uuid) to authenticated;

-- What the app asks once signed in: may this account come in, and why.
create or replace function public.my_access()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null then
    return jsonb_build_object('access', false, 'member', false, 'publicAccess', false);
  end if;
  return jsonb_build_object(
    'access', private.has_app_access(actor_id),
    'member', private.is_beta_member(actor_id),
    'publicAccess', private.feature_enabled('public_access', actor_id)
  );
end;
$$;

revoke execute on function public.my_access() from public, anon;
grant execute on function public.my_access() to authenticated;

-- ---------------------------------------------------------------------------
-- What is not behind a flag.
-- ---------------------------------------------------------------------------
-- Flags guard what a rider does; some of what a rider reads was never behind
-- one. Those reads are closed to accounts outside the beta here. A rider's own
-- basics -- profile, preferences, onboarding, horses, rides, Ralf history,
-- export and deletion -- stay theirs either way. What anyone may read signed
-- out -- the Academy's catalog, the plans, the Shop's public listings -- stays
-- open: closing it to a signed-in account would keep nothing out.

-- The Academy. While plans are not enforced for an account, lesson_open opens
-- every lesson, so an account outside the beta could watch them all. PT403 is
-- PostgREST's 403; academy-playback answers it with `beta_only`.
create or replace function public.academy_playback_source(target_lesson uuid)
returns table (provider text, asset_id text, playback_id text, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  published boolean;
begin
  if auth.uid() is null then
    raise exception 'Sign in to watch lessons.' using errcode = '42501';
  end if;
  -- Staff preview every lesson from the admin, invited or not.
  if not private.is_staff() and not private.has_app_access(auth.uid()) then
    raise exception 'Equina is invite-only for now.' using errcode = 'PT403';
  end if;

  select lesson.published_at is not null into published
  from public.academy_lessons lesson
  where lesson.id = target_lesson;

  if published is null or (not published and not private.is_staff()) then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  if not private.is_staff() and not private.lesson_open(auth.uid(), target_lesson) then
    raise exception 'This lesson is not part of your plan.' using errcode = 'PT402';
  end if;

  return query
    select video.provider, video.asset_id, video.playback_id, video.status
    from public.academy_videos video
    where video.lesson_id = target_lesson;
end;
$$;

-- A pick spends a place on a plan nobody outside the beta can use yet.
create or replace function public.pick_academy_lesson(target_lesson uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  allowance integer;
  used integer;
begin
  if actor_id is null then
    raise exception 'Sign in to choose lessons.' using errcode = '42501';
  end if;
  if not private.has_app_access(actor_id) then
    raise exception 'Equina is invite-only for now.' using errcode = 'PT403';
  end if;
  if not exists (
    select 1 from public.academy_lessons lesson
    where lesson.id = target_lesson and lesson.published_at is not null
  ) then
    raise exception 'Lesson not found.' using errcode = 'P0002';
  end if;

  -- One pick at a time per rider, so two quick taps on two lessons cannot
  -- both take the last place. 4712 sits next to the credit lock's namespace.
  perform pg_advisory_xact_lock(4712, hashtext(actor_id::text));

  -- A free lesson, an open plan or an earlier pick: nothing to spend.
  if private.lesson_open(actor_id, target_lesson) then
    return private.plan_state(actor_id) || jsonb_build_object('access', true);
  end if;

  select tier.academy_picks into allowance
  from public.plan_tiers tier
  where tier.key = private.subscription_tier(actor_id);
  select count(*)::integer into used from private.counted_lesson_picks(actor_id);

  -- Also refused: a lesson picked on a bigger plan that no longer fits after
  -- a downgrade. Picking it again would not change which picks stay open.
  if used >= coalesce(allowance, 0) or exists (
    select 1 from public.academy_lesson_picks pick
    where pick.user_id = actor_id and pick.lesson_id = target_lesson
  ) then
    raise exception 'No lesson picks left on your plan.'
      using errcode = 'PT402',
            detail = format('used %s of %s', used, coalesce(allowance, 0));
  end if;

  insert into public.academy_lesson_picks(user_id, lesson_id) values (actor_id, target_lesson);
  return private.plan_state(actor_id) || jsonb_build_object('access', true);
end;
$$;

-- The plan screen says whether the rider is inside, so the app offers neither
-- plans nor picks to an account that cannot use them.
create or replace function public.my_plan()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in to see your plan.' using errcode = '42501';
  end if;
  return private.plan_state(auth.uid()) || jsonb_build_object('access', private.has_app_access(auth.uid()));
end;
$$;

-- The Club. Its reads follow club_access (202610060001), which opened the
-- whole Club to every signed-in account while plans are not enforced. Outside
-- the beta it is 'none': posts are hidden, and comments, reactions, media and
-- their files go with their post. A rider still sees their own posts, so they
-- can take one down.
create or replace function private.club_access(target_user uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_user is null then 'none'
    when not private.has_app_access(target_user) then 'none'
    when not private.feature_enabled('plans', target_user) then 'post'
    else coalesce(
      (select tier.club_access from public.plan_tiers tier where tier.key = private.subscription_tier(target_user)),
      'none'
    )
  end;
$$;

-- The spaces and who belongs to them are not read through a post, so they are
-- closed here. A rider keeps their own memberships, so they can leave.
create policy club_spaces_beta_read on public.club_spaces
as restrictive for select to authenticated
using ((select private.has_app_access((select auth.uid()))) or (select private.is_staff()));

create policy club_memberships_beta_read on public.club_memberships
as restrictive for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.has_app_access((select auth.uid())))
  or (select private.is_staff())
);

-- Riders' names and pictures (202610050002). Outside the beta an account reads
-- only its own, so signing up does not list who is inside.
create policy profiles_beta_read on public.profiles
as restrictive for select to authenticated
using (
  id = (select auth.uid())
  or (select private.has_app_access((select auth.uid())))
  or (select private.is_staff())
);

-- And their pictures: every signed-in account could read the whole avatars
-- bucket (202607210005). Outside the beta an account reads only its own folder.
drop policy if exists avatars_read_authenticated on storage.objects;
create policy avatars_read_authenticated on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (
    private.safe_uuid((storage.foldername(name))[1]) = (select auth.uid())
    or (select private.has_app_access((select auth.uid())))
    or (select private.is_staff())
  )
);

-- ---------------------------------------------------------------------------
-- Staff: the invite list and the door.
-- ---------------------------------------------------------------------------
-- Who is let in is a product decision, so these are admin powers with the
-- second factor, like plans and flags.
create or replace function public.staff_list_beta_invites()
returns table (
  email text,
  note text,
  invited_at timestamptz,
  invited_by_email text,
  revoked_at timestamptz,
  updated_at timestamptz,
  -- A confirmed account uses this email, and when it was created.
  has_account boolean,
  signed_up_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_admin() then
    raise exception 'Only an admin can see the beta invites.' using errcode = '42501';
  end if;

  return query
  select
    invite.email,
    invite.note,
    invite.invited_at,
    inviter.email::text,
    invite.revoked_at,
    invite.updated_at,
    account.id is not null,
    account.created_at
  from public.beta_invites invite
  left join auth.users inviter on inviter.id = invite.invited_by
  left join lateral (
    select rider.id, rider.created_at
    from auth.users rider
    where lower(trim(rider.email)) = invite.email
      and rider.email_confirmed_at is not null
    order by rider.created_at desc
    limit 1
  ) account on true
  order by invite.invited_at desc
  limit 1000;
end;
$$;

-- Invite someone, or invite them again after a revoke. Answers with the email
-- as stored, so the admin shows exactly what will match.
create or replace function public.staff_invite_beta(p_email text, p_note text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(trim(coalesce(p_email, '')));
  note_text text := nullif(trim(coalesce(p_note, '')), '');
begin
  if not private.is_admin() then
    raise exception 'Only an admin can invite riders to the beta.' using errcode = '42501';
  end if;
  if char_length(normalized) not between 3 and 320
    or normalized !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter the email address the rider signs up with.' using errcode = '22023';
  end if;
  if note_text is not null and char_length(note_text) > 200 then
    raise exception 'Keep the note under 200 characters.' using errcode = '22023';
  end if;

  insert into public.beta_invites(email, note, invited_by)
  values (normalized, note_text, auth.uid())
  on conflict (email) do update set
    note = coalesce(excluded.note, beta_invites.note),
    invited_by = excluded.invited_by,
    -- Invited again after a revoke: a new invite, from today.
    invited_at = case when beta_invites.revoked_at is null then beta_invites.invited_at else now() end,
    revoked_at = null;

  return normalized;
end;
$$;

-- Take an invite back. The account stays; it waits outside again.
create or replace function public.staff_revoke_beta(p_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(trim(coalesce(p_email, '')));
begin
  if not private.is_admin() then
    raise exception 'Only an admin can revoke beta invites.' using errcode = '42501';
  end if;
  if normalized = '' then
    raise exception 'Choose an invite to revoke.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.beta_invites where email = normalized) then
    raise exception 'No invite for that email.' using errcode = 'P0002';
  end if;

  update public.beta_invites set revoked_at = now()
  where email = normalized and revoked_at is null;
end;
$$;

-- The launch switch: open Equina to everyone, or close it to invited riders
-- again. A partial rollout is set on the flag itself; this is all or nothing.
create or replace function public.staff_set_public_access(p_open boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only an admin can open or close Equina.' using errcode = '42501';
  end if;
  if p_open is null then
    raise exception 'Choose to open or close Equina.' using errcode = '22023';
  end if;

  update public.app_feature_flags set
    enabled = p_open,
    rollout_percent = case when p_open then 100 else 0 end,
    updated_by = auth.uid(),
    updated_at = now()
  where key = 'public_access';
end;
$$;

revoke execute on function public.staff_list_beta_invites() from public, anon;
revoke execute on function public.staff_invite_beta(text, text) from public, anon;
revoke execute on function public.staff_revoke_beta(text) from public, anon;
revoke execute on function public.staff_set_public_access(boolean) from public, anon;
grant execute on function public.staff_list_beta_invites() to authenticated;
grant execute on function public.staff_invite_beta(text, text) to authenticated;
grant execute on function public.staff_revoke_beta(text) to authenticated;
grant execute on function public.staff_set_public_access(boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Account erasure (202610060001), now naming the invite list.
-- ---------------------------------------------------------------------------
-- The invite is the erased rider's own email address, so it goes. The auth
-- user is soft-deleted and no foreign key fires, so an invite the erased
-- account gave keeps its row without the name of who gave it.
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
