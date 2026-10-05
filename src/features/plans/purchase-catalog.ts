import type { PlanKey, PlanState } from "../../backend/contracts";

/**
 * What the app needs from RevenueCat, in the app's own words.
 *
 * Nothing here imports React Native or the RevenueCat SDK: the tests run it
 * under Node, and the web build never loads the SDK at all. The SDK's own
 * objects are read through the small structural types below, which its
 * types satisfy as they are.
 */

/** The plans the stores sell. Free is never bought. */
export type PaidPlanKey = Exclude<PlanKey, "free">;
export type BillingPeriod = "monthly" | "annual";
export type TrialEligibility = "eligible" | "ineligible" | "unknown";
export type StorePlatform = "ios" | "android";

/** A free opening phase, as the store describes the product. Not eligibility. */
export type FreeTrial = { unit: "day" | "week" | "month" | "year"; count: number };

/** One plan at one billing period, priced by the store for this rider. */
export type StoreOffer = {
  productId: string;
  tier: PaidPlanKey;
  period: BillingPeriod;
  price: number;
  /** Localized by the store, currency included: "€49.99". */
  priceString: string;
  currencyCode: string;
  /** An annual price broken down per month, localized. Null when unknown. */
  pricePerMonthString: string | null;
  freeTrial: FreeTrial | null;
};

/** The subscription a store holds for this rider, if any. */
export type StoreSubscription = {
  tier: PaidPlanKey;
  productId: string;
  /** RevenueCat's store name: "APP_STORE", "PLAY_STORE", "TEST_STORE"... */
  store: string;
  willRenew: boolean;
};

/** What RevenueCat knows about the rider, reduced to what a screen uses. */
export type CustomerState = {
  subscription: StoreSubscription | null;
  managementUrl: string | null;
  /**
   * Changes whenever anything the server reconciles changes: a purchase, a
   * renewal, a lapse, a billing problem. Equal fingerprints need no sync.
   */
  fingerprint: string;
};

/**
 * The SDK behind a seam. revenuecat.native.ts drives react-native-purchases;
 * revenuecat.ts stands in on the web, where nothing is sold.
 */
export type PurchasesBridge = {
  readonly supported: boolean;
  /** Once per app run. False when the native module is missing (an old dev client). */
  configure(apiKey: string, appUserId: string): boolean;
  /** Makes RevenueCat's app user id the rider's Supabase id. */
  identify(appUserId: string): Promise<CustomerState>;
  /** On sign-out. Never throws: signing out does not wait on a store. */
  forget(): Promise<void>;
  /** The current offering's plans. */
  loadOffers(): Promise<StoreOffer[]>;
  trialEligibility(offers: StoreOffer[]): Promise<Record<string, TrialEligibility>>;
  /** Resolves "cancelled" when the rider backs out, which is not an error. */
  purchase(productId: string, replacingProductId: string | null): Promise<CustomerState | "cancelled">;
  restore(): Promise<CustomerState>;
  onCustomerChange(listener: (state: CustomerState) => void): () => void;
  manage(state: CustomerState | null): Promise<void>;
};

/**
 * Runs each step only after the one before has settled, whether it failed
 * or not. RevenueCat's logIn and logOut go through one of these.
 */
export const oneAtATime = () => {
  let last: Promise<unknown> = Promise.resolve();
  return <T>(step: () => Promise<T>): Promise<T> => {
    const run = last.then(step, step);
    last = run.catch(() => undefined);
    return run;
  };
};

// --- Products --------------------------------------------------------------------

// The App Store product ids are equina.<plus|premium>.<monthly|annual>.
// Google Play reports a subscription with its base plan after a colon, which
// adds nothing the id has not already said.
const productPattern = /^equina\.(plus|premium)\.(monthly|annual)(?::[A-Za-z0-9._-]+)?$/;

/**
 * Which plan and period a product sells, read from its product id and never
 * from the package id, which RevenueCat lets anyone rename.
 */
export const planProductFor = (productId: string): { tier: PaidPlanKey; period: BillingPeriod } | null => {
  const match = productPattern.exec(productId);
  if (!match) return null;
  return { tier: match[1] === "plus" ? "mid" : "premium", period: match[2] as BillingPeriod };
};

export type StoreProductLike = {
  identifier: string;
  price: number;
  priceString: string;
  currencyCode: string;
  pricePerMonthString: string | null;
  introPrice: {
    price: number;
    cycles: number;
    periodUnit: string;
    periodNumberOfUnits: number;
  } | null;
};

const trialUnits: Record<string, FreeTrial["unit"]> = { DAY: "day", WEEK: "week", MONTH: "month", YEAR: "year" };

/** A free introductory phase. A discounted one is a price, not a trial. */
export const freeTrialOf = (intro: StoreProductLike["introPrice"]): FreeTrial | null => {
  if (!intro || intro.price !== 0) return null;
  const unit = trialUnits[intro.periodUnit.toUpperCase()];
  const count = intro.periodNumberOfUnits * Math.max(1, intro.cycles);
  return unit && count > 0 ? { unit, count } : null;
};

const tierOrder: PaidPlanKey[] = ["mid", "premium"];
const periodOrder: BillingPeriod[] = ["monthly", "annual"];

/**
 * The offering's products as offers, one per plan and period. A product that
 * is not one of Equina's plans is left out rather than shown under a guess.
 */
export const offersFrom = (products: StoreProductLike[]): StoreOffer[] => {
  const offers = new Map<string, StoreOffer>();
  for (const product of products) {
    const plan = planProductFor(product.identifier);
    if (!plan) continue;
    const key = `${plan.tier}:${plan.period}`;
    // The first package wins, as it does in RevenueCat's own paywalls.
    if (offers.has(key)) continue;
    offers.set(key, {
      productId: product.identifier,
      tier: plan.tier,
      period: plan.period,
      price: product.price,
      priceString: product.priceString,
      currencyCode: product.currencyCode,
      pricePerMonthString: product.pricePerMonthString,
      freeTrial: freeTrialOf(product.introPrice)
    });
  }
  return [...offers.values()].sort((left, right) =>
    tierOrder.indexOf(left.tier) - tierOrder.indexOf(right.tier) ||
    periodOrder.indexOf(left.period) - periodOrder.indexOf(right.period)
  );
};

export const offerFor = (offers: StoreOffer[], tier: PlanKey, period: BillingPeriod) =>
  offers.find((offer) => offer.tier === tier && offer.period === period);

/**
 * iOS answers with a number: 0 unknown, 1 ineligible, 2 eligible, 3 no
 * introductory offer. RevenueCat's advice for unknown is to show the full
 * price, so only a clear 2 promises a trial.
 */
export const trialEligibilityFrom = (status: number): TrialEligibility =>
  status === 2 ? "eligible" : status === 1 || status === 3 ? "ineligible" : "unknown";

// --- Entitlements ------------------------------------------------------------------

/** RevenueCat entitlement ids, and the plan each one opens. */
export const entitlementTiers: Record<string, PaidPlanKey> = { plus: "mid", premium: "premium" };

export type EntitlementLike = {
  identifier: string;
  isActive: boolean;
  store: string;
  productIdentifier: string;
  willRenew: boolean;
  periodType: string;
  expirationDate: string | null;
  billingIssueDetectedAt: string | null;
};

const rank = (tier: PlanKey | null | undefined) => (tier === "premium" ? 2 : tier === "mid" ? 1 : 0);

/**
 * The store subscription behind the rider's highest active entitlement.
 * A promotional grant made in RevenueCat's dashboard is not a subscription
 * anyone manages in a store, so it is not one here.
 */
export const subscriptionFrom = (active: Record<string, EntitlementLike>): StoreSubscription | null => {
  let best: StoreSubscription | null = null;
  for (const entitlement of Object.values(active)) {
    const tier = entitlementTiers[entitlement.identifier];
    if (!tier || !entitlement.isActive || entitlement.store === "PROMOTIONAL") continue;
    if (best && rank(best.tier) >= rank(tier)) continue;
    best = {
      tier,
      productId: entitlement.productIdentifier,
      store: entitlement.store,
      willRenew: entitlement.willRenew
    };
  }
  return best;
};

export const customerStateFrom = (input: {
  active: Record<string, EntitlementLike>;
  all: Record<string, EntitlementLike>;
  managementUrl: string | null;
}): CustomerState => ({
  subscription: subscriptionFrom(input.active),
  managementUrl: input.managementUrl,
  fingerprint: JSON.stringify(
    Object.values(input.all)
      .filter((entitlement) => entitlementTiers[entitlement.identifier])
      .map((entitlement) => [
        entitlement.identifier,
        entitlement.isActive,
        entitlement.productIdentifier,
        entitlement.store,
        entitlement.periodType,
        entitlement.expirationDate,
        entitlement.billingIssueDetectedAt,
        entitlement.willRenew
      ])
      .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
  )
});

const storeSources = new Set<PlanState["source"]>(["app_store", "play", "stripe"]);

/**
 * Whether what the store says and what the database says cannot both be
 * right, on the first look after sign-in. A paid store tier above the plan
 * means a webhook was missed; a store-billed plan above the store tier means
 * a lapse or refund was. A staff grant above a store tier is expected.
 */
export const storeAndPlanDisagree = (
  storeTier: PaidPlanKey | null,
  plan: Pick<PlanState, "tier" | "source">
) =>
  rank(storeTier) > rank(plan.tier) ||
  (storeSources.has(plan.source) && rank(storeTier) < rank(plan.tier));

// --- What a plan card offers ------------------------------------------------------

export type CardAction =
  /** Start this plan: a trial or a subscription. */
  | "buy"
  /** Move up from the plan the store already bills. */
  | "upgrade"
  /** The plan the store bills: cancel or change it there. */
  | "manage"
  /** Below the plan the store bills: changed in the store's settings. */
  | "switch"
  /** Held another way (the Equina team, or billed elsewhere): nothing to buy. */
  | "held"
  /** Free, or a plan the store has no price for. */
  | "none";

// The stores a purchase on this phone goes through. The Test Store stands in
// for either while RevenueCat is tried without App Store Connect.
const storesOn: Record<StorePlatform, readonly string[]> = {
  ios: ["APP_STORE", "MAC_APP_STORE", "TEST_STORE"],
  android: ["PLAY_STORE", "TEST_STORE"]
};

/** Whether this phone's store bills the subscription, so a purchase here replaces it. */
export const billedHere = (subscription: StoreSubscription, platform: StorePlatform) =>
  storesOn[platform].includes(subscription.store);

export const cardAction = ({
  tier,
  plan,
  subscription,
  offer,
  platform
}: {
  tier: PlanKey;
  plan: Pick<PlanState, "tier" | "source">;
  subscription: StoreSubscription | null;
  offer: StoreOffer | undefined;
  platform: StorePlatform;
}): CardAction => {
  if (tier === "free") return "none";
  if (subscription) {
    if (subscription.tier === tier) return "manage";
    // A plan bought in another store -- the rider's other phone, or the web --
    // is not replaced by a purchase here: it would be a second subscription,
    // billed alongside the first. The change is made where it is billed.
    if (rank(tier) < rank(subscription.tier) || !billedHere(subscription, platform)) return "switch";
    return offer ? "upgrade" : "none";
  }
  // Held without a store subscription RevenueCat knows of: a grant from the
  // Equina team, or one the server has and the SDK has not caught up with.
  // Selling it again could bill the rider twice.
  if (plan.tier === tier && plan.source) return "held";
  return offer ? "buy" : "none";
};

/**
 * The store that will bill the rider again, if any: what RevenueCat says
 * when the app has asked it, else the plan's source. Deleting an account
 * cancels nothing in a store, so the rider is told before they delete.
 */
export const renewingStoreOf = (
  subscription: StoreSubscription | null,
  plan: Pick<PlanState, "source">
): "app_store" | "play" | null => {
  if (subscription) {
    if (!subscription.willRenew) return null;
    if (subscription.store === "APP_STORE" || subscription.store === "MAC_APP_STORE") return "app_store";
    return subscription.store === "PLAY_STORE" ? "play" : null;
  }
  return plan.source === "app_store" || plan.source === "play" ? plan.source : null;
};

// --- Availability ---------------------------------------------------------------------

/**
 * Selling is on only when every part of it is: a signed-in rider on a real
 * account, a phone (never the web), RevenueCat's key for that platform, a
 * privacy policy to link (Apple requires one on the paywall), the server's
 * purchases capability, and plans actually enforced.
 */
export const purchasesAvailable = (input: {
  connected: boolean;
  userId: string | null | undefined;
  platform: string;
  apiKey: string | null;
  privacyPolicyUrl: string | null;
  capability: boolean;
  enforced: boolean;
}) =>
  input.connected &&
  Boolean(input.userId) &&
  (input.platform === "ios" || input.platform === "android") &&
  Boolean(input.apiKey) &&
  Boolean(input.privacyPolicyUrl) &&
  input.capability &&
  input.enforced;

/**
 * The public SDK key for this platform. A Test Store key (test_) crashes a
 * release build on purpose, TestFlight included, so outside development it
 * counts as no key: the plans stay closed instead of the app.
 */
export const revenueCatApiKey = ({
  platform,
  iosKey,
  androidKey,
  isDev
}: {
  platform: string;
  iosKey: string | undefined;
  androidKey: string | undefined;
  isDev: boolean;
}): string | null => {
  const key = (platform === "ios" ? iosKey : platform === "android" ? androidKey : undefined)?.trim();
  if (!key) return null;
  if (key.startsWith("test_") && !isDev) return null;
  return key;
};

// --- Errors ------------------------------------------------------------------------------

/** RevenueCat rejects with a plain object whose `code` is a numeric string. */
export const purchaseErrorCode = (error: unknown): string | null => {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
};

// PURCHASES_ERROR_CODE, as strings, for the few the app treats differently.
export const purchaseErrorCodes = {
  cancelled: "1",
  storeProblem: "2",
  notAllowed: "3",
  productUnavailable: "5",
  alreadyPurchased: "6",
  receiptInUse: "7",
  network: "10",
  invalidCredentials: "11",
  receiptInUseByOther: "13",
  inProgress: "15",
  ineligible: "18",
  paymentPending: "20",
  configuration: "23",
  offline: "35"
} as const;
