begin;

-- Ralf's limits become commercial, not only defensive.
--
-- public.record_coach_request currently does two jobs in one function: 8
-- messages a minute (burst protection) and 60 per 24 hours (an arbitrary cost
-- ceiling, identical for everyone). They have different owners, units and
-- messages to the rider, so they split here:
--
--   * Anti-abuse stays in record_coach_request. It protects the API key when
--     something is wrong -- a scripted client, a retry storm, a stolen token.
--     It is never sold, never refunded, and never appears in a paywall.
--   * The commercial quota moves to a credit ledger: batches granted by
--     billing events, spent one at a time, audited append-only.
--
-- They never share a check, a table, an error code or a sentence. Someone who
-- typed fast is told to wait; someone out of credits is told what it costs to
-- continue. Mixing them is how a paywall ends up in front of a fast typist.
--
-- Error codes are PT402 and PT429 on purpose: PostgREST maps a PTxxx SQLSTATE
-- to that HTTP status, so the edge function gets the right status for free and
-- still reads the code from the error body. This replaces discriminating on
-- English substrings of the message, which broke silently on any rewording.

alter table public.app_feature_flags
  drop constraint if exists app_feature_flags_key_check;
alter table public.app_feature_flags
  add constraint app_feature_flags_key_check
  check (key in (
    'account_settings',
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
  ('coach_credits', false, 0,
   'Turn on only once a billing webhook grants batches and the paywall copy is written. While it is off, coach-chat runs on the anti-abuse limits alone and nothing is metered.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Policy: what a plan is worth, as data rather than code.
-- ---------------------------------------------------------------------------
-- These numbers change more often than anything else in the system, and
-- changing one must never need a migration or a deploy. A photo costs more
-- than a sentence because the image stays in context and is re-paid on every
-- following turn -- that ratio lives here too.
--
-- A tier with no row resolves to no credits. Absence fails closed, which is
-- why only 'free' is seeded: free is a cost we choose, while mid and premium
-- are a commercial decision nobody has made yet.
create table public.coach_credit_policies (
  key text primary key check (key in ('free', 'mid', 'premium')),
  monthly_credits integer not null check (monthly_credits between 0 and 100000),
  cost_per_text_message smallint not null default 1 check (cost_per_text_message between 1 and 100),
  cost_per_photo_message smallint not null default 3 check (cost_per_photo_message between 1 and 100),
  -- Warn before the balance runs out, never in the middle of a thought.
  low_balance_warning smallint not null default 3 check (low_balance_warning between 0 and 1000),
  note text check (note is null or char_length(note) <= 500),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Batches: the enforcement surface.
-- ---------------------------------------------------------------------------
-- A batch is one grant with its own validity and its own counter. Two
-- properties make this work with no job sweeping every account:
--
--   * Validity is a predicate, not an event. An expired batch stops matching
--     `expires_at > now()`; nothing has to delete or zero it. A month ending
--     at 03:00 on the 14th needs no cron at 03:00 on the 14th.
--   * `remaining` carries a check constraint, so the database itself refuses
--     to go negative. The ledger below is the auditable truth; this counter is
--     where the rule is enforced. Both are written in the same transaction and
--     must always agree -- see private.coach_credit_drift() at the end.
create table public.coach_credit_lots (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null check (bucket in ('subscription', 'purchased', 'promo')),
  granted integer not null check (granted between 1 and 100000),
  remaining integer not null check (remaining >= 0),
  -- null never expires. Subscription batches always carry the period end the
  -- store reported plus grace; purchased ones must be null, because credits
  -- bought through in-app purchase may not expire under store rules.
  expires_at timestamptz,
  source text not null check (source in ('stripe', 'app_store', 'play', 'free_tier', 'staff', 'promo')),
  -- The idempotency key. On a Stripe renewal it is the invoice id; on the App
  -- Store the original transaction id plus the period; on the free tier
  -- 'free:2026-09-27'. Replaying a webhook ten times grants credits once.
  source_ref text not null check (char_length(trim(source_ref)) between 1 and 200),
  note text check (note is null or char_length(note) <= 500),
  created_at timestamptz not null default now(),
  constraint coach_credit_lots_remaining_within_granted check (remaining <= granted),
  constraint coach_credit_lots_purchased_never_expire
    check (bucket <> 'purchased' or expires_at is null),
  unique (user_id, source, source_ref)
);

-- Exactly what the spend path reads: the rider's unexpired batches that still
-- hold something, soonest to die at the front.
create index coach_credit_lots_spendable_idx
  on public.coach_credit_lots(user_id, expires_at asc nulls last, id asc)
  where remaining > 0;

-- ---------------------------------------------------------------------------
-- Ledger: the auditable truth.
-- ---------------------------------------------------------------------------
-- A mutable `credits_remaining` integer answers "how many do I have" and
-- nothing else. It cannot answer "why seven and not nine", it does not survive
-- a duplicated webhook, it never reconciles against the provider invoice, and
-- a write bug in it is invisible and permanent.
create table public.coach_credit_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Set when a single batch covered the line, which is the common case.
  lot_id bigint references public.coach_credit_lots(id) on delete set null,
  -- When a spend crosses two batches the split is recorded here, as
  -- [{"lot": 12, "credits": 2}, {"lot": 19, "credits": 1}].
  lots jsonb not null default '[]'::jsonb check (jsonb_typeof(lots) = 'array'),
  delta integer not null check (delta <> 0),
  kind text not null check (kind in ('grant', 'spend', 'refund', 'clawback', 'expiry')),
  reason text check (reason is null or char_length(reason) <= 200),
  request_key uuid,
  created_at timestamptz not null default now()
);

-- One spend and one refund per request key. This is what makes a device that
-- retries after a timeout charge once, and a provider failure refund once.
create unique index coach_credit_ledger_request_kind_idx
  on public.coach_credit_ledger(user_id, request_key, kind)
  where request_key is not null;

create index coach_credit_ledger_user_idx
  on public.coach_credit_ledger(user_id, created_at desc);

-- Append-only is enforced, not merely intended. An audit trail that can be
-- edited is a log, not an audit trail.
create or replace function private.reject_ledger_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'The coach credit ledger is append-only'
    using errcode = 'PT403';
end;
$$;

create trigger coach_credit_ledger_no_update
before update or delete on public.coach_credit_ledger
for each row execute function private.reject_ledger_write();


-- ---------------------------------------------------------------------------
-- Reading the balance.
-- ---------------------------------------------------------------------------
create or replace function private.coach_credit_balance(target_user uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(remaining), 0)::integer
  from public.coach_credit_lots
  where user_id = target_user
    and remaining > 0
    and (expires_at is null or expires_at > now());
$$;

-- The monthly window, anchored to the day the rider started rather than the
-- 1st. Billing on the 28th otherwise buys a full month of credits for three
-- days, then another full month three days later.
--
-- The anchor is always the ORIGINAL moment, multiplied: adding one month to
-- the previous period instead would drift. Postgres clamps 31 Jan + 1 month to
-- 28 Feb, which is correct, but 28 Feb + 1 month is 28 Mar, not 31 Mar -- so
-- iterating walks the anniversary of anyone who starts on the 29th, 30th or
-- 31st permanently backwards.
create or replace function private.coach_credit_period(
  anchor timestamptz,
  at_moment timestamptz
)
returns table (period_index integer, period_start timestamptz, period_end timestamptz)
language sql
immutable
set search_path = ''
as $$
  select
    months,
    anchor + (months * interval '1 month'),
    anchor + ((months + 1) * interval '1 month')
  from (
    select greatest(
      0,
      (extract(year from age(at_moment, anchor)) * 12
        + extract(month from age(at_moment, anchor)))::integer
    ) as months
  ) elapsed;
$$;

-- ---------------------------------------------------------------------------
-- Granting.
-- ---------------------------------------------------------------------------
-- The single writer of batches. Every grant is idempotent on
-- (user, source, source_ref), so a webhook replayed ten times grants once.
create or replace function public.grant_coach_credits(
  target_user_id uuid,
  bucket_input text,
  credits_input integer,
  expires_at_input timestamptz,
  source_input text,
  source_ref_input text,
  note_input text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_lot public.coach_credit_lots;
begin
  if target_user_id is null then raise exception 'User is required'; end if;
  if credits_input is null or credits_input < 1 then
    raise exception 'Credits must be positive';
  end if;

  insert into public.coach_credit_lots(
    user_id, bucket, granted, remaining, expires_at, source, source_ref, note
  ) values (
    target_user_id,
    bucket_input,
    credits_input,
    credits_input,
    case when bucket_input = 'purchased' then null else expires_at_input end,
    source_input,
    source_ref_input,
    note_input
  )
  on conflict (user_id, source, source_ref) do nothing
  returning * into new_lot;

  -- Already granted. Report it plainly rather than raising: a webhook retry is
  -- normal traffic, not an error, and the caller wants the balance either way.
  if new_lot.id is null then
    return jsonb_build_object(
      'granted', 0,
      'idempotent', true,
      'balance', private.coach_credit_balance(target_user_id)
    );
  end if;

  insert into public.coach_credit_ledger(user_id, lot_id, lots, delta, kind, reason)
  values (
    target_user_id,
    new_lot.id,
    jsonb_build_array(jsonb_build_object('lot', new_lot.id, 'credits', credits_input)),
    credits_input,
    'grant',
    source_input || ':' || source_ref_input
  );

  return jsonb_build_object(
    'granted', credits_input,
    'idempotent', false,
    'balance', private.coach_credit_balance(target_user_id)
  );
end;
$$;

-- The free tier is granted lazily, on next use, rather than by a job that
-- sweeps every account every month. source_ref carries the period index, so
-- two simultaneous first messages produce exactly one batch -- the unique
-- index decides, not a race.
create or replace function private.ensure_free_coach_credits(target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  policy public.coach_credit_policies;
  anchor timestamptz;
  window_row record;
begin
  select * into policy from public.coach_credit_policies where key = 'free';
  if policy.key is null or policy.monthly_credits < 1 then return; end if;

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
end;
$$;

-- ---------------------------------------------------------------------------
-- Spending.
-- ---------------------------------------------------------------------------
create or replace function public.spend_coach_credits(
  target_user_id uuid,
  request_key_input uuid,
  cost_input integer,
  reason_input text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  already integer;
  spendable integer;
  taken integer := 0;
  claimed integer;
  chosen record;
  split jsonb := '[]'::jsonb;
begin
  if target_user_id is null then raise exception 'User is required'; end if;
  if request_key_input is null then raise exception 'Request key is required'; end if;
  if cost_input is null or cost_input < 1 or cost_input > 100 then
    raise exception 'Credit cost is out of range';
  end if;

  -- Serialise spending per rider. The check constraint on remaining already
  -- makes a negative balance impossible, but a constraint violation is a 500,
  -- not a paywall: without this lock two simultaneous requests race, one dies
  -- on the constraint, and the rider sees a crash instead of "1 credit left".
  -- The lock lives only for this transaction and is per rider, so it never
  -- serialises the table. 4711 is an arbitrary but fixed namespace, so this
  -- lock cannot collide with another advisory lock in the database.
  perform pg_advisory_xact_lock(4711, hashtext(target_user_id::text));

  -- Whether this account is metered at all lives here, not in the edge
  -- function. While the flag is off nothing is charged and nothing is
  -- recorded, and the caller is told plainly -- so the one place that decides
  -- "is Ralf metered" is the same place that decides what a credit costs.
  if not private.feature_enabled('coach_credits', target_user_id) then
    return jsonb_build_object('metered', false, 'spent', 0, 'idempotent', false);
  end if;

  -- Idempotency first, because it is the cheapest answer. The device retries
  -- with the same nonce after a timeout; the second call must return the first
  -- call's result rather than charging again.
  select coalesce(-sum(delta), 0) into already
  from public.coach_credit_ledger
  where user_id = target_user_id
    and request_key = request_key_input
    and kind = 'spend';
  if already > 0 then
    return jsonb_build_object(
      'metered', true,
      'spent', already,
      'idempotent', true,
      'balance', private.coach_credit_balance(target_user_id)
    );
  end if;

  perform private.ensure_free_coach_credits(target_user_id);

  -- Read the balance BEFORE touching any batch. The loop below decrements as
  -- it goes and the whole transaction unwinds if it cannot finish, so a
  -- balance read at raise time would report the partially drained state and
  -- tell the rider they have fewer credits than they really do.
  spendable := private.coach_credit_balance(target_user_id);
  if spendable < cost_input then
    raise exception 'Coach credits exhausted'
      using errcode = 'PT402',
            detail = format('needed %s, spendable %s', cost_input, spendable);
  end if;

  -- Spend what dies first. Subscription batches carry the period end and
  -- purchased ones never expire, so ordering by expires_at with nulls last is
  -- the entire consumption policy: a rider never loses a pack they paid for
  -- because a monthly allowance was sitting next to it.
  while taken < cost_input loop
    select id, remaining into chosen
    from public.coach_credit_lots
    where user_id = target_user_id
      and remaining > 0
      and (expires_at is null or expires_at > now())
    order by expires_at asc nulls last, id asc
    limit 1
    for update;

    -- Unreachable while the balance check above holds, and kept as a guard
    -- rather than an assumption: nothing was charged, because the exception
    -- unwinds every decrement this loop already made.
    if chosen.id is null then
      raise exception 'Coach credits exhausted'
        using errcode = 'PT402',
              detail = format('needed %s, spendable %s', cost_input, spendable);
    end if;

    claimed := least(chosen.remaining, cost_input - taken);

    update public.coach_credit_lots
    set remaining = remaining - claimed
    where id = chosen.id;

    split := split || jsonb_build_array(
      jsonb_build_object('lot', chosen.id, 'credits', claimed)
    );
    taken := taken + claimed;
  end loop;

  insert into public.coach_credit_ledger(
    user_id, lot_id, lots, delta, kind, reason, request_key
  ) values (
    target_user_id,
    case when jsonb_array_length(split) = 1
      then (split -> 0 ->> 'lot')::bigint
      else null
    end,
    split,
    -cost_input,
    'spend',
    reason_input,
    request_key_input
  );

  return jsonb_build_object(
    'metered', true,
    'spent', cost_input,
    'idempotent', false,
    'balance', private.coach_credit_balance(target_user_id)
  );
end;
$$;

-- Nobody pays for a 503. The refund returns credits to the batches they came
-- out of, and is idempotent on the same request key.
create or replace function public.refund_coach_credits(
  target_user_id uuid,
  request_key_input uuid,
  reason_input text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  spend_row public.coach_credit_ledger;
  entry jsonb;
  returned integer := 0;
begin
  if target_user_id is null then raise exception 'User is required'; end if;
  if request_key_input is null then raise exception 'Request key is required'; end if;

  perform pg_advisory_xact_lock(4711, hashtext(target_user_id::text));

  if exists (
    select 1 from public.coach_credit_ledger
    where user_id = target_user_id and request_key = request_key_input and kind = 'refund'
  ) then
    return jsonb_build_object(
      'refunded', 0,
      'idempotent', true,
      'balance', private.coach_credit_balance(target_user_id)
    );
  end if;

  select * into spend_row
  from public.coach_credit_ledger
  where user_id = target_user_id and request_key = request_key_input and kind = 'spend';

  if spend_row.id is null then
    return jsonb_build_object(
      'refunded', 0,
      'idempotent', false,
      'balance', private.coach_credit_balance(target_user_id)
    );
  end if;

  -- Put each share back where it came from. A batch that expired in the
  -- meantime still receives its share: the row stays honest, and the
  -- expires_at predicate keeps it out of the spendable balance anyway.
  for entry in select * from jsonb_array_elements(spend_row.lots)
  loop
    update public.coach_credit_lots
    set remaining = least(granted, remaining + (entry ->> 'credits')::integer)
    where id = (entry ->> 'lot')::bigint;
    returned := returned + (entry ->> 'credits')::integer;
  end loop;

  insert into public.coach_credit_ledger(
    user_id, lot_id, lots, delta, kind, reason, request_key
  ) values (
    target_user_id, spend_row.lot_id, spend_row.lots, returned, 'refund', reason_input, request_key_input
  );

  return jsonb_build_object(
    'refunded', returned,
    'idempotent', false,
    'balance', private.coach_credit_balance(target_user_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Anti-abuse, now on its own.
-- ---------------------------------------------------------------------------
-- The 60-per-day ceiling leaves: it was a commercial limit wearing a safety
-- costume. What stays is a burst window and a runaway ceiling set far above
-- any paid allowance -- if a real rider reaches it, the number is wrong, not
-- the rider. Neither ever appears in a paywall.
create or replace function public.record_coach_request(
  target_user_id uuid,
  request_key_input uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  minute_count integer;
  day_count integer;
begin
  if target_user_id is null then raise exception 'User is required'; end if;
  if exists (
    select 1 from public.coach_usage_events
    where user_id = target_user_id and request_key = request_key_input
  ) then return false;
  end if;

  -- Eight in a minute is typing speed, not money.
  select count(*) into minute_count
  from public.coach_usage_events
  where user_id = target_user_id and created_at > now() - interval '1 minute';
  if minute_count >= 8 then
    raise exception 'Coach chat minute limit exceeded' using errcode = 'PT429';
  end if;

  -- The runaway ceiling: a scripted client, a retry storm, a stolen token.
  select count(*) into day_count
  from public.coach_usage_events
  where user_id = target_user_id and created_at > now() - interval '24 hours';
  if day_count >= 400 then
    raise exception 'Coach chat safety ceiling exceeded' using errcode = 'PT429';
  end if;

  insert into public.coach_usage_events(user_id, request_key)
  values (target_user_id, request_key_input);
  return true;
end;
$$;

-- ---------------------------------------------------------------------------
-- What the client reads.
-- ---------------------------------------------------------------------------
create or replace function public.my_coach_credit_status()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  policy public.coach_credit_policies;
  subscription_balance integer;
  purchased_balance integer;
  renews_at timestamptz;
begin
  if actor_id is null then raise exception 'Authentication is required'; end if;

  -- While the flag is off nothing is metered, and the client must be able to
  -- tell "unlimited for now" from "zero left". Reporting metered: false is
  -- what stops a paywall appearing before there is anything to sell.
  if not private.feature_enabled('coach_credits', actor_id) then
    return jsonb_build_object('metered', false);
  end if;

  perform private.ensure_free_coach_credits(actor_id);
  select * into policy from public.coach_credit_policies where key = 'free';

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

-- The batches and the ledger are written in the same transaction and must
-- always agree. This returns rows only when they do not, which means a bug --
-- run it from the reconciler, and alert on any output at all.
create or replace function private.coach_credit_drift()
returns table (user_id uuid, lot_total integer, ledger_total integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    lots.user_id,
    lots.total::integer,
    coalesce(entries.total, 0)::integer
  from (
    select user_id, sum(remaining) as total
    from public.coach_credit_lots group by user_id
  ) lots
  left join (
    select user_id, sum(delta) as total
    from public.coach_credit_ledger group by user_id
  ) entries on entries.user_id = lots.user_id
  where lots.total is distinct from coalesce(entries.total, 0);
$$;

-- ---------------------------------------------------------------------------
-- Access.
-- ---------------------------------------------------------------------------
alter table public.coach_credit_policies enable row level security;
alter table public.coach_credit_lots enable row level security;
alter table public.coach_credit_ledger enable row level security;

-- Plan contents are product information: a rider has to be able to render a
-- paywall before owning anything.
create policy coach_credit_policies_read on public.coach_credit_policies
for select to anon, authenticated using (true);
create policy coach_credit_policies_staff_manage on public.coach_credit_policies
for all to authenticated
using (private.is_staff()) with check (private.is_staff());

-- "Where did my credits go" is a support question a rider should be able to
-- answer alone, so history is readable. Writing, never: every grant and every
-- spend goes through a security definer function called by the service role.
create policy coach_credit_lots_read_self on public.coach_credit_lots
for select to authenticated using (user_id = auth.uid());
create policy coach_credit_ledger_read_self on public.coach_credit_ledger
for select to authenticated using (user_id = auth.uid());

revoke all on public.coach_credit_lots from public, anon;
revoke all on public.coach_credit_ledger from public, anon;

grant select on public.coach_credit_policies to anon, authenticated;
grant insert, update, delete on public.coach_credit_policies to authenticated;
grant select on public.coach_credit_lots, public.coach_credit_ledger to authenticated;

grant select, insert, update, delete on
  public.coach_credit_policies,
  public.coach_credit_lots,
  public.coach_credit_ledger
to service_role;
grant usage, select on sequence public.coach_credit_lots_id_seq to service_role;
grant usage, select on sequence public.coach_credit_ledger_id_seq to service_role;

revoke execute on function public.grant_coach_credits(uuid, text, integer, timestamptz, text, text, text) from public, anon, authenticated;
revoke execute on function public.spend_coach_credits(uuid, uuid, integer, text) from public, anon, authenticated;
revoke execute on function public.refund_coach_credits(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function private.coach_credit_balance(uuid) from public, anon, authenticated;
revoke execute on function private.ensure_free_coach_credits(uuid) from public, anon, authenticated;
revoke execute on function private.coach_credit_period(timestamptz, timestamptz) from public, anon, authenticated;
revoke execute on function private.coach_credit_drift() from public, anon, authenticated;
revoke execute on function public.my_coach_credit_status() from public, anon;

grant execute on function public.grant_coach_credits(uuid, text, integer, timestamptz, text, text, text) to service_role;
grant execute on function public.spend_coach_credits(uuid, uuid, integer, text) to service_role;
grant execute on function public.refund_coach_credits(uuid, uuid, text) to service_role;
grant execute on function private.coach_credit_balance(uuid) to service_role;
grant execute on function private.ensure_free_coach_credits(uuid) to service_role;
grant execute on function private.coach_credit_drift() to service_role;
grant execute on function public.my_coach_credit_status() to authenticated;

-- ---------------------------------------------------------------------------
-- Opening numbers. Adjustable without a migration.
-- ---------------------------------------------------------------------------
-- Only the free tier is seeded, and deliberately. Free is a cost we choose:
-- measured against real traffic on claude-sonnet-5 (716 in / 419 out per
-- message on the first production messages), 15 credits is about EUR 0.08 a
-- month per free rider -- enough to feel what Ralf is for, not enough to live
-- on. Mid and premium are a commercial decision nobody has made yet, and a
-- missing row resolves to no credits, so absence fails closed.
insert into public.coach_credit_policies(key, monthly_credits, note) values
  ('free', 15, 'Measured against real usage on claude-sonnet-5. Re-derive from coach_message_operations before raising it.')
on conflict (key) do nothing;

commit;
