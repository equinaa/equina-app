import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { PlanState } from "../src/backend/contracts";
import {
  actionLabel,
  annualSavings,
  appleStandardEula,
  deletionBillingNote,
  eligibleTrial,
  legalLinks,
  monthlyEquivalentLine,
  priceLine,
  priceSpoken,
  pricesSpoken,
  purchaseFailureLine,
  purchaseSuccessLine,
  renewalDisclosure,
  restoreFallbackLine,
  restoreOutcomeLine,
  savingsLine,
  trialLength,
  trialLine
} from "../src/features/plans/paywall-copy";
import {
  billedHere,
  cardAction,
  customerStateFrom,
  freeTrialOf,
  offerFor,
  oneAtATime,
  offersFrom,
  planProductFor,
  purchaseErrorCode,
  purchasesAvailable,
  renewingStoreOf,
  revenueCatApiKey,
  storeAndPlanDisagree,
  subscriptionFrom,
  trialEligibilityFrom,
  type EntitlementLike,
  type StoreOffer,
  type StoreProductLike
} from "../src/features/plans/purchase-catalog";
import { foundingPlan } from "../src/features/plans/plan-rules";

const root = process.cwd();

const product = (identifier: string, price: number, overrides: Partial<StoreProductLike> = {}): StoreProductLike => ({
  identifier,
  price,
  priceString: `€${price.toFixed(2)}`,
  currencyCode: "EUR",
  pricePerMonthString: identifier.endsWith("annual") ? `€${(price / 12).toFixed(2)}` : `€${price.toFixed(2)}`,
  introPrice: { price: 0, cycles: 1, periodUnit: "WEEK", periodNumberOfUnits: 1 },
  ...overrides
});

const entitlement = (identifier: string, overrides: Partial<EntitlementLike> = {}): EntitlementLike => ({
  identifier,
  isActive: true,
  store: "APP_STORE",
  productIdentifier: `equina.${identifier}.annual`,
  willRenew: true,
  periodType: "TRIAL",
  expirationDate: "2026-10-12T09:00:00Z",
  billingIssueDetectedAt: null,
  ...overrides
});

const plan = (overrides: Partial<PlanState> = {}): PlanState => ({ ...foundingPlan, enforced: true, ...overrides });

// --- Which plan a product sells ---------------------------------------------------

// The product id decides, never the package id.
assert.deepEqual(planProductFor("equina.plus.monthly"), { tier: "mid", period: "monthly" });
assert.deepEqual(planProductFor("equina.plus.annual"), { tier: "mid", period: "annual" });
assert.deepEqual(planProductFor("equina.premium.monthly"), { tier: "premium", period: "monthly" });
assert.deepEqual(planProductFor("equina.premium.annual"), { tier: "premium", period: "annual" });
assert.deepEqual(planProductFor("equina.premium.annual:p1y"), { tier: "premium", period: "annual" }, "Google Play adds the base plan.");
for (const other of ["$rc_annual", "equina.gold.monthly", "equina.plus.weekly", "com.equina.plus.monthly", "equina.plus.monthly.v2", ""]) {
  assert.equal(planProductFor(other), null, `${other || "(empty)"} is not one of Equina's plans.`);
}

// --- The offering, as offers ---------------------------------------------------------

{
  const offers = offersFrom([
    product("equina.premium.annual", 99.99),
    product("equina.plus.monthly", 4.99),
    product("equina.some.bundle", 1),
    product("equina.premium.monthly", 9.99),
    product("equina.plus.annual", 49.99),
    product("equina.plus.monthly", 3.99)
  ]);
  assert.deepEqual(
    offers.map((offer) => offer.productId),
    ["equina.plus.monthly", "equina.plus.annual", "equina.premium.monthly", "equina.premium.annual"],
    "Plus before Premium, monthly before annual, unknown products left out."
  );
  assert.equal(offerFor(offers, "mid", "monthly")?.price, 4.99, "The first package for a plan and period wins.");
  assert.equal(offerFor(offers, "free", "monthly"), undefined);
  assert.deepEqual(offers[0]?.freeTrial, { unit: "week", count: 1 });
}

assert.deepEqual(freeTrialOf({ price: 0, cycles: 1, periodUnit: "DAY", periodNumberOfUnits: 7 }), { unit: "day", count: 7 });
assert.equal(freeTrialOf({ price: 0.99, cycles: 1, periodUnit: "MONTH", periodNumberOfUnits: 1 }), null, "A discounted start is not a trial.");
assert.equal(freeTrialOf(null), null);

// iOS eligibility is a number. Only a clear "eligible" promises a trial.
assert.equal(trialEligibilityFrom(2), "eligible");
assert.equal(trialEligibilityFrom(1), "ineligible");
assert.equal(trialEligibilityFrom(3), "ineligible");
assert.equal(trialEligibilityFrom(0), "unknown");

// --- What RevenueCat says the rider holds ----------------------------------------------------

assert.equal(subscriptionFrom({}), null);
assert.equal(subscriptionFrom({ premium: entitlement("premium"), plus: entitlement("plus") })?.tier, "premium", "Premium outranks Plus.");
assert.equal(subscriptionFrom({ plus: entitlement("plus") })?.tier, "mid", "The plus entitlement is the mid plan.");
assert.equal(subscriptionFrom({ premium: entitlement("premium", { store: "PROMOTIONAL" }) }), null, "A dashboard grant is not a store subscription.");
assert.equal(subscriptionFrom({ gold: entitlement("gold") }), null);
assert.equal(subscriptionFrom({ plus: entitlement("plus", { isActive: false }) }), null);

{
  const before = customerStateFrom({ active: { plus: entitlement("plus") }, all: { plus: entitlement("plus") }, managementUrl: null });
  const same = customerStateFrom({ active: { plus: entitlement("plus") }, all: { plus: entitlement("plus") }, managementUrl: "https://x" });
  const renewed = customerStateFrom({
    active: { plus: entitlement("plus") },
    all: { plus: entitlement("plus", { expirationDate: "2026-11-12T09:00:00Z", periodType: "NORMAL" }) },
    managementUrl: null
  });
  const lapsed = customerStateFrom({ active: {}, all: { plus: entitlement("plus", { isActive: false }) }, managementUrl: null });
  assert.equal(before.fingerprint, same.fingerprint, "Nothing the server reconciles changed.");
  assert.notEqual(before.fingerprint, renewed.fingerprint, "A renewal moves the end date.");
  assert.notEqual(before.fingerprint, lapsed.fingerprint);
  assert.equal(lapsed.subscription, null);
}

// The first look after sign-in syncs only when store and database cannot both be right.
assert.equal(storeAndPlanDisagree("mid", plan()), true, "Paid in the store, Free in the database: a missed webhook.");
assert.equal(storeAndPlanDisagree(null, plan({ tier: "mid", source: "app_store" })), true, "A lapse the database missed.");
assert.equal(storeAndPlanDisagree("mid", plan({ tier: "mid", source: "app_store" })), false);
assert.equal(storeAndPlanDisagree("mid", plan({ tier: "premium", source: "staff" })), false, "A staff grant above the store is expected.");
assert.equal(storeAndPlanDisagree(null, plan()), false);

// --- What each card offers ------------------------------------------------------------------

{
  const offer = { productId: "equina.premium.annual" } as StoreOffer;
  const plus = { tier: "mid" as const, productId: "equina.plus.annual", store: "APP_STORE", willRenew: true };
  const on = "ios" as const;
  assert.equal(cardAction({ tier: "free", plan: plan(), subscription: null, offer: undefined, platform: on }), "none");
  assert.equal(cardAction({ tier: "premium", plan: plan(), subscription: null, offer, platform: on }), "buy");
  assert.equal(cardAction({ tier: "premium", plan: plan(), subscription: null, offer: undefined, platform: on }), "none", "No price, no button.");
  assert.equal(cardAction({ tier: "mid", plan: plan({ tier: "mid", source: "app_store" }), subscription: plus, offer, platform: on }), "manage");
  assert.equal(cardAction({ tier: "premium", plan: plan({ tier: "mid", source: "app_store" }), subscription: plus, offer, platform: on }), "upgrade");
  assert.equal(
    cardAction({ tier: "mid", plan: plan(), subscription: { ...plus, tier: "premium" }, offer, platform: on }),
    "switch",
    "Moving down happens in the store's settings."
  );
  assert.equal(cardAction({ tier: "premium", plan: plan({ tier: "premium", source: "staff" }), subscription: null, offer, platform: on }), "held");
  assert.equal(
    cardAction({ tier: "mid", plan: plan({ tier: "premium", source: "staff" }), subscription: null, offer, platform: on }),
    "buy",
    "A staff grant does not stop a rider from subscribing."
  );

  // A plan another store bills is never bought over here: that would be a
  // second subscription, billed alongside the first.
  const playPlus = { ...plus, store: "PLAY_STORE", productId: "equina.plus.annual:p1y" };
  assert.equal(cardAction({ tier: "premium", plan: plan({ tier: "mid", source: "play" }), subscription: playPlus, offer, platform: "ios" }), "switch");
  assert.equal(cardAction({ tier: "premium", plan: plan({ tier: "mid", source: "app_store" }), subscription: plus, offer, platform: "android" }), "switch");
  assert.equal(cardAction({ tier: "premium", plan: plan({ tier: "mid", source: "stripe" }), subscription: { ...plus, store: "RC_BILLING" }, offer, platform: "ios" }), "switch");
  assert.equal(cardAction({ tier: "premium", plan: plan({ tier: "mid", source: "play" }), subscription: playPlus, offer, platform: "android" }), "upgrade");
  assert.equal(cardAction({ tier: "mid", plan: plan({ tier: "mid", source: "play" }), subscription: playPlus, offer, platform: "ios" }), "manage");
  assert.equal(billedHere({ ...plus, store: "MAC_APP_STORE" }, "ios"), true);
  assert.equal(billedHere({ ...plus, store: "TEST_STORE" }, "android"), true, "The Test Store stands in for either store.");
  assert.equal(billedHere(playPlus, "ios"), false);
  assert.equal(billedHere(plus, "android"), false);

  // Who will bill the rider after their account is deleted.
  assert.equal(renewingStoreOf(plus, plan()), "app_store");
  assert.equal(renewingStoreOf(playPlus, plan()), "play");
  assert.equal(renewingStoreOf({ ...plus, willRenew: false }, plan({ tier: "mid", source: "app_store" })), null, "Cancelled: nothing renews.");
  assert.equal(renewingStoreOf(null, plan({ tier: "mid", source: "app_store" })), "app_store", "Without RevenueCat (the web), the plan's source says.");
  assert.equal(renewingStoreOf(null, plan({ tier: "premium", source: "staff" })), null);
  assert.equal(renewingStoreOf({ ...plus, store: "TEST_STORE" }, plan()), null);
}

// A sign-out still running when the next rider signs in must finish first,
// or its logOut lands after their logIn and leaves them anonymous.
{
  const inOrder = oneAtATime();
  const calls: string[] = [];
  const slowLogOut = inOrder(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
    calls.push("logOut");
    throw new Error("offline");
  });
  const logIn = inOrder(async () => {
    calls.push("logIn");
    return "rider";
  });
  await assert.rejects(slowLogOut, /offline/);
  assert.equal(await logIn, "rider", "A failed step does not stop the next one.");
  assert.deepEqual(calls, ["logOut", "logIn"]);
}

// --- When anything is sold at all --------------------------------------------------------------

{
  const everything: Parameters<typeof purchasesAvailable>[0] = {
    connected: true,
    userId: "0e7c6b0c-1111-4222-8333-444455556666",
    platform: "ios",
    apiKey: "appl_public",
    privacyPolicyUrl: "https://equina.app/privacy",
    capability: true,
    enforced: true,
    access: true
  };
  assert.equal(purchasesAvailable(everything), true);
  assert.equal(purchasesAvailable({ ...everything, platform: "android" }), true);
  const missing: Array<[string, Partial<typeof everything>]> = [
    ["the demo", { connected: false }],
    ["a signed-out rider", { userId: "" }],
    ["the web", { platform: "web" }],
    ["no RevenueCat key", { apiKey: null }],
    ["no privacy policy", { privacyPolicyUrl: null }],
    ["the server's capability", { capability: false }],
    ["the founding phase", { enforced: false }],
    ["an account outside the beta", { access: false }]
  ];
  for (const [what, change] of missing) {
    assert.equal(purchasesAvailable({ ...everything, ...change }), false, `Nothing is sold without ${what}.`);
  }
}

assert.equal(revenueCatApiKey({ platform: "ios", iosKey: " appl_abc ", androidKey: "goog_x", isDev: false }), "appl_abc");
assert.equal(revenueCatApiKey({ platform: "android", iosKey: "appl_abc", androidKey: "goog_x", isDev: false }), "goog_x");
assert.equal(revenueCatApiKey({ platform: "web", iosKey: "appl_abc", androidKey: "goog_x", isDev: true }), null);
assert.equal(revenueCatApiKey({ platform: "ios", iosKey: "", androidKey: undefined, isDev: true }), null);
assert.equal(revenueCatApiKey({ platform: "ios", iosKey: "test_abc", androidKey: undefined, isDev: true }), "test_abc");
assert.equal(
  revenueCatApiKey({ platform: "ios", iosKey: "test_abc", androidKey: undefined, isDev: false }),
  null,
  "A Test Store key crashes release builds, so outside development it counts as none."
);

assert.equal(purchaseErrorCode({ code: "1", message: "cancelled" }), "1");
assert.equal(purchaseErrorCode(new Error("plain")), null);
assert.equal(purchaseErrorCode(null), null);

// --- Prices -------------------------------------------------------------------------------------

{
  const [plusMonthly, plusAnnual] = offersFrom([product("equina.plus.monthly", 4.99), product("equina.plus.annual", 49.99)]);
  assert.ok(plusMonthly && plusAnnual);
  assert.equal(priceLine(plusAnnual), "€49.99/year");
  assert.equal(priceLine(plusMonthly), "€4.99/month");
  assert.equal(priceSpoken(plusAnnual), "€49.99 per year");
  assert.equal(pricesSpoken("€4.17/month · Save 16%"), "€4.17 per month · Save 16%");
  assert.equal(pricesSpoken("7 days free, then €59.99/year"), "7 days free, then €59.99 per year");
  assert.equal(monthlyEquivalentLine(plusAnnual), "€4.17/month", "An annual price, broken down per month.");
  assert.equal(monthlyEquivalentLine(plusMonthly), null);
  // 49.99 against 12 x 4.99 = 59.88 saves 16.5%: rounded down, never up.
  assert.equal(annualSavings(plusMonthly, plusAnnual), 16);
  assert.equal(savingsLine(annualSavings(plusMonthly, plusAnnual)), "Save 16%");
  assert.equal(annualSavings(plusMonthly, { ...plusAnnual, currencyCode: "USD" }), null, "Two currencies cannot be compared.");
  assert.equal(annualSavings(plusMonthly, { ...plusAnnual, price: 59.88 }), null, "No saving, no claim.");
  assert.equal(annualSavings(undefined, plusAnnual), null);
  assert.equal(savingsLine(null), null);

  // --- Trials ---------------------------------------------------------------------------------
  assert.deepEqual(trialLength({ unit: "week", count: 1 }), { phrase: "7 days", adjective: "7-day" });
  assert.deepEqual(trialLength({ unit: "day", count: 3 }), { phrase: "3 days", adjective: "3-day" });
  assert.deepEqual(trialLength({ unit: "month", count: 1 }), { phrase: "1 month", adjective: "1-month" });
  assert.deepEqual(trialLength({ unit: "month", count: 2 }), { phrase: "2 months", adjective: "2-month" });

  const premiumAnnual = offersFrom([product("equina.premium.annual", 59.99)])[0]!;
  const trial = eligibleTrial(premiumAnnual, "eligible");
  assert.equal(trialLine(premiumAnnual, trial), "7 days free, then €59.99/year");
  assert.equal(eligibleTrial(premiumAnnual, "ineligible"), null, "A rider who had the trial pays from day one.");
  assert.equal(eligibleTrial(premiumAnnual, "unknown"), null, "Unknown shows the full price, as RevenueCat advises.");
  assert.equal(eligibleTrial(premiumAnnual, undefined), null);
  assert.equal(eligibleTrial({ ...premiumAnnual, freeTrial: null }, "eligible"), null);
  assert.equal(trialLine(premiumAnnual, null), null);

  // --- Buttons ---------------------------------------------------------------------------------
  assert.equal(actionLabel({ action: "buy", tierName: "Plus", trial }), "Start 7-day free trial");
  assert.equal(actionLabel({ action: "buy", tierName: "Plus", trial: null }), "Subscribe");
  assert.equal(actionLabel({ action: "upgrade", tierName: "Premium", trial: null }), "Upgrade to Premium");
  assert.equal(actionLabel({ action: "manage", tierName: "Plus", trial: null }), "Manage subscription");
  assert.equal(actionLabel({ action: "switch", tierName: "Plus", trial: null }), "Switch to Plus");
  assert.equal(actionLabel({ action: "held", tierName: "Plus", trial: null }), null);
  assert.equal(actionLabel({ action: "none", tierName: "Free", trial: null }), null);

  assert.equal(purchaseSuccessLine("Plus", trial), "Your 7-day free trial of Plus has started.");
  assert.equal(purchaseSuccessLine("Premium", null), "Welcome to Premium.");
}

// --- The terms next to the button ------------------------------------------------------------------

{
  const ios = renewalDisclosure("ios");
  assert.match(ios, /renew automatically/);
  assert.match(ios, /Apple Account/);
  assert.match(ios, /24 hours/);
  assert.match(ios, /free trial/);
  assert.match(renewalDisclosure("android"), /Google Play/);
}

// Terms default to Apple's standard EULA; the privacy policy has no default.
assert.deepEqual(legalLinks({}), { privacyPolicyUrl: null, termsUrl: appleStandardEula });
assert.equal(appleStandardEula, "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/");
assert.deepEqual(
  legalLinks({ privacyPolicyUrl: " https://equina.app/privacy ", termsUrl: "https://equina.app/terms" }),
  { privacyPolicyUrl: "https://equina.app/privacy", termsUrl: "https://equina.app/terms" }
);
assert.equal(legalLinks({ privacyPolicyUrl: "equina.app/privacy" }).privacyPolicyUrl, null, "Only a web address opens.");
assert.equal(legalLinks({ termsUrl: "javascript:alert(1)" }).termsUrl, appleStandardEula);

// Deleting the account stops no store's billing, and the rider is told so.
assert.match(deletionBillingNote("app_store") ?? "", /App Store.*keeps renewing.*Cancel it/);
assert.match(deletionBillingNote("play") ?? "", /Google Play.*keeps renewing.*Cancel it/);
assert.equal(deletionBillingNote(null), null);

// --- Failures in plain words ---------------------------------------------------------------------------

assert.equal(purchaseFailureLine("1", "ios"), null, "Backing out of the store's sheet is not an error.");
assert.match(purchaseFailureLine("20", "ios") ?? "", /waiting for approval/);
assert.match(purchaseFailureLine("10", "ios") ?? "", /No connection/);
assert.match(purchaseFailureLine("35", "android") ?? "", /No connection/);
assert.match(purchaseFailureLine("7", "ios") ?? "", /another Equina account/);
assert.match(purchaseFailureLine("2", "android") ?? "", /^Google Play had a problem/);
assert.match(purchaseFailureLine("2", "ios") ?? "", /^The App Store had a problem/);
assert.equal(purchaseFailureLine("99", "ios"), "The purchase could not be completed. Try again.");
assert.equal(purchaseFailureLine(null, "ios", restoreFallbackLine), restoreFallbackLine);
assert.equal(restoreOutcomeLine(true, "ios"), "Your subscription is restored.");
assert.equal(restoreOutcomeLine(false, "ios"), "No subscription was found for this Apple Account.");

// --- The web never loads the SDK ------------------------------------------------------------------------

{
  const sources: string[] = [];
  const visit = (directory: string) => {
    for (const name of readdirSync(directory)) {
      const path = join(directory, name);
      if (statSync(path).isDirectory()) visit(path);
      else if (/\.(ts|tsx)$/.test(name)) sources.push(path);
    }
  };
  visit(join(root, "src"));
  const importers = sources
    .filter((path) => /from "react-native-purchases"/.test(readFileSync(path, "utf8")))
    .map((path) => path.slice(root.length + 1));
  assert.deepEqual(
    importers,
    ["src/features/plans/revenuecat.native.ts"],
    "Only the native bridge may import react-native-purchases; Metro gives the web revenuecat.ts instead."
  );
  assert.doesNotMatch(readFileSync(join(root, "src/features/plans/revenuecat.ts"), "utf8"), /react-native-purchases/);
  // RevenueCat's secret key belongs to the server alone.
  for (const path of sources) {
    assert.doesNotMatch(readFileSync(path, "utf8"), /REVENUECAT_SECRET|sk_[A-Za-z0-9]{20,}/, `${path} must not hold a secret.`);
  }
}

{
  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };
  assert.match(packageJson.dependencies["react-native-purchases"] ?? "", /^\d+\.\d+\.\d+$/, "Pinned exactly: expo install does not pin it.");
  const example = readFileSync(join(root, ".env.example"), "utf8");
  for (const name of [
    "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY",
    "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
    "EXPO_PUBLIC_PRIVACY_POLICY_URL",
    "EXPO_PUBLIC_TERMS_URL"
  ]) {
    assert.match(example, new RegExp(`^${name}=$`, "m"), `${name} belongs in .env.example, empty.`);
  }
}

// --- Local StoreKit testing --------------------------------------------------------------------------------

{
  type StoreKitSubscription = {
    productID: string;
    groupNumber: number;
    displayPrice: string;
    recurringSubscriptionPeriod: string;
    subscriptionGroupID: string;
    introductoryOffer: { paymentMode: string; subscriptionPeriod: string; numberOfPeriods: number } | null;
  };
  const storekit = JSON.parse(readFileSync(join(root, "storekit", "Equina.storekit"), "utf8")) as {
    version: { major: number; minor: number };
    subscriptionGroups: Array<{ id: string; name: string; subscriptions: StoreKitSubscription[] }>;
  };
  assert.deepEqual(storekit.version, { major: 4, minor: 0 }, "Xcode 26 writes version 4.0.");
  assert.equal(storekit.subscriptionGroups.length, 1, "One group, so Plus and Premium replace each other.");
  const group = storekit.subscriptionGroups[0]!;
  assert.equal(group.name, "Equina");
  const byId = new Map(group.subscriptions.map((item) => [item.productID, item]));
  assert.deepEqual(
    [...byId.keys()].sort(),
    ["equina.plus.annual", "equina.plus.monthly", "equina.premium.annual", "equina.premium.monthly"]
  );
  for (const item of group.subscriptions) {
    assert.ok(planProductFor(item.productID), `${item.productID} must map to a plan.`);
    assert.equal(item.subscriptionGroupID, group.id);
    assert.deepEqual(
      item.introductoryOffer && {
        paymentMode: item.introductoryOffer.paymentMode,
        subscriptionPeriod: item.introductoryOffer.subscriptionPeriod,
        numberOfPeriods: item.introductoryOffer.numberOfPeriods
      },
      { paymentMode: "free", subscriptionPeriod: "P1W", numberOfPeriods: 1 },
      `${item.productID} starts with a 7-day free trial.`
    );
    assert.equal(item.recurringSubscriptionPeriod, item.productID.endsWith("annual") ? "P1Y" : "P1M");
  }
  // Level 1 is the top of the group: Premium ranks above Plus.
  assert.ok(byId.get("equina.premium.monthly")!.groupNumber < byId.get("equina.plus.monthly")!.groupNumber);
  assert.equal(byId.get("equina.premium.annual")!.groupNumber, byId.get("equina.premium.monthly")!.groupNumber);
  assert.deepEqual(
    group.subscriptions.map((item) => [item.productID, item.displayPrice]).sort(),
    [
      ["equina.plus.annual", "49.99"],
      ["equina.plus.monthly", "4.99"],
      ["equina.premium.annual", "99.99"],
      ["equina.premium.monthly", "9.99"]
    ]
  );

  const appConfig = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as { expo: { plugins: unknown[] } };
  assert.ok(
    appConfig.expo.plugins.some((plugin) => plugin === "./plugins/with-storekit-configuration.cjs"),
    "The StoreKit plugin must be registered, or prebuild drops the file."
  );
}

console.log("Paywall rules passed.");
