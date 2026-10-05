// RevenueCat: what a rider bought in a store, as rows of plan_subscriptions.
//
// A RevenueCat webhook only says that something changed for a customer. What
// changed is read back from RevenueCat's own record of that customer (REST v1,
// GET /subscribers) and laid over the rider's store rows, so a repeated event,
// a late one or one out of order writes what the latest one would.
//
// This file has no imports, so the Node test suite runs it as it is and Deno
// runs it in the edge functions.

type Fields = Record<string, unknown>;
const record = (value: unknown): Fields =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : {};
// Keys here are product ids typed into a dashboard. Only the object's own
// keys are read, so a product called "constructor" is just a product.
const own = (fields: Fields, key: string): unknown =>
  Object.prototype.hasOwnProperty.call(fields, key) ? fields[key] : undefined;
const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// --- The plans RevenueCat sells ---------------------------------------------------

export type StoreSource = "app_store" | "play" | "stripe";
export type PaidTier = "mid" | "premium";
export type PlanStatus = "trialing" | "active" | "grace" | "expired" | "revoked";

// The sources this file writes. 'staff' is not one of them: plans given by
// hand come from the Equina admin, and nothing here reads or changes them.
export const storeSources: readonly StoreSource[] = ["app_store", "play", "stripe"];
const isStoreSource = (value: unknown): value is StoreSource => storeSources.includes(value as StoreSource);
const liveStatuses: readonly string[] = ["trialing", "active", "grace"];

// RevenueCat's entitlements carry the names riders see; the plan keys are the
// ones the database has used since 202609270001.
export const tierForEntitlement = (identifier: string): PaidTier | null =>
  identifier === "plus" ? "mid" : identifier === "premium" ? "premium" : null;
const tierRank: Record<PaidTier, number> = { mid: 1, premium: 2 };

// Which of the rider's rows a store's purchases live in. Promotional grants
// are ignored -- a plan given by hand is a 'staff' row from the admin -- and
// Equina sells through no other store (Amazon, Paddle, and whatever
// RevenueCat adds next).
export const planSourceForStore = (store: unknown, { acceptTestStore = false } = {}): StoreSource | null => {
  switch (typeof store === "string" ? store.trim().toUpperCase() : "") {
    case "APP_STORE":
    case "MAC_APP_STORE":
      return "app_store";
    case "PLAY_STORE":
      return "play";
    case "STRIPE":
    case "RC_BILLING":
      return "stripe";
    // RevenueCat's Test Store needs no Apple account, so it is how the whole
    // purchase can be tried before App Store Connect exists. Its purchases
    // are not real, so they count only where REVENUECAT_ACCEPT_TEST_STORE
    // says so, and they are marked on the row.
    case "TEST_STORE":
      return acceptTestStore ? "app_store" : null;
    default:
      return null;
  }
};

// --- From RevenueCat's customer to plan rows ---------------------------------------

// One store's plan, as plan_subscriptions keeps it.
export type StorePlan = {
  source: StoreSource;
  tier: PaidTier;
  status: PlanStatus;
  product_id: string;
  // Never needed: RevenueCat is asked for the whole customer every time, so
  // no row has to be found again by the store's transaction.
  original_transaction_id: null;
  // The first purchase, so Ralf's monthly credits keep their anniversary
  // across renewals. Null only when RevenueCat sent no date at all; the
  // rider's row then keeps the one it has.
  started_at: string | null;
  trial_ends_at: string | null;
  ends_at: string | null;
  // App Review buys in the sandbox, so sandbox purchases count like any
  // other. The note only lets staff tell them apart.
  note: "sandbox" | "test_store" | null;
  granted_by: null;
};

type Candidate = StorePlan & { endsAtMs: number | null };

// undefined is a value that is there but is not a date. Nothing below guesses
// what it meant: an expiry like that drops the purchase rather than reading
// as "never expires".
const dateOf = (value: unknown): number | null | undefined => {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return undefined;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};
const firstDate = (...values: unknown[]) => {
  for (const value of values) {
    const parsed = dateOf(value);
    if (typeof parsed === "number") return parsed;
  }
  return null;
};
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

// v1 keys a subscription by its product. Google Play's base plans can add
// ":<plan>" to the key.
const subscriptionFor = (subscriptions: Fields, productId: string, planId: unknown): Fields | null => {
  const exact = own(subscriptions, productId) ??
    (typeof planId === "string" && planId ? own(subscriptions, `${productId}:${planId}`) : undefined);
  if (exact !== undefined) return record(exact);
  const key = Object.keys(subscriptions).find((candidate) => candidate.startsWith(`${productId}:`));
  return key === undefined ? null : record(subscriptions[key]);
};

const candidateFor = (
  tier: PaidTier,
  productId: string,
  entitlement: Fields,
  subscription: Fields,
  nowMs: number,
  options: { acceptTestStore?: boolean }
): Candidate | null => {
  const source = planSourceForStore(subscription.store, options);
  if (!source) return null;

  const expires = dateOf(subscription.expires_date ?? entitlement.expires_date);
  if (expires === undefined) return null;
  // A grace date that is not a date is no grace.
  const grace = dateOf(subscription.grace_period_expires_date ?? entitlement.grace_period_expires_date) ?? null;
  const refunded = subscription.refunded_at !== null && subscription.refunded_at !== undefined;
  const billingIssue = subscription.billing_issues_detected_at !== null && subscription.billing_issues_detected_at !== undefined;
  const lapsed = expires !== null && expires <= nowMs;
  const inGrace = grace !== null && grace > nowMs && (billingIssue || lapsed);
  const trial = typeof subscription.period_type === "string" && subscription.period_type.toLowerCase() === "trial";

  const status: PlanStatus = refunded ? "revoked"
    : lapsed && !inGrace ? "expired"
    : inGrace ? "grace"
    : trial ? "trialing"
    : "active";
  const endsAtMs = status === "grace" ? grace : expires;

  return {
    source,
    tier,
    status,
    product_id: productId.slice(0, 200),
    original_transaction_id: null,
    started_at: iso(firstDate(subscription.original_purchase_date, subscription.purchase_date, entitlement.purchase_date)),
    trial_ends_at: status === "trialing" ? iso(expires) : null,
    ends_at: iso(endsAtMs),
    note: String(subscription.store).trim().toUpperCase() === "TEST_STORE" ? "test_store"
      : subscription.is_sandbox === true ? "sandbox"
      : null,
    granted_by: null,
    endsAtMs
  };
};

// Per store, the plan the rider holds now, the highest one first; with none,
// the one that ended last, so the row says how it ended.
const outranks = (a: Candidate, b: Candidate) => {
  const aLive = liveStatuses.includes(a.status);
  if (aLive !== liveStatuses.includes(b.status)) return aLive;
  if (aLive && a.tier !== b.tier) return tierRank[a.tier] > tierRank[b.tier];
  const aEnds = a.endsAtMs ?? Number.POSITIVE_INFINITY;
  const bEnds = b.endsAtMs ?? Number.POSITIVE_INFINITY;
  if (aEnds !== bEnds) return aEnds > bEnds;
  return tierRank[a.tier] > tierRank[b.tier];
};

// Over by the entitlement's own dates: an expiry that is a date and has
// passed, with no grace still running. Anything less certain is not over.
const entitlementOver = (entitlement: Fields, nowMs: number) => {
  const expires = dateOf(entitlement.expires_date);
  const grace = dateOf(entitlement.grace_period_expires_date);
  return typeof expires === "number" && expires <= nowMs && !(typeof grace === "number" && grace > nowMs);
};

// Each entitlement names the product that grants it now -- or granted it
// last -- and that product's subscription says which store sold it and how
// it stands. An entitlement Equina sells that is not over, but cannot be put
// in a store row, is counted apart: see holdsUnplacedPlan.
const readSubscriber = (subscriber: unknown, now: Date | number, options: { acceptTestStore?: boolean }) => {
  const nowMs = typeof now === "number" ? now : now.getTime();
  const { entitlements, subscriptions } = record(subscriber);
  const byProduct = record(subscriptions);
  const held = new Map<StoreSource, Candidate>();
  let unplaced = false;

  for (const [identifier, value] of Object.entries(record(entitlements))) {
    const tier = tierForEntitlement(identifier);
    if (!tier) continue;
    const entitlement = record(value);
    const productId = typeof entitlement.product_identifier === "string" ? entitlement.product_identifier : "";
    const subscription = productId ? subscriptionFor(byProduct, productId, entitlement.product_plan_identifier) : null;
    const candidate = subscription && candidateFor(tier, productId, entitlement, subscription, nowMs, options);
    if (!candidate) {
      if (!entitlementOver(entitlement, nowMs)) unplaced = true;
      continue;
    }
    const current = held.get(candidate.source);
    if (!current || outranks(candidate, current)) held.set(candidate.source, candidate);
  }
  return { held, unplaced };
};

// RevenueCat's v1 customer ("subscriber") as one plan per store.
export const storePlansFromSubscriber = (
  subscriber: unknown,
  now: Date | number,
  options: { acceptTestStore?: boolean } = {}
): StorePlan[] =>
  [...readSubscriber(subscriber, now, options).held.values()]
    .sort((a, b) => a.source.localeCompare(b.source))
    .map(({ endsAtMs: _endsAtMs, ...plan }) => plan);

// Whether the rider holds Plus or Premium through a purchase no store row
// can be matched to. RevenueCat's docs say an entitlement's product "might
// temporarily be unavailable" while a store is slow to validate, and an
// entitlement names only its furthest-out purchase, so a promotional grant
// in RevenueCat's dashboard hides a store purchase of the same plan. Either
// way the store's row may be the very plan still being paid for, so it must
// not be ended on this answer; it still lapses on its own ends_at.
export const holdsUnplacedPlan = (
  subscriber: unknown,
  now: Date | number,
  options: { acceptTestStore?: boolean } = {}
): boolean => readSubscriber(subscriber, now, options).unplaced;

// --- From plans to writes ----------------------------------------------------------

// A plan_subscriptions row, with every column the store side writes.
export type PlanSubscriptionRow = {
  user_id: string;
  source: string;
  tier: string;
  status: string;
  product_id: string | null;
  original_transaction_id: string | null;
  started_at: string;
  trial_ends_at: string | null;
  ends_at: string | null;
  note: string | null;
  granted_by: string | null;
};

// The database answers "+00:00" where JavaScript writes "Z".
const sameInstant = (a: string | null, b: string | null) =>
  a === b || (a !== null && b !== null && Date.parse(a) === Date.parse(b));
const unchanged = (before: PlanSubscriptionRow, after: PlanSubscriptionRow) =>
  before.tier === after.tier &&
  before.status === after.status &&
  before.product_id === after.product_id &&
  before.original_transaction_id === after.original_transaction_id &&
  sameInstant(before.started_at, after.started_at) &&
  sameInstant(before.trial_ends_at, after.trial_ends_at) &&
  sameInstant(before.ends_at, after.ends_at) &&
  before.note === after.note &&
  before.granted_by === after.granted_by;

// The rows to upsert so the rider's store rows say what RevenueCat says. Rows
// are never deleted: a store that no longer names any plan for this rider
// (the purchase moved to another account, or the customer was deleted in
// RevenueCat) keeps its row, ended -- unless keepUnnamed says the rider holds
// a plan RevenueCat did not place in a store (holdsUnplacedPlan), which may be
// that row's. A row that already says the same is left alone, so updated_at
// keeps meaning "the plan changed".
export const planSubscriptionWrites = (
  userId: string,
  existing: readonly PlanSubscriptionRow[],
  plans: readonly StorePlan[],
  now: Date | number,
  { keepUnnamed = false }: { keepUnnamed?: boolean } = {}
): PlanSubscriptionRow[] => {
  const nowIso = new Date(typeof now === "number" ? now : now.getTime()).toISOString();
  const held = new Map<string, PlanSubscriptionRow>();
  for (const row of existing) {
    if (isStoreSource(row.source) && row.user_id.toLowerCase() === userId.toLowerCase()) held.set(row.source, row);
  }

  const writes: PlanSubscriptionRow[] = [];
  for (const plan of plans) {
    if (!isStoreSource(plan.source)) continue;
    const before = held.get(plan.source);
    held.delete(plan.source);
    const row: PlanSubscriptionRow = { user_id: userId, ...plan, started_at: plan.started_at ?? before?.started_at ?? nowIso };
    if (!before || !unchanged(before, row)) writes.push(row);
  }

  for (const before of held.values()) {
    if (keepUnnamed || !liveStatuses.includes(before.status)) continue;
    const ends = dateOf(before.ends_at);
    writes.push(typeof ends === "number" && ends <= Date.parse(nowIso)
      ? { ...before, status: "expired" }
      : { ...before, status: "revoked", ends_at: nowIso });
  }
  return writes;
};

// --- Webhooks ----------------------------------------------------------------------

// RevenueCat sends the Authorization value set on the webhook, exactly as it
// was typed there. Compared without stopping at the first difference, so the
// time taken says nothing about how much of a guess was right.
export const sameSecret = (received: string | null | undefined, expected: string) => {
  if (!expected || typeof received !== "string") return false;
  let difference = received.length ^ expected.length;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= (received.charCodeAt(index) || 0) ^ expected.charCodeAt(index);
  }
  return difference === 0;
};

// Equina logs riders in to RevenueCat with their Supabase user id. Anything
// else -- "$RCAnonymousID:..." from before sign-in, an id from a test -- is
// not a rider.
const riderIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRiderId = (value: unknown): value is string => typeof value === "string" && riderIdPattern.test(value);

// Each rider costs a call to RevenueCat, and RevenueCat waits 60 seconds for
// the answer. A real event names one rider, or two for a transfer.
export const maxRidersPerEvent = 5;

// The riders a webhook event is about. RevenueCat asks to look at the
// original id and every alias, not only app_user_id; a transfer has no
// app_user_id and names both sides instead. A dashboard test names none.
export const revenueCatEventUserIds = (payload: unknown): string[] => {
  const event = record(record(payload).event);
  const type = typeof event.type === "string" ? event.type.toUpperCase() : "";
  if (type === "TEST") return [];
  const named: unknown[] = [event.app_user_id, event.original_app_user_id];
  if (type === "TRANSFER") named.push(...list(event.transferred_to), ...list(event.transferred_from));
  named.push(...list(event.aliases));

  const riders: string[] = [];
  for (const value of named) {
    if (!isRiderId(value)) continue;
    const id = value.toLowerCase();
    if (!riders.includes(id)) riders.push(id);
  }
  return riders.slice(0, maxRidersPerEvent);
};

// --- Reading a customer ------------------------------------------------------------

// RevenueCat could not answer: down, slow, rate limited, or refusing the key.
// Kept apart from every other failure, so the caller can say "try again"
// (and RevenueCat retries its webhook). The message never carries the key.
export class RevenueCatFailure extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message);
    this.name = "RevenueCatFailure";
  }
}

// GET /v1/subscribers/{id} with the secret key. RevenueCat creates a customer
// it has not seen (201), so callers ask only about riders who exist.
export const fetchRevenueCatSubscriber = async ({
  appUserId,
  secretApiKey,
  fetcher = fetch,
  timeoutMs = 8_000
}: {
  appUserId: string;
  secretApiKey: string;
  fetcher?: typeof fetch;
  timeoutMs?: number;
}): Promise<Fields> => {
  if (!secretApiKey) throw new RevenueCatFailure("RevenueCat is not configured.");
  let response: Response;
  try {
    response = await fetcher(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      method: "GET",
      headers: { Authorization: `Bearer ${secretApiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    throw new RevenueCatFailure("RevenueCat could not be reached.");
  }
  if (!response.ok) {
    await response.body?.cancel().catch(() => undefined);
    throw new RevenueCatFailure(`RevenueCat answered ${response.status}.`, response.status);
  }
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new RevenueCatFailure("RevenueCat answered with something other than JSON.", response.status);
  }
  const subscriber = record(body).subscriber;
  if (!subscriber || typeof subscriber !== "object" || Array.isArray(subscriber)) {
    throw new RevenueCatFailure("RevenueCat answered without a customer.", response.status);
  }
  // Every customer carries `entitlements`, empty until they buy. A customer
  // without it is an answer this file does not understand, not one who holds
  // nothing: read that way, it would end every plan the rider pays for.
  const { entitlements } = subscriber as Fields;
  if (!entitlements || typeof entitlements !== "object" || Array.isArray(entitlements)) {
    throw new RevenueCatFailure("RevenueCat answered without entitlements.", response.status);
  }
  return subscriber as Fields;
};
