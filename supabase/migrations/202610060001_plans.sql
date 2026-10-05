begin;

-- Equina's plans: Free, Plus and Premium.
--
-- Ilinca's monetization draft (dev plan, Part 4) defines three tiers -- Free,
-- Mid and Premium -- and this is that draft as data:
--
--   * Free     horse records, every free lesson plus 2 paid lessons of the
--              rider's choice, a few Ralf credits, no Club.
--   * Plus     everything in Free, the Club, more Ralf credits, 30 paid
--              lessons of the rider's choice, one 1-on-1 coach session.
--   * Premium  everything, two 1-on-1 coach sessions, one ticket to Equina's
--              annual event.
--
-- Riders see the names in plan_tiers.name. The keys stay free / mid / premium,
-- the ones coach_credit_policies has used since 202609270001, so renaming a
-- plan is one row in the admin and never a migration.
--
-- Billing is not here. A row in plan_subscriptions says which plan a rider
-- holds and until when; the store webhook will write those rows once the App
-- Store account exists, and until then staff give plans from the admin.
--
-- Nothing changes for riders until the `plans` flag is on. While it is off,
-- every signed-in rider has every lesson and the whole Club -- the founding
-- phase. Ralf's monthly credits follow the plan a rider actually holds either
-- way, because the coach_credits flag already decides whether Ralf is metered.

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
  ('plans', false, 0,
   'Applies each plan''s limits: Academy picks and Club access. While it is off every signed-in rider has everything (the founding phase). Turn it on for one account to try the Free experience; for everyone once riders can subscribe in the app.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- What each plan holds.
-- ---------------------------------------------------------------------------
-- Ralf's monthly credits are not a column here: they already live in
-- coach_credit_policies under the same keys, where the spend path reads them.
create table public.plan_tiers (
  key text primary key check (key in ('free', 'mid', 'premium')),
  name text not null check (char_length(trim(name)) between 1 and 40),
  -- Order on the plan screen, and which plan applies when a rider holds two --
  -- say one staff gave and one bought in the store.
  rank smallint not null unique check (rank between 0 and 10),
  -- Paid lessons a rider opens by picking them, on top of every free lesson.
  -- Null opens every lesson.
  academy_picks integer check (academy_picks is null or academy_picks between 0 and 1000),
  -- 'none': the Club tab says what is inside and which plan opens it;
  -- 'read': the feed, without posting, commenting or reacting;
  -- 'post': all of it.
  club_access text not null check (club_access in ('none', 'read', 'post')),
  -- Included 1-on-1 sessions with a coach and tickets to Equina's annual
  -- event. Shown on the plan screen; until there is a booking flow, staff
  -- arrange them with the rider by hand.
  coach_sessions smallint not null default 0 check (coach_sessions between 0 and 52),
  event_tickets smallint not null default 0 check (event_tickets between 0 and 10),
  -- The store's free trial, mirrored for the plan screen. The store decides
  -- who gets one; this only says how long it is.
  trial_days smallint not null default 0 check (trial_days between 0 and 31),
  note text check (note is null or char_length(note) <= 500),
  updated_at timestamptz not null default now(),
  constraint plan_tiers_free_has_no_trial check (key <> 'free' or trial_days = 0)
);

create trigger plan_tiers_set_updated_at
before update on public.plan_tiers
for each row execute function private.set_updated_at();

insert into public.plan_tiers(key, name, rank, academy_picks, club_access, coach_sessions, event_tickets, trial_days, note) values
  ('free', 'Free', 0, 2, 'none', 0, 0, 0,
   'Dev plan, Part 4: horse documents, 1-2 Academy videos of the rider''s choice, a few Ralf credits, no community.'),
  ('mid', 'Plus', 1, 30, 'post', 1, 0, 7,
   'Dev plan, Part 4 ("Mid"): everything in Free, the community, more Ralf credits, 30 Academy videos of the rider''s choice, one free 1-on-1 coach session.'),
  ('premium', 'Premium', 2, null, 'post', 2, 1, 7,
   'Dev plan, Part 4: full access except paid add-ons, two free 1-on-1 coach sessions, one free ticket to Equina''s annual event.')
on conflict (key) do nothing;

-- Free keeps the 15 credits measured in 202609270001. A Ralf message costs
-- about EUR 0.005 on claude-sonnet-5, so Premium's 300 is about EUR 1.60 a
-- month for a rider who uses every one -- generous, and still bounded.
insert into public.coach_credit_policies(key, monthly_credits, note) values
  ('mid', 100, 'Plus. About EUR 0.55 a month at full use, at the cost measured for the free tier.'),
  ('premium', 300, 'Premium. The draft says full access; a high monthly ceiling keeps Ralf''s cost bounded.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Who holds which plan.
-- ---------------------------------------------------------------------------
-- One row per rider per source, so a plan staff gave and a plan the rider
-- bought never overwrite each other; the higher-ranked one applies. Free is
-- the absence of a row.
create table public.plan_subscriptions (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (source in ('app_store', 'play', 'stripe', 'staff')),
  tier text not null references public.plan_tiers(key) check (tier <> 'free'),
  status text not null check (status in ('trialing', 'active', 'grace', 'expired', 'revoked')),
  -- The store's product and the purchase's stable id, so the webhook finds
  -- the row again on renewal, refund or expiry.
  product_id text check (product_id is null or char_length(product_id) <= 200),
  original_transaction_id text check (original_transaction_id is null or char_length(original_transaction_id) <= 200),
  -- Ralf's monthly allowance runs from here, like a store renewal does.
  started_at timestamptz not null default now(),
  trial_ends_at timestamptz,
  -- When the plan stops applying: the period end plus any grace for a store
  -- plan, empty for a staff plan with no end date. Like a credit batch, a
  -- plan lapses by predicate, so nothing has to run at the moment it does.
  ends_at timestamptz,
  note text check (note is null or char_length(note) <= 500),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, source),
  unique (source, original_transaction_id)
);

create trigger plan_subscriptions_set_updated_at
before update on public.plan_subscriptions
for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- The paid lessons a rider chose.
-- ---------------------------------------------------------------------------
-- A pick is final: a rider who could swap picks would watch every lesson two
-- at a time.
create table public.academy_lesson_picks (
  user_id uuid not null references auth.users(id) on delete cascade,
  lesson_id uuid not null references public.academy_lessons(id) on delete cascade,
  picked_at timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index academy_lesson_picks_order_idx
  on public.academy_lesson_picks(user_id, picked_at, lesson_id);

-- ---------------------------------------------------------------------------
-- Reading a rider's plan.
-- ---------------------------------------------------------------------------
-- The plan a rider holds: the highest-ranked one that has not lapsed, or Free.
create or replace function private.subscription_tier(target_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (
      select subscription.tier
      from public.plan_subscriptions subscription
      join public.plan_tiers tier on tier.key = subscription.tier
      where subscription.user_id = target_user
        and subscription.status in ('trialing', 'active', 'grace')
        and (subscription.ends_at is null or subscription.ends_at > now())
      order by tier.rank desc
      limit 1
    ),
    'free'
  );
$$;

-- The picks that count, in the order they were made. A pick of a lesson that
-- was unpublished or made free since no longer takes up a place.
create or replace function private.counted_lesson_picks(target_user uuid)
returns table (lesson_id uuid, place bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select pick.lesson_id, row_number() over (order by pick.picked_at, pick.lesson_id)
  from public.academy_lesson_picks pick
  join public.academy_lessons lesson on lesson.id = pick.lesson_id
  where pick.user_id = target_user
    and lesson.access = 'paid'
    and lesson.published_at is not null;
$$;

-- May this rider watch this lesson? Free lessons are open to every signed-in
-- rider. A paid one is open while plans are not enforced, on a plan that opens
-- every lesson, or when the rider picked it within their plan's allowance --
-- after a downgrade the earliest picks are the ones that stay open.
create or replace function private.lesson_open(target_user uuid, target_lesson uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  lesson_access public.academy_access;
  allowance integer;
begin
  select access into lesson_access from public.academy_lessons where id = target_lesson;
  if lesson_access is null or target_user is null then return false; end if;
  if lesson_access = 'free' then return true; end if;
  if not private.feature_enabled('plans', target_user) then return true; end if;

  select tier.academy_picks into allowance
  from public.plan_tiers tier
  where tier.key = private.subscription_tier(target_user);
  if not found then return false; end if;
  if allowance is null then return true; end if;

  return exists (
    select 1 from private.counted_lesson_picks(target_user) counted
    where counted.lesson_id = target_lesson and counted.place <= allowance
  );
end;
$$;

-- How much of the Club this rider has. Called from the Club's policies with
-- the rider's own session, which is why it defaults to auth.uid().
create or replace function private.club_access(target_user uuid default auth.uid())
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when target_user is null then 'none'
    when not private.feature_enabled('plans', target_user) then 'post'
    else coalesce(
      (select tier.club_access from public.plan_tiers tier where tier.key = private.subscription_tier(target_user)),
      'none'
    )
  end;
$$;

-- Everything the plan screen, the Academy and the Club need, in one answer.
create or replace function private.plan_state(target_user uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  held text := private.subscription_tier(target_user);
  holding public.plan_subscriptions%rowtype;
  allowance integer;
  used integer;
  open_picks uuid[];
begin
  select tier.academy_picks into allowance from public.plan_tiers tier where tier.key = held;

  -- The row behind the plan, when there is one. Of two sources for the same
  -- plan, the one that lasts longer is the one to show.
  select subscription.* into holding
  from public.plan_subscriptions subscription
  where subscription.user_id = target_user
    and subscription.tier = held
    and subscription.status in ('trialing', 'active', 'grace')
    and (subscription.ends_at is null or subscription.ends_at > now())
  order by subscription.ends_at desc nulls first
  limit 1;

  select
    count(*)::integer,
    coalesce(array_agg(counted.lesson_id order by counted.place)
      filter (where allowance is null or counted.place <= allowance), '{}')
  into used, open_picks
  from private.counted_lesson_picks(target_user) counted;

  return jsonb_build_object(
    'enforced', private.feature_enabled('plans', target_user),
    'tier', held,
    'status', holding.status,
    'source', holding.source,
    'trialEndsAt', holding.trial_ends_at,
    'endsAt', holding.ends_at,
    'clubAccess', private.club_access(target_user),
    'academy', jsonb_build_object(
      'picksLimit', allowance,
      'picksUsed', used,
      'openPicks', to_jsonb(open_picks)
    ),
    'tiers', (
      select jsonb_agg(jsonb_build_object(
        'key', tier.key,
        'name', tier.name,
        'academyPicks', tier.academy_picks,
        'clubAccess', tier.club_access,
        'monthlyCredits', coalesce(policy.monthly_credits, 0),
        'coachSessions', tier.coach_sessions,
        'eventTickets', tier.event_tickets,
        'trialDays', tier.trial_days
      ) order by tier.rank)
      from public.plan_tiers tier
      left join public.coach_credit_policies policy on policy.key = tier.key
    )
  );
end;
$$;

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
  return private.plan_state(auth.uid());
end;
$$;

-- ---------------------------------------------------------------------------
-- Picking a lesson.
-- ---------------------------------------------------------------------------
-- Answers with the rider's plan as it stands after the pick. Out of picks is
-- PT402, which PostgREST turns into HTTP 402: the app shows the plans, not an
-- error.
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
    return private.plan_state(actor_id);
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
  return private.plan_state(actor_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- Watching (202610050003), now asking the plan.
-- ---------------------------------------------------------------------------
-- 202610030001 said a paid lesson would check the rider's entitlement here
-- and nowhere else; this is that check. Staff preview every lesson.
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

-- ---------------------------------------------------------------------------
-- The Club, by plan.
-- ---------------------------------------------------------------------------
-- Restrictive, so they narrow the existing policies and never widen them.
-- Comments, reactions and media are read through their post (202607210003),
-- so a post a rider may not read takes its thread with it. Riders still see
-- their own posts on any plan, so they can always take one down. Reporting
-- stays open to everyone who can see a post: safety is never a paid feature.
create policy club_posts_plan_read on public.club_posts
as restrictive for select to authenticated
using ((select private.club_access()) <> 'none' or author_id = (select auth.uid()) or (select private.is_staff()));

create policy club_posts_plan_insert on public.club_posts
as restrictive for insert to authenticated
with check ((select private.club_access()) = 'post' or (select private.is_staff()));
create policy club_posts_plan_update on public.club_posts
as restrictive for update to authenticated
using ((select private.club_access()) = 'post' or (select private.is_staff()))
with check ((select private.club_access()) = 'post' or (select private.is_staff()));

create policy club_comments_plan_insert on public.club_comments
as restrictive for insert to authenticated
with check ((select private.club_access()) = 'post' or (select private.is_staff()));
create policy club_comments_plan_update on public.club_comments
as restrictive for update to authenticated
using ((select private.club_access()) = 'post' or (select private.is_staff()))
with check ((select private.club_access()) = 'post' or (select private.is_staff()));

create policy club_reactions_plan_insert on public.club_reactions
as restrictive for insert to authenticated
with check ((select private.club_access()) = 'post');
create policy club_reactions_plan_update on public.club_reactions
as restrictive for update to authenticated
using ((select private.club_access()) = 'post')
with check ((select private.club_access()) = 'post');

create policy club_post_media_plan_insert on public.club_post_media
as restrictive for insert to authenticated
with check ((select private.club_access()) = 'post' or (select private.is_staff()));

create policy club_memberships_plan_insert on public.club_memberships
as restrictive for insert to authenticated
with check ((select private.club_access()) = 'post');

-- ---------------------------------------------------------------------------
-- Ralf's allowance follows the plan.
-- ---------------------------------------------------------------------------
-- spend_coach_credits and my_coach_credit_status call this before reading a
-- balance (202609270001). The name predates plans: it now grants whichever
-- plan the rider holds, lazily, once per monthly period.
--
-- Free keeps its anchor (account creation) and its idempotency key, so a
-- rider who already received this month's free credits is not granted them a
-- second time by this migration. A paid plan's month runs from the day it
-- started, and its key names the plan and that start: moving up to Premium
-- grants Premium's allowance at once, on top of what is left.
create or replace function private.ensure_free_coach_credits(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  held text := private.subscription_tier(target_user);
  policy public.coach_credit_policies;
  holding public.plan_subscriptions;
  anchor timestamptz;
  window_row record;
begin
  select * into policy from public.coach_credit_policies where key = held;
  if policy.key is null or policy.monthly_credits < 1 then return; end if;

  if held = 'free' then
    select created_at into anchor from auth.users where id = target_user;
    if anchor is null then return; end if;

    select * into window_row from private.coach_credit_period(anchor, now());

    perform public.grant_coach_credits(
      target_user,
      'subscription',
      policy.monthly_credits,
      window_row.period_end,
      'free_tier',
      'free:' || window_row.period_index::text,
      'Free tier allowance'
    );
    return;
  end if;

  select subscription.* into holding
  from public.plan_subscriptions subscription
  where subscription.user_id = target_user
    and subscription.tier = held
    and subscription.status in ('trialing', 'active', 'grace')
    and (subscription.ends_at is null or subscription.ends_at > now())
  order by subscription.started_at asc
  limit 1;
  if holding.user_id is null then return; end if;

  select * into window_row from private.coach_credit_period(holding.started_at, now());

  perform public.grant_coach_credits(
    target_user,
    'subscription',
    policy.monthly_credits,
    -- A plan that ends mid-month takes its credits with it.
    least(window_row.period_end, coalesce(holding.ends_at, 'infinity'::timestamptz)),
    holding.source,
    format('plan:%s:%s:%s', held, floor(extract(epoch from holding.started_at))::bigint, window_row.period_index),
    'Plan allowance: ' || held
  );
end;
$$;

-- What the client reads (202609270001), now with the plan's own costs and
-- warning threshold rather than Free's.
create or replace function public.my_coach_credit_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  held text;
  policy public.coach_credit_policies;
  subscription_balance integer;
  purchased_balance integer;
  renews_at timestamptz;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;

  if not private.feature_enabled('coach_credits', actor_id) then
    return jsonb_build_object('metered', false);
  end if;

  perform private.ensure_free_coach_credits(actor_id);
  held := private.subscription_tier(actor_id);
  select * into policy from public.coach_credit_policies where key = held;
  if policy.key is null then
    select * into policy from public.coach_credit_policies where key = 'free';
  end if;

  select coalesce(sum(remaining), 0)::integer into subscription_balance
  from public.coach_credit_lots
  where user_id = actor_id and remaining > 0
    and bucket <> 'purchased'
    and (expires_at is null or expires_at > now());

  select coalesce(sum(remaining), 0)::integer into purchased_balance
  from public.coach_credit_lots
  where user_id = actor_id and remaining > 0 and bucket = 'purchased';

  select min(expires_at) into renews_at
  from public.coach_credit_lots
  where user_id = actor_id and remaining > 0 and expires_at > now();

  return jsonb_build_object(
    'metered', true,
    'tier', held,
    'monthlyCredits', coalesce(policy.monthly_credits, 0),
    'balance', subscription_balance + purchased_balance,
    'fromAllowance', subscription_balance,
    'purchased', purchased_balance,
    'renewsAt', renews_at,
    'costPerTextMessage', coalesce(policy.cost_per_text_message, 1),
    'costPerPhotoMessage', coalesce(policy.cost_per_photo_message, 3),
    'lowBalanceWarning', coalesce(policy.low_balance_warning, 3)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Staff: the plans themselves, and who holds one.
-- ---------------------------------------------------------------------------
-- Changing what a plan holds, or giving a rider a paid plan for free, is a
-- commercial decision, so these are admin powers -- with the second factor,
-- like feature flags (202610050001).
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('admin') and private.has_second_factor();
$$;

-- One plan at a time, saved as the admin shows it: the plan's row and its
-- Ralf allowance together.
create or replace function public.staff_update_plan_tier(
  tier_key text,
  name_input text,
  academy_picks_input integer,
  club_access_input text,
  monthly_credits_input integer,
  coach_sessions_input integer,
  event_tickets_input integer,
  trial_days_input integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Only an admin can change plans.' using errcode = '42501';
  end if;
  if not exists (select 1 from public.plan_tiers where key = tier_key) then
    raise exception 'Plan not found.' using errcode = 'P0002';
  end if;
  if name_input is null or char_length(trim(name_input)) not between 1 and 40 then
    raise exception 'Give the plan a name of up to 40 characters.' using errcode = '22023';
  end if;
  if academy_picks_input is not null and academy_picks_input not between 0 and 1000 then
    raise exception 'Lesson picks go from 0 to 1000, or empty for every lesson.' using errcode = '22023';
  end if;
  if club_access_input is null or club_access_input not in ('none', 'read', 'post') then
    raise exception 'Choose how much of the Club this plan opens.' using errcode = '22023';
  end if;
  if monthly_credits_input is null or monthly_credits_input not between 0 and 100000 then
    raise exception 'Ralf credits go from 0 to 100000 a month.' using errcode = '22023';
  end if;
  if coach_sessions_input is null or coach_sessions_input not between 0 and 52 then
    raise exception 'Coach sessions go from 0 to 52.' using errcode = '22023';
  end if;
  if event_tickets_input is null or event_tickets_input not between 0 and 10 then
    raise exception 'Event tickets go from 0 to 10.' using errcode = '22023';
  end if;
  if trial_days_input is null or trial_days_input not between 0 and 31 then
    raise exception 'A free trial lasts from 0 to 31 days.' using errcode = '22023';
  end if;
  if tier_key = 'free' and trial_days_input <> 0 then
    raise exception 'Free has no trial.' using errcode = '22023';
  end if;

  update public.plan_tiers set
    name = trim(name_input),
    academy_picks = academy_picks_input,
    club_access = club_access_input,
    coach_sessions = coach_sessions_input,
    event_tickets = event_tickets_input,
    trial_days = trial_days_input
  where key = tier_key;

  insert into public.coach_credit_policies(key, monthly_credits, updated_by, updated_at)
  values (tier_key, monthly_credits_input, auth.uid(), now())
  on conflict (key) do update set
    monthly_credits = excluded.monthly_credits,
    updated_by = excluded.updated_by,
    updated_at = excluded.updated_at;
end;
$$;

-- Give a rider a plan, change it, or take it back ('free'). Only the plan
-- staff gave is touched: a plan bought in the store is the store's to end.
create or replace function public.staff_set_plan(
  target_email text,
  tier_input text,
  ends_at_input timestamptz default null,
  note_input text default null
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_id uuid;
  note_text text := nullif(trim(coalesce(note_input, '')), '');
begin
  if not private.is_admin() then
    raise exception 'Only an admin can give or remove plans.' using errcode = '42501';
  end if;
  if tier_input is null or tier_input not in ('free', 'mid', 'premium') then
    raise exception 'Choose Free, Plus or Premium.' using errcode = '22023';
  end if;
  if ends_at_input is not null and ends_at_input <= now() then
    raise exception 'Choose an end date in the future, or leave it empty.' using errcode = '22023';
  end if;
  if note_text is not null and char_length(note_text) > 500 then
    raise exception 'Keep the note under 500 characters.' using errcode = '22023';
  end if;

  select id into target_id
  from auth.users
  where lower(email) = lower(trim(coalesce(target_email, '')))
  order by created_at desc
  limit 1;
  if target_id is null then
    raise exception 'No Equina account uses that email.' using errcode = 'P0002';
  end if;

  if tier_input = 'free' then
    update public.plan_subscriptions set
      status = 'revoked',
      ends_at = now(),
      note = coalesce(note_text, note),
      granted_by = auth.uid()
    where user_id = target_id and source = 'staff' and status <> 'revoked';
  else
    insert into public.plan_subscriptions(user_id, source, tier, status, started_at, ends_at, note, granted_by)
    values (target_id, 'staff', tier_input, 'active', now(), ends_at_input, note_text, auth.uid())
    on conflict (user_id, source) do update set
      tier = excluded.tier,
      status = 'active',
      -- A change to a plan that is still running keeps its monthly
      -- anniversary; one that had lapsed starts again today.
      started_at = case
        when plan_subscriptions.status in ('trialing', 'active', 'grace')
          and (plan_subscriptions.ends_at is null or plan_subscriptions.ends_at > now())
        then plan_subscriptions.started_at
        else excluded.started_at
      end,
      ends_at = excluded.ends_at,
      note = excluded.note,
      granted_by = excluded.granted_by;
  end if;

  return private.subscription_tier(target_id);
end;
$$;

create or replace function public.staff_list_plans()
returns table (
  user_id uuid,
  email text,
  display_name text,
  source text,
  tier text,
  tier_name text,
  status text,
  live boolean,
  started_at timestamptz,
  trial_ends_at timestamptz,
  ends_at timestamptz,
  note text,
  granted_by_email text,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.is_admin() then
    raise exception 'Only an admin can see who holds a plan.' using errcode = '42501';
  end if;

  return query
  select
    subscription.user_id,
    rider.email::text,
    profile.display_name,
    subscription.source,
    subscription.tier,
    plan.name,
    subscription.status,
    subscription.status in ('trialing', 'active', 'grace')
      and (subscription.ends_at is null or subscription.ends_at > now()),
    subscription.started_at,
    subscription.trial_ends_at,
    subscription.ends_at,
    subscription.note,
    granter.email::text,
    subscription.updated_at
  from public.plan_subscriptions subscription
  join auth.users rider on rider.id = subscription.user_id
  join public.plan_tiers plan on plan.key = subscription.tier
  left join public.profiles profile on profile.id = subscription.user_id
  left join auth.users granter on granter.id = subscription.granted_by
  order by subscription.updated_at desc
  limit 500;
end;
$$;

-- ---------------------------------------------------------------------------
-- Account erasure (202610020005), now naming the plan tables.
-- ---------------------------------------------------------------------------
-- A rider's picks and plans go with the account; the store keeps its own
-- billing records. A plan an erased staff member gave stays with the rider
-- who received it, without the name of who gave it.
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

-- ---------------------------------------------------------------------------
-- Access.
-- ---------------------------------------------------------------------------
alter table public.plan_tiers enable row level security;
alter table public.plan_subscriptions enable row level security;
alter table public.academy_lesson_picks enable row level security;

-- What a plan holds is product information: the plan screen renders before
-- the rider owns anything. Every write goes through staff_update_plan_tier.
create policy plan_tiers_read on public.plan_tiers
for select to anon, authenticated using (true);

-- A rider reads their own plan and picks. Nothing is written by a client:
-- picks go through pick_academy_lesson, plans through the store webhook or
-- staff_set_plan.
create policy plan_subscriptions_read_self on public.plan_subscriptions
for select to authenticated using (user_id = auth.uid());
create policy academy_lesson_picks_read_self on public.academy_lesson_picks
for select to authenticated using (user_id = auth.uid());

revoke all on public.plan_tiers from public, anon, authenticated;
revoke all on public.plan_subscriptions from public, anon, authenticated;
revoke all on public.academy_lesson_picks from public, anon, authenticated;

grant select on public.plan_tiers to anon, authenticated;
grant select on public.plan_subscriptions, public.academy_lesson_picks to authenticated;
grant select, insert, update, delete on
  public.plan_tiers,
  public.plan_subscriptions,
  public.academy_lesson_picks
to service_role;

revoke execute on function private.subscription_tier(uuid) from public, anon, authenticated;
revoke execute on function private.counted_lesson_picks(uuid) from public, anon, authenticated;
revoke execute on function private.lesson_open(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.plan_state(uuid) from public, anon, authenticated;
revoke execute on function private.club_access(uuid) from public, anon;
revoke execute on function private.is_admin() from public, anon, authenticated;
revoke execute on function public.my_plan() from public, anon;
revoke execute on function public.pick_academy_lesson(uuid) from public, anon;
revoke execute on function public.staff_update_plan_tier(text, text, integer, text, integer, integer, integer, integer) from public, anon;
revoke execute on function public.staff_set_plan(text, text, timestamptz, text) from public, anon;
revoke execute on function public.staff_list_plans() from public, anon;

-- The Club's policies call club_access with the rider's own session.
grant execute on function private.club_access(uuid) to authenticated;
grant execute on function public.my_plan() to authenticated;
grant execute on function public.pick_academy_lesson(uuid) to authenticated;
grant execute on function public.staff_update_plan_tier(text, text, integer, text, integer, integer, integer, integer) to authenticated;
grant execute on function public.staff_set_plan(text, text, timestamptz, text) to authenticated;
grant execute on function public.staff_list_plans() to authenticated;
grant execute on function private.subscription_tier(uuid) to service_role;
grant execute on function private.plan_state(uuid) to service_role;

commit;
