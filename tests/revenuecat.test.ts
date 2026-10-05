import assert from "node:assert/strict";
import {
  fetchRevenueCatSubscriber,
  holdsUnplacedPlan,
  isRiderId,
  maxRidersPerEvent,
  planSourceForStore,
  planSubscriptionWrites,
  RevenueCatFailure,
  revenueCatEventUserIds,
  sameSecret,
  storePlansFromSubscriber,
  tierForEntitlement,
  type PlanSubscriptionRow,
  type StorePlan
} from "../supabase/functions/_shared/revenuecat";

const now = Date.parse("2026-10-05T12:00:00.000Z");
const day = 24 * 60 * 60 * 1000;
const at = (days: number) => new Date(now + days * day).toISOString();
const rider = "5f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
const otherRider = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";

// A v1 subscription as RevenueCat documents it, bought a while ago and paid
// up for the next twenty days. store_transaction_id is a number in their own
// example, so it is one here too.
const subscription = (overrides: Record<string, unknown> = {}) => ({
  auto_resume_date: null,
  billing_issues_detected_at: null,
  display_name: "Equina",
  expires_date: at(20),
  grace_period_expires_date: null,
  is_sandbox: false,
  original_purchase_date: at(-40),
  ownership_type: "PURCHASED",
  period_type: "normal",
  price: { amount: 9.99, currency: "EUR" },
  purchase_date: at(-10),
  refunded_at: null,
  store: "app_store",
  store_transaction_id: 1000000652379790,
  unsubscribe_detected_at: null,
  ...overrides
});
const entitlementFor = (productId: string, held: Record<string, unknown>) => ({
  expires_date: held.expires_date ?? null,
  grace_period_expires_date: held.grace_period_expires_date ?? null,
  product_identifier: productId,
  purchase_date: held.purchase_date ?? null
});
// A customer holding each product under the entitlement named for it.
const customer = (holdings: Array<{ entitlement: string; product: string; subscription: Record<string, unknown> }>) => ({
  entitlements: Object.fromEntries(holdings.map((held) => [held.entitlement, entitlementFor(held.product, held.subscription)])),
  first_seen: at(-60),
  last_seen: at(0),
  management_url: "https://apps.apple.com/account/subscriptions",
  non_subscriptions: {},
  original_app_user_id: rider,
  original_application_version: "1.0",
  original_purchase_date: at(-40),
  other_purchases: {},
  subscriber_attributes: {},
  subscriptions: Object.fromEntries(holdings.map((held) => [held.product, held.subscription]))
});
const plans = (subscriber: unknown, options?: { acceptTestStore?: boolean }) =>
  storePlansFromSubscriber(subscriber, now, options);
const onlyPlan = (subscriber: unknown, options?: { acceptTestStore?: boolean }) => {
  const found = plans(subscriber, options);
  assert.equal(found.length, 1, "Expected exactly one store plan.");
  return found[0] as StorePlan;
};

// --- The shared contract --------------------------------------------------------------

assert.equal(tierForEntitlement("plus"), "mid", "Plus is the 'mid' plan in the database.");
assert.equal(tierForEntitlement("premium"), "premium");
assert.equal(tierForEntitlement("Premium"), null, "RevenueCat entitlement ids are case-sensitive.");
assert.equal(tierForEntitlement("pro"), null);
assert.equal(tierForEntitlement("constructor"), null);

assert.equal(planSourceForStore("APP_STORE"), "app_store");
assert.equal(planSourceForStore("app_store"), "app_store", "v1 writes stores in lower case, webhooks in upper.");
assert.equal(planSourceForStore("MAC_APP_STORE"), "app_store");
assert.equal(planSourceForStore("play_store"), "play");
assert.equal(planSourceForStore("STRIPE"), "stripe");
assert.equal(planSourceForStore("rc_billing"), "stripe");
for (const ignored of ["PROMOTIONAL", "promotional", "AMAZON", "PADDLE", "ROKU", "GALAXY", "EXTERNAL", "UNKNOWN_STORE", "", null, 3]) {
  assert.equal(planSourceForStore(ignored), null, `${String(ignored)} must not become a plan row.`);
}
assert.equal(planSourceForStore("TEST_STORE"), null, "Test Store purchases are not real unless a test project says so.");
assert.equal(planSourceForStore("test_store", { acceptTestStore: true }), "app_store");

// --- How a store plan stands ------------------------------------------------------------

// Paying and renewing.
assert.deepEqual(
  onlyPlan(customer([{ entitlement: "premium", product: "equina.premium.monthly", subscription: subscription() }])),
  {
    source: "app_store",
    tier: "premium",
    status: "active",
    product_id: "equina.premium.monthly",
    original_transaction_id: null,
    started_at: at(-40),
    trial_ends_at: null,
    ends_at: at(20),
    note: null,
    granted_by: null
  },
  "started_at is the first purchase, not this period's, so Ralf's credits keep their anniversary."
);

// The free week.
{
  const plan = onlyPlan(customer([{
    entitlement: "plus",
    product: "equina.plus.annual",
    subscription: subscription({ period_type: "trial", expires_date: at(5), original_purchase_date: at(-2), purchase_date: at(-2) })
  }]));
  assert.equal(plan.tier, "mid");
  assert.equal(plan.status, "trialing");
  assert.equal(plan.trial_ends_at, at(5), "A trial ends when its period does.");
  assert.equal(plan.ends_at, at(5));
  assert.equal(onlyPlan(customer([{
    entitlement: "plus",
    product: "equina.plus.annual",
    subscription: subscription({ period_type: "TRIAL", expires_date: at(5) })
  }])).status, "trialing", "Webhooks write period types in upper case; v1 in lower.");
}
// A paid introductory price is not a trial.
assert.equal(onlyPlan(customer([{ entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ period_type: "intro" }) }])).status, "active");

// The card was declined: Apple keeps the plan open through the grace period.
{
  const plan = onlyPlan(customer([{
    entitlement: "premium",
    product: "equina.premium.monthly",
    subscription: subscription({ expires_date: at(-1), billing_issues_detected_at: at(-1), grace_period_expires_date: at(15) })
  }]));
  assert.equal(plan.status, "grace");
  assert.equal(plan.ends_at, at(15), "In grace, the plan lasts until the grace period does.");
  assert.equal(plan.trial_ends_at, null);
}
// A billing issue found before the period is over.
assert.equal(onlyPlan(customer([{
  entitlement: "premium",
  product: "equina.premium.monthly",
  subscription: subscription({ expires_date: at(2), billing_issues_detected_at: at(-1), grace_period_expires_date: at(16) })
}])).status, "grace");
// A billing issue with no grace period: open until the period ends.
{
  const plan = onlyPlan(customer([{
    entitlement: "premium",
    product: "equina.premium.monthly",
    subscription: subscription({ expires_date: at(2), billing_issues_detected_at: at(-1) })
  }]));
  assert.equal(plan.status, "active");
  assert.equal(plan.ends_at, at(2));
}
// A trial whose first payment failed is in grace, not still on trial.
assert.equal(onlyPlan(customer([{
  entitlement: "plus",
  product: "equina.plus.monthly",
  subscription: subscription({ period_type: "trial", expires_date: at(-1), billing_issues_detected_at: at(-1), grace_period_expires_date: at(6) })
}])).status, "grace");

// Lapsed, with and without a grace period that also ran out.
{
  const lapsed = onlyPlan(customer([{
    entitlement: "plus",
    product: "equina.plus.monthly",
    subscription: subscription({ expires_date: at(-3), unsubscribe_detected_at: at(-20) })
  }]));
  assert.equal(lapsed.status, "expired");
  assert.equal(lapsed.ends_at, at(-3));
  const graceOver = onlyPlan(customer([{
    entitlement: "plus",
    product: "equina.plus.monthly",
    subscription: subscription({ expires_date: at(-20), billing_issues_detected_at: at(-20), grace_period_expires_date: at(-4) })
  }]));
  assert.equal(graceOver.status, "expired", "A grace period that ended is no grace.");
  assert.equal(graceOver.ends_at, at(-20));
  // Expiring this very moment counts as expired.
  assert.equal(onlyPlan(customer([{
    entitlement: "plus",
    product: "equina.plus.monthly",
    subscription: subscription({ expires_date: new Date(now).toISOString() })
  }])).status, "expired");
}

// Refunded: taken back, whatever the dates say.
{
  const plan = onlyPlan(customer([{
    entitlement: "premium",
    product: "equina.premium.annual",
    subscription: subscription({ refunded_at: at(-1), expires_date: at(300) })
  }]));
  assert.equal(plan.status, "revoked");
  assert.equal(plan.trial_ends_at, null);
  assert.equal(onlyPlan(customer([{
    entitlement: "premium",
    product: "equina.premium.annual",
    subscription: subscription({ refunded_at: at(-1), period_type: "trial", expires_date: at(3), grace_period_expires_date: at(9), billing_issues_detected_at: at(-1) })
  }])).status, "revoked", "A refund outranks a trial and a grace period.");
}

// App Review buys in the sandbox: those purchases open the plan like any other.
{
  const plan = onlyPlan(customer([{ entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ is_sandbox: true }) }]));
  assert.equal(plan.status, "active");
  assert.equal(plan.note, "sandbox");
  assert.equal(onlyPlan(customer([{ entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ is_sandbox: "true" }) }])).note, null);
}

// --- One row per store ------------------------------------------------------------------

// Plus and Premium both live in the same store (mid-upgrade): Premium wins.
assert.deepEqual(
  plans(customer([
    { entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ expires_date: at(25) }) },
    { entitlement: "premium", product: "equina.premium.monthly", subscription: subscription({ expires_date: at(10) }) }
  ])).map((plan) => [plan.source, plan.tier, plan.product_id]),
  [["app_store", "premium", "equina.premium.monthly"]]
);
// Premium lapsed after a downgrade: the plan held now beats the higher one that ended.
assert.deepEqual(
  plans(customer([
    { entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ expires_date: at(25) }) },
    { entitlement: "premium", product: "equina.premium.monthly", subscription: subscription({ expires_date: at(-5) }) }
  ])).map((plan) => [plan.tier, plan.status]),
  [["mid", "active"]]
);
// Nothing live: the one that ended last says how the store's plan ended.
assert.deepEqual(
  plans(customer([
    { entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ expires_date: at(-2) }) },
    { entitlement: "premium", product: "equina.premium.monthly", subscription: subscription({ expires_date: at(-30) }) }
  ])).map((plan) => [plan.tier, plan.status, plan.ends_at]),
  [["mid", "expired", at(-2)]]
);
// RevenueCat setups often attach Premium's products to the "plus" entitlement
// too, so checking "plus" covers both. The product is still Premium.
{
  const premium = subscription();
  assert.deepEqual(
    plans({
      entitlements: {
        plus: entitlementFor("equina.premium.monthly", premium),
        premium: entitlementFor("equina.premium.monthly", premium)
      },
      subscriptions: { "equina.premium.monthly": premium }
    }).map((plan) => [plan.source, plan.tier]),
    [["app_store", "premium"]]
  );
}
// Two stores, two rows, each its own plan; and the order never depends on RevenueCat's.
assert.deepEqual(
  plans(customer([
    { entitlement: "premium", product: "equina.premium.annual", subscription: subscription({ store: "stripe", is_sandbox: true }) },
    { entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ store: "APP_STORE", period_type: "trial", expires_date: at(4) }) }
  ])).map((plan) => [plan.source, plan.tier, plan.status, plan.note]),
  [["app_store", "mid", "trialing", null], ["stripe", "premium", "active", "sandbox"]]
);
// Google Play can key a subscription by "<product>:<base plan>".
{
  const play = subscription({ store: "play_store" });
  assert.deepEqual(
    plans({
      entitlements: { premium: { ...entitlementFor("equina.premium", play), product_plan_identifier: "monthly" } },
      subscriptions: { "equina.premium:monthly": play }
    }).map((plan) => [plan.source, plan.tier, plan.product_id]),
    [["play", "premium", "equina.premium"]]
  );
  assert.deepEqual(
    plans({
      entitlements: { premium: entitlementFor("equina.premium", play) },
      subscriptions: { "equina.premium:annual": play }
    }).map((plan) => plan.source),
    ["play"]
  );
}

// --- What never becomes a row -----------------------------------------------------------

// A plan given by hand in RevenueCat: Equina gives plans from its own admin.
assert.deepEqual(plans(customer([{
  entitlement: "premium",
  product: "rc_promo_premium_monthly",
  subscription: subscription({ store: "promotional" })
}])), []);
// Promotional Premium does not hide Plus bought in the App Store.
assert.deepEqual(
  plans(customer([
    { entitlement: "premium", product: "rc_promo_premium_lifetime", subscription: subscription({ store: "PROMOTIONAL", expires_date: null }) },
    { entitlement: "plus", product: "equina.plus.monthly", subscription: subscription() }
  ])).map((plan) => [plan.source, plan.tier]),
  [["app_store", "mid"]]
);
assert.deepEqual(plans(customer([{ entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ store: "amazon" }) }])), []);
assert.deepEqual(plans(customer([{ entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ store: "some_new_store" }) }])), []);
// The Test Store: ignored, unless the project accepts it -- and then marked.
{
  const testStore = customer([{ entitlement: "premium", product: "equina.premium.monthly", subscription: subscription({ store: "test_store", is_sandbox: true }) }]);
  assert.deepEqual(plans(testStore), []);
  const accepted = onlyPlan(testStore, { acceptTestStore: true });
  assert.equal(accepted.source, "app_store");
  assert.equal(accepted.note, "test_store", "Rows from the Test Store must be easy to find and remove.");
}
// An entitlement Equina does not sell, and a product of ours behind it.
assert.deepEqual(plans(customer([{ entitlement: "pro", product: "equina.premium.monthly", subscription: subscription() }])), []);
// A product with no subscription record (a one-off purchase, or a gap in the
// data): no store to put it in.
assert.deepEqual(plans({ entitlements: { premium: entitlementFor("equina.premium.lifetime", {}) }, subscriptions: {} }), []);
assert.deepEqual(plans({
  entitlements: { premium: entitlementFor("equina.premium.lifetime", {}) },
  non_subscriptions: { "equina.premium.lifetime": [{ store: "app_store" }] }
}), []);

// --- A plan RevenueCat could not place ------------------------------------------------------

// RevenueCat's docs: an entitlement's product "might temporarily be
// unavailable" while a store is slow to validate the purchase. The rider
// holds Premium; which store sold it is not known for now.
{
  const unnamed = {
    entitlements: { premium: { expires_date: at(20), grace_period_expires_date: null, product_identifier: null, purchase_date: at(-10) } },
    subscriptions: { "equina.premium.monthly": subscription() }
  };
  assert.deepEqual(plans(unnamed), []);
  assert.equal(holdsUnplacedPlan(unnamed, now), true);
  assert.equal(holdsUnplacedPlan({ ...unnamed, entitlements: { premium: { ...unnamed.entitlements.premium, product_identifier: "" } } }, now), true);
  assert.equal(holdsUnplacedPlan({
    entitlements: { premium: entitlementFor("equina.premium.monthly", { expires_date: at(20) }) },
    subscriptions: {}
  }, now), true, "A product with no subscription record is not placed either.");
}
// An entitlement names only its furthest-out purchase, so a promotional
// Premium for life hides Premium bought in the App Store.
const promotionalOverStore = {
  entitlements: { premium: entitlementFor("rc_promo_premium_lifetime", { expires_date: null }) },
  subscriptions: {
    rc_promo_premium_lifetime: subscription({ store: "promotional", expires_date: null }),
    "equina.premium.monthly": subscription()
  }
};
assert.deepEqual(plans(promotionalOverStore), []);
assert.equal(holdsUnplacedPlan(promotionalOverStore, now), true);
// Still running on grace, by the entitlement's own dates.
assert.equal(holdsUnplacedPlan({
  entitlements: { plus: { product_identifier: null, expires_date: at(-1), grace_period_expires_date: at(5) } },
  subscriptions: {}
}, now), true);
// Dates that are not dates are not "over".
assert.equal(holdsUnplacedPlan({ entitlements: { plus: { product_identifier: null, expires_date: "soon" } } }, now), true);
// Placed, over, or not a plan Equina sells: nothing is unplaced.
assert.equal(holdsUnplacedPlan(customer([{ entitlement: "premium", product: "equina.premium.monthly", subscription: subscription() }]), now), false);
assert.equal(holdsUnplacedPlan(customer([{ entitlement: "premium", product: "equina.premium.monthly", subscription: subscription({ expires_date: at(-3) }) }]), now), false);
assert.equal(holdsUnplacedPlan(customer([{
  entitlement: "premium",
  product: "rc_promo_premium_monthly",
  subscription: subscription({ store: "promotional", expires_date: at(-3) })
}]), now), false, "A promotional grant that ended hides nothing.");
assert.equal(holdsUnplacedPlan(customer([{
  entitlement: "plus",
  product: "equina.plus.monthly",
  subscription: subscription({ expires_date: at(-20), grace_period_expires_date: at(-4) })
}]), now), false);
assert.equal(holdsUnplacedPlan(customer([{ entitlement: "pro", product: "equina.pro.monthly", subscription: subscription({ store: "promotional" }) }]), now), false);
{
  const testStore = customer([{ entitlement: "plus", product: "equina.plus.monthly", subscription: subscription({ store: "test_store" }) }]);
  assert.equal(holdsUnplacedPlan(testStore, now), true);
  assert.equal(holdsUnplacedPlan(testStore, now, { acceptTestStore: true }), false);
}
for (const odd of [null, undefined, "subscriber", 42, [], {}, { entitlements: null }]) {
  assert.equal(holdsUnplacedPlan(odd, now), false);
}

// --- Odd data ----------------------------------------------------------------------------

for (const odd of [null, undefined, "subscriber", 42, [], {}, { entitlements: null }, { entitlements: [], subscriptions: [] }]) {
  assert.deepEqual(plans(odd), [], `${JSON.stringify(odd)} holds no plan.`);
}
// An expiry that is not a date must not read as "never expires".
assert.deepEqual(plans(customer([{ entitlement: "premium", product: "equina.premium.monthly", subscription: subscription({ expires_date: "soon" }) }])), []);
assert.deepEqual(plans(customer([{ entitlement: "premium", product: "equina.premium.monthly", subscription: subscription({ expires_date: 1791000000000 }) }])), []);
// No expiry anywhere is RevenueCat's "for life".
{
  const forLife = onlyPlan(customer([{ entitlement: "premium", product: "equina.premium.monthly", subscription: subscription({ expires_date: null }) }]));
  assert.equal(forLife.status, "active");
  assert.equal(forLife.ends_at, null);
}
// The entitlement's expiry stands in when the subscription has none.
assert.equal(onlyPlan({
  entitlements: { plus: { product_identifier: "equina.plus.monthly", expires_date: at(-1) } },
  subscriptions: { "equina.plus.monthly": subscription({ expires_date: undefined }) }
}).status, "expired");
// A grace date that is not a date is no grace.
assert.equal(onlyPlan(customer([{
  entitlement: "premium",
  product: "equina.premium.monthly",
  subscription: subscription({ expires_date: at(-1), billing_issues_detected_at: at(-1), grace_period_expires_date: "later" })
}])).status, "expired");
// Missing purchase dates fall back in order, and to nothing at all.
assert.equal(onlyPlan(customer([{
  entitlement: "plus",
  product: "equina.plus.monthly",
  subscription: subscription({ original_purchase_date: null, purchase_date: at(-10) })
}])).started_at, at(-10));
assert.equal(onlyPlan(customer([{
  entitlement: "plus",
  product: "equina.plus.monthly",
  subscription: subscription({ original_purchase_date: "unknown", purchase_date: undefined })
}])).started_at, null);
// Keys that are also names of Object's own properties are only keys.
assert.deepEqual(plans(JSON.parse(`{"entitlements":{"__proto__":{"product_identifier":"x"},"constructor":{"product_identifier":"toString"}},"subscriptions":{}}`)), []);
assert.deepEqual(plans({ entitlements: { premium: entitlementFor("toString", {}) }, subscriptions: {} }), []);
assert.deepEqual(plans({ entitlements: { premium: { product_identifier: 7 } }, subscriptions: { 7: subscription() } }), []);
assert.deepEqual(plans({ entitlements: { premium: { product_identifier: "" } }, subscriptions: { "": subscription() } }), []);
assert.equal(
  onlyPlan(customer([{ entitlement: "plus", product: `equina.${"x".repeat(300)}`, subscription: subscription() }])).product_id.length,
  200,
  "plan_subscriptions.product_id holds at most 200 characters."
);

// --- Writing the rows ---------------------------------------------------------------------

const row = (overrides: Partial<PlanSubscriptionRow> = {}): PlanSubscriptionRow => ({
  user_id: rider,
  source: "app_store",
  tier: "premium",
  status: "active",
  product_id: "equina.premium.monthly",
  original_transaction_id: null,
  started_at: at(-40),
  trial_ends_at: null,
  ends_at: at(20),
  note: null,
  granted_by: null,
  ...overrides
});
const premiumPlan = onlyPlan(customer([{ entitlement: "premium", product: "equina.premium.monthly", subscription: subscription() }]));

// A first purchase: one new row for the rider.
assert.deepEqual(planSubscriptionWrites(rider, [], [premiumPlan], now), [row()]);
// Already written: nothing to do, even though the database writes "+00:00".
assert.deepEqual(
  planSubscriptionWrites(rider, [row({ started_at: at(-40).replace("Z", "+00:00"), ends_at: at(20).replace(".000Z", "+00:00") })], [premiumPlan], now),
  [],
  "A repeated event must not touch a row that already matches."
);
// Renewed: the new period end, the same start.
assert.deepEqual(
  planSubscriptionWrites(rider, [row({ ends_at: at(-10) })], [premiumPlan], now),
  [row()]
);
// No purchase date from RevenueCat: the row keeps its start, or starts now.
{
  const undated = { ...premiumPlan, started_at: null };
  assert.equal(planSubscriptionWrites(rider, [row({ started_at: at(-90), status: "grace" })], [undated], now)[0]?.started_at, at(-90),
    "A missing date must never move the credit anniversary.");
  assert.equal(planSubscriptionWrites(rider, [], [undated], now)[0]?.started_at, new Date(now).toISOString());
}
// A plan staff gave is never written, whatever the store says.
{
  const staffRow = row({ source: "staff", tier: "mid", product_id: null, granted_by: otherRider, note: "Coach" });
  assert.deepEqual(planSubscriptionWrites(rider, [staffRow], [], now), []);
  assert.deepEqual(planSubscriptionWrites(rider, [staffRow], [premiumPlan], now), [row()]);
  const forged = { ...premiumPlan, source: "staff" } as unknown as StorePlan;
  assert.deepEqual(planSubscriptionWrites(rider, [staffRow], [forged], now), [], "Nothing here writes a staff row.");
}
// Another rider's rows are not this rider's.
assert.deepEqual(planSubscriptionWrites(rider, [row({ user_id: otherRider })], [], now), []);
assert.deepEqual(planSubscriptionWrites(rider.toUpperCase(), [row()], [], now).length, 1, "Ids compare without case.");
// The store no longer names any plan (moved to another account, or the
// customer was deleted in RevenueCat): the row stays, ended.
assert.deepEqual(
  planSubscriptionWrites(rider, [row()], [], now),
  [row({ status: "revoked", ends_at: new Date(now).toISOString() })]
);
assert.deepEqual(
  planSubscriptionWrites(rider, [row({ status: "trialing", ends_at: null, trial_ends_at: at(2) })], [], now),
  [row({ status: "revoked", ends_at: new Date(now).toISOString(), trial_ends_at: at(2) })]
);
assert.deepEqual(
  planSubscriptionWrites(rider, [row({ status: "active", ends_at: at(-3) })], [], now),
  [row({ status: "expired", ends_at: at(-3) })],
  "A row that already ran out is expired, not taken back."
);
assert.deepEqual(planSubscriptionWrites(rider, [row({ status: "expired", ends_at: at(-3) })], [], now), [], "An ended row stays as it is.");
assert.deepEqual(planSubscriptionWrites(rider, [row({ status: "revoked" })], [], now), []);
// The rider holds a plan RevenueCat did not place: the unnamed row may be
// that plan, so it is left to lapse on its own ends_at. Named rows still
// follow RevenueCat.
assert.deepEqual(planSubscriptionWrites(rider, [row()], [], now, { keepUnnamed: true }), []);
assert.deepEqual(
  planSubscriptionWrites(rider, [row({ ends_at: at(-10) }), row({ source: "stripe", tier: "mid" })], [premiumPlan], now, { keepUnnamed: true }),
  [row()]
);
{
  const writesFor = (subscriber: unknown) =>
    planSubscriptionWrites(rider, [row()], plans(subscriber), now, { keepUnnamed: holdsUnplacedPlan(subscriber, now) });
  assert.deepEqual(writesFor(promotionalOverStore), [], "A promotional grant must not take back the plan the rider pays the App Store for.");
  // Moved to another account: nothing left at all, so the row ends.
  assert.deepEqual(writesFor(customer([])), [row({ status: "revoked", ends_at: new Date(now).toISOString() })]);
}
// Two stores at once: each row on its own.
assert.deepEqual(
  planSubscriptionWrites(
    rider,
    [row(), row({ source: "stripe", tier: "mid", product_id: "equina.plus.monthly" })],
    [premiumPlan],
    now
  ).map((write) => [write.source, write.status]),
  [["stripe", "revoked"]]
);

// --- The webhook's Authorization -------------------------------------------------------------

const authorization = "Bearer 4c1f9e7a2b8d6c3e5f0a1b2c3d4e5f6a";
assert.equal(sameSecret(authorization, authorization), true);
assert.equal(sameSecret(`${authorization}`.slice(0), authorization), true);
assert.equal(sameSecret(authorization.replace(/a$/, "b"), authorization), false, "One character off is refused.");
assert.equal(sameSecret(authorization.slice(0, -1), authorization), false, "A prefix is refused.");
assert.equal(sameSecret(`${authorization}0`, authorization), false, "A longer value is refused.");
assert.equal(sameSecret(authorization.replace("Bearer ", ""), authorization), false, "The value is compared as RevenueCat sends it, scheme and all.");
assert.equal(sameSecret(authorization.toLowerCase(), authorization), false);
assert.equal(sameSecret("", authorization), false);
assert.equal(sameSecret(null, authorization), false);
assert.equal(sameSecret(undefined, authorization), false);
assert.equal(sameSecret("", ""), false, "Without a configured value nothing matches.");
assert.equal(sameSecret(authorization, ""), false);

// --- Who an event is about ---------------------------------------------------------------------

const anonymous = "$RCAnonymousID:8a5b3c2d1e0f4a9b8c7d6e5f4a3b2c1d";
assert.equal(isRiderId(rider), true);
assert.equal(isRiderId(anonymous), false);
assert.equal(isRiderId(`${rider} `), false);

const event = (fields: Record<string, unknown>) => ({ api_version: "1.0", event: { id: "evt-1", event_timestamp_ms: now, ...fields } });

assert.deepEqual(
  revenueCatEventUserIds(event({ type: "TEST", app_user_id: rider, original_app_user_id: rider, aliases: [rider] })),
  [],
  "A dashboard test asks RevenueCat about nobody -- asking would create the customer."
);
assert.deepEqual(
  revenueCatEventUserIds(event({ type: "INITIAL_PURCHASE", app_user_id: rider, original_app_user_id: anonymous, aliases: [anonymous, rider] })),
  [rider],
  "A purchase made before sign-in and merged at logIn is the rider's."
);
assert.deepEqual(
  revenueCatEventUserIds(event({ type: "RENEWAL", app_user_id: anonymous, original_app_user_id: anonymous, aliases: [anonymous, rider] })),
  [rider],
  "The rider can be named only among the aliases."
);
assert.deepEqual(
  revenueCatEventUserIds(event({ type: "EXPIRATION", app_user_id: rider.toUpperCase(), original_app_user_id: rider, aliases: [rider] })),
  [rider],
  "One rider is one rider, whatever the case."
);
assert.deepEqual(revenueCatEventUserIds(event({ type: "CANCELLATION", app_user_id: anonymous, aliases: [anonymous] })), []);
assert.deepEqual(revenueCatEventUserIds(event({ type: "RENEWAL", app_user_id: "rider-42", aliases: ["null", "", 7, null, { id: rider }] })), []);
// A transfer has no app_user_id and names both sides; both are read again.
assert.deepEqual(
  revenueCatEventUserIds(event({ type: "TRANSFER", transferred_from: [otherRider, anonymous], transferred_to: [rider] })),
  [rider, otherRider]
);
assert.deepEqual(
  revenueCatEventUserIds(event({ type: "BILLING_ISSUE", app_user_id: rider, transferred_from: [otherRider] })),
  [rider],
  "Only a transfer names riders in transferred_from."
);
// A customer carrying a pile of aliases costs a bounded number of calls.
{
  const many = Array.from({ length: 12 }, (_, index) => `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`);
  const named = revenueCatEventUserIds(event({ type: "RENEWAL", app_user_id: rider, aliases: many }));
  assert.equal(named.length, maxRidersPerEvent);
  assert.equal(named[0], rider, "app_user_id comes first.");
}
for (const odd of [null, undefined, "event", [], {}, { event: null }, { event: [] }, { event: { type: "TEST" } }]) {
  assert.deepEqual(revenueCatEventUserIds(odd), []);
}

// --- Reading a customer from RevenueCat -----------------------------------------------------------

const secretApiKey = "sk_rcTestKeyThatMustNeverAppearInAnError";
{
  const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
  const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return new Response(JSON.stringify({ request_date: at(0), subscriber: customer([]) }), { status: 201 });
  }) as typeof fetch;
  const subscriber = await fetchRevenueCatSubscriber({ appUserId: "$RCAnonymousID:a/b", secretApiKey, fetcher: fakeFetch });
  assert.equal(subscriber.original_app_user_id, rider);
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0]?.url,
    "https://api.revenuecat.com/v1/subscribers/%24RCAnonymousID%3Aa%2Fb",
    "The id is one path segment, whatever it holds."
  );
  assert.equal(calls[0]?.init?.method, "GET");
  assert.equal(new Headers(calls[0]?.init?.headers).get("authorization"), `Bearer ${secretApiKey}`);
  assert.equal(new Headers(calls[0]?.init?.headers).has("x-platform"), false, "RevenueCat asks for no platform with a secret key.");
  assert.ok(calls[0]?.init?.signal, "Every call to RevenueCat has a deadline.");
}

const failsWith = async (fetcher: typeof fetch, status: number | null, options: { timeoutMs?: number } = {}) => {
  await assert.rejects(
    fetchRevenueCatSubscriber({ appUserId: rider, secretApiKey, fetcher, ...options }),
    (error: unknown) => {
      assert.ok(error instanceof RevenueCatFailure, "Every RevenueCat failure is a RevenueCatFailure.");
      assert.equal(error.status, status);
      assert.doesNotMatch(error.message, /sk_rc/, "The secret key never travels in an error.");
      return true;
    }
  );
};
const answering = (body: string, status: number) => (async () => new Response(body, { status })) as typeof fetch;
await failsWith(answering("{}", 500), 500);
await failsWith(answering(`{"code":7225,"message":"Too many requests"}`, 429), 429);
await failsWith(answering(`{"message":"Invalid API key"}`, 401), 401);
await failsWith(answering("<html>Bad gateway</html>", 200), 200);
await failsWith(answering(`{"request_date":"now"}`, 200), 200);
await failsWith(answering(`{"subscriber":[]}`, 200), 200);
// A customer without entitlements is not one who holds nothing: read that
// way, it would end every plan the rider pays for.
await failsWith(answering(`{"subscriber":{}}`, 200), 200);
await failsWith(answering(`{"subscriber":{"entitlements":null,"subscriptions":{}}}`, 200), 200);
await failsWith(answering(`{"subscriber":{"entitlements":[],"subscriptions":{}}}`, 200), 200);
await failsWith((async () => { throw new TypeError("fetch failed"); }) as typeof fetch, null);
// A RevenueCat that never answers is given up on. (Node does not wait for
// AbortSignal.timeout's own timer, so the test holds the process open.)
await failsWith(
  ((_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      // Answering late, successfully, fails the test: the deadline had to win.
      const holdOpen = setTimeout(() => resolve(new Response(JSON.stringify({ subscriber: {} }))), 5_000);
      init?.signal?.addEventListener("abort", () => {
        clearTimeout(holdOpen);
        reject(init.signal?.reason);
      });
    })) as typeof fetch,
  null,
  { timeoutMs: 20 }
);
await assert.rejects(
  fetchRevenueCatSubscriber({ appUserId: rider, secretApiKey: "", fetcher: answering("{}", 200) }),
  RevenueCatFailure,
  "Without a key nothing is asked."
);

// --- RevenueCat's own example, end to end -----------------------------------------------------------

// The shape of RevenueCat's documented GET /subscribers answer, for a rider
// on Plus through the App Store who also once had a promotional Premium.
{
  const documented = JSON.parse(JSON.stringify({
    request_date: "2026-10-05T12:00:00Z",
    request_date_ms: now,
    subscriber: {
      entitlements: {
        plus: { expires_date: "2026-10-25T12:00:00Z", grace_period_expires_date: null, product_identifier: "equina.plus.monthly", purchase_date: "2026-09-25T12:00:00Z" },
        premium: { expires_date: "2026-09-01T00:00:00Z", grace_period_expires_date: null, product_identifier: "rc_promo_premium_monthly", purchase_date: "2026-08-01T00:00:00Z" }
      },
      first_seen: "2026-08-01T00:00:00Z",
      last_seen: "2026-10-05T11:00:00Z",
      management_url: "https://apps.apple.com/account/subscriptions",
      non_subscriptions: {},
      original_app_user_id: rider,
      original_application_version: "1.0",
      original_purchase_date: "2026-08-25T12:00:00Z",
      other_purchases: {},
      subscriber_attributes: {},
      subscriptions: {
        "equina.plus.monthly": {
          auto_resume_date: null, billing_issues_detected_at: null, display_name: "Plus", expires_date: "2026-10-25T12:00:00Z",
          grace_period_expires_date: null, is_sandbox: false, original_purchase_date: "2026-08-25T12:00:00Z", ownership_type: "PURCHASED",
          period_type: "normal", price: { amount: 9.99, currency: "EUR" }, purchase_date: "2026-09-25T12:00:00Z", refunded_at: null,
          store: "app_store", store_transaction_id: 1000000652379790, unsubscribe_detected_at: null
        },
        rc_promo_premium_monthly: {
          auto_resume_date: null, billing_issues_detected_at: null, expires_date: "2026-09-01T00:00:00Z", grace_period_expires_date: null,
          is_sandbox: false, original_purchase_date: "2026-08-01T00:00:00Z", ownership_type: "PURCHASED", period_type: "normal",
          purchase_date: "2026-08-01T00:00:00Z", refunded_at: null, store: "promotional", unsubscribe_detected_at: null
        }
      }
    }
  }));
  const subscriber = await fetchRevenueCatSubscriber({ appUserId: rider, secretApiKey, fetcher: answering(JSON.stringify(documented), 200) });
  const found = storePlansFromSubscriber(subscriber, now);
  assert.deepEqual(found, [{
    source: "app_store",
    tier: "mid",
    status: "active",
    product_id: "equina.plus.monthly",
    original_transaction_id: null,
    started_at: "2026-08-25T12:00:00.000Z",
    trial_ends_at: null,
    ends_at: "2026-10-25T12:00:00.000Z",
    note: null,
    granted_by: null
  }]);
  // A staff Premium sits beside it untouched, and the stale Stripe row ends.
  const staffRow = row({ source: "staff", tier: "premium", product_id: null, ends_at: null, note: "Founder", granted_by: otherRider });
  const writes = planSubscriptionWrites(rider, [staffRow, row({ source: "stripe", tier: "mid", ends_at: at(4) })], found, now);
  assert.deepEqual(writes.map((write) => [write.source, write.tier, write.status]), [["app_store", "mid", "active"], ["stripe", "mid", "revoked"]]);
  assert.ok(writes.every((write) => write.source !== "staff"));
}

console.log("RevenueCat rules passed.");
