begin;

-- Ralf's monthly allowance for a plan bought in a store (202610060001).
--
-- A paid plan's credits were capped at the plan's ends_at, so a plan that
-- ends mid-month takes its credits with it. For a staff grant that is right:
-- staff chose the end date. For a store plan it is wrong. RevenueCat reports
-- ends_at as the end of the period the store has billed, which during a
-- free trial is day 7 -- so the credits granted on day 0 lapsed on day 7,
-- and when the trial converted the month's grant already existed (same
-- idempotency key, same period), leaving a new subscriber with no credits
-- for the rest of their first month. The same gap opened whenever a store
-- renewal fell before the plan's monthly anniversary.
--
-- A store plan's credits now last the whole allowance month. A rider who
-- cancels keeps what is left of that month's credits until the month ends,
-- which is the month they started.
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
    case
      -- A staff grant that ends mid-month takes its credits with it.
      when holding.source = 'staff'
        then least(window_row.period_end, coalesce(holding.ends_at, 'infinity'::timestamptz))
      -- A store plan's ends_at is only the billed period, which the store
      -- renews; the month's credits last the month.
      else window_row.period_end
    end,
    holding.source,
    format('plan:%s:%s:%s', held, floor(extract(epoch from holding.started_at))::bigint, window_row.period_index),
    'Plan allowance: ' || held
  );
end;
$$;

commit;
