import {
  purchaseErrorCodes,
  type BillingPeriod,
  type CardAction,
  type FreeTrial,
  type StoreOffer,
  type StorePlatform,
  type TrialEligibility
} from "./purchase-catalog";

/**
 * The words on the paywall. Apple reviews these as closely as the code
 * (Guideline 3.1.2 and the Developer Program License Agreement, Schedule 2):
 * the billed price is the most prominent one, a per-month breakdown stays
 * secondary, a trial says how long it lasts and what it costs afterwards, and
 * Terms of Use and a Privacy Policy are one tap away.
 */

export const appleStandardEula = "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

const webAddress = (value: string | undefined) => {
  const trimmed = value?.trim() ?? "";
  return /^https?:\/\/\S+$/i.test(trimmed) ? trimmed : null;
};

/**
 * Where the paywall's legal links go. Without a privacy policy the app does
 * not sell at all. The terms default to Apple's standard EULA, which is what
 * App Store Connect applies when no custom one is set.
 */
export const legalLinks = (
  env: { privacyPolicyUrl?: string; termsUrl?: string } = {
    privacyPolicyUrl: process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL,
    termsUrl: process.env.EXPO_PUBLIC_TERMS_URL
  }
) => ({
  privacyPolicyUrl: webAddress(env.privacyPolicyUrl),
  termsUrl: webAddress(env.termsUrl) ?? appleStandardEula
});

export const storeName = (platform: StorePlatform) => (platform === "ios" ? "App Store" : "Google Play");
// "the App Store" but "Google Play", in the middle of a sentence and at its start.
const theStore = (platform: StorePlatform) => (platform === "ios" ? "the App Store" : "Google Play");
const TheStore = (platform: StorePlatform) => (platform === "ios" ? "The App Store" : "Google Play");
const storeAccount = (platform: StorePlatform) => (platform === "ios" ? "Apple Account" : "Google account");

export const periodLabels: Record<BillingPeriod, string> = { monthly: "Monthly", annual: "Annual" };
const periodWord: Record<BillingPeriod, string> = { monthly: "month", annual: "year" };

/** The billed amount, the most prominent price on the card: "€49.99/year". */
export const priceLine = (offer: StoreOffer) => `${offer.priceString}/${periodWord[offer.period]}`;

/** The same price for a screen reader, which reads "/" as "slash". */
export const priceSpoken = (offer: StoreOffer) => `${offer.priceString} per ${periodWord[offer.period]}`;

/** Any line holding "/month" or "/year", for a screen reader. */
export const pricesSpoken = (line: string) => line.replace(/\/(month|year)\b/g, " per $1");

/** An annual price per month, shown smaller than the billed amount. */
export const monthlyEquivalentLine = (offer: StoreOffer) =>
  offer.period === "annual" && offer.pricePerMonthString ? `${offer.pricePerMonthString}/month` : null;

/**
 * Whole percent saved by paying yearly, rounded down so it never overstates.
 * Null unless both prices are known, in one currency, and the saving is real.
 */
export const annualSavings = (monthly: StoreOffer | undefined, annual: StoreOffer | undefined): number | null => {
  if (!monthly || !annual || monthly.currencyCode !== annual.currencyCode) return null;
  if (monthly.price <= 0 || annual.price <= 0) return null;
  const percent = Math.floor((1 - annual.price / (monthly.price * 12)) * 100 + 1e-9);
  return percent >= 1 ? percent : null;
};

export const savingsLine = (percent: number | null) => (percent ? `Save ${percent}%` : null);

/** "7 days" and "7-day". A week-long trial reads as days, as Apple's sheet does. */
export const trialLength = (trial: FreeTrial) => {
  if (trial.unit === "day" || trial.unit === "week") {
    const days = trial.count * (trial.unit === "week" ? 7 : 1);
    return { phrase: `${days} ${days === 1 ? "day" : "days"}`, adjective: `${days}-day` };
  }
  return {
    phrase: `${trial.count} ${trial.unit}${trial.count === 1 ? "" : "s"}`,
    adjective: `${trial.count}-${trial.unit}`
  };
};

/**
 * The trial a rider will actually get, or null. A product's introductory
 * offer is only metadata: the store decides who may use it, and a rider who
 * already had a trial in the group is charged from the first day.
 */
export const eligibleTrial = (offer: StoreOffer | undefined, eligibility: TrialEligibility | undefined) =>
  offer?.freeTrial && eligibility === "eligible" ? offer.freeTrial : null;

/** "7 days free, then €49.99/year". */
export const trialLine = (offer: StoreOffer, trial: FreeTrial | null) =>
  trial ? `${trialLength(trial).phrase} free, then ${priceLine(offer)}` : null;

/** The label on a plan card's button, or null when the card has none. */
export const actionLabel = ({
  action,
  tierName,
  trial
}: {
  action: CardAction;
  tierName: string;
  trial: FreeTrial | null;
}) => {
  switch (action) {
    case "buy":
      return trial ? `Start ${trialLength(trial).adjective} free trial` : "Subscribe";
    case "upgrade":
      return `Upgrade to ${tierName}`;
    case "manage":
      return "Manage subscription";
    case "switch":
      return `Switch to ${tierName}`;
    default:
      return null;
  }
};

export const purchaseBusyLabel = (platform: StorePlatform) => `Waiting for ${theStore(platform)}…`;

/**
 * Next to the buttons, as Apple's Schedule 2 asks: that it renews, how
 * billing works, and how to stop it.
 */
export const renewalDisclosure = (platform: StorePlatform) =>
  platform === "ios"
    ? "Subscriptions renew automatically at the price shown, each month or year, until you cancel. " +
      "Payment is charged to your Apple Account when you confirm, or when a free trial ends. " +
      "Cancel at least 24 hours before a free trial or period ends to avoid the next charge. " +
      "Manage or cancel any time in your App Store account settings."
    : "Subscriptions renew automatically at the price shown, each month or year, until you cancel. " +
      "Payment is charged to your Google account when you confirm, or when a free trial ends. " +
      "Cancel before a free trial or period ends to avoid the next charge. " +
      "Manage or cancel any time in Google Play's subscriptions.";

export const offersLoadingLine = (platform: StorePlatform) => `Loading prices from ${theStore(platform)}`;

export const offersFailedLine = (platform: StorePlatform) =>
  `Prices could not be loaded from ${theStore(platform)}. Check your connection and try again.`;

export const noOffersLine = (platform: StorePlatform) =>
  `These plans are not on sale in ${theStore(platform)} yet.`;

export const purchaseSuccessLine = (tierName: string, trial: FreeTrial | null) =>
  trial ? `Your ${trialLength(trial).adjective} free trial of ${tierName} has started.` : `Welcome to ${tierName}.`;

/** The store took the payment and the server has not caught up yet. */
export const syncPendingLine = "Your purchase went through. Your plan will update in a moment.";

export const restoreOutcomeLine = (found: boolean, platform: StorePlatform) =>
  found ? "Your subscription is restored." : `No subscription was found for this ${storeAccount(platform)}.`;

export const manageFailedLine = (platform: StorePlatform) =>
  `Subscription settings could not be opened. You can find them in your ${storeAccount(platform)} settings.`;

/**
 * A failed purchase or restore, in plain words. Null for a cancelled one:
 * backing out of the store's sheet is a change of mind, not an error.
 */
export const purchaseFailureLine = (
  code: string | null,
  platform: StorePlatform,
  fallback = "The purchase could not be completed. Try again."
): string | null => {
  const store = storeName(platform);
  switch (code) {
    case purchaseErrorCodes.cancelled:
      return null;
    case purchaseErrorCodes.paymentPending:
      return `Your purchase is waiting for approval. Your plan opens as soon as ${theStore(platform)} confirms it.`;
    case purchaseErrorCodes.network:
    case purchaseErrorCodes.offline:
      return "No connection. Check your connection and try again.";
    case purchaseErrorCodes.storeProblem:
      return `${TheStore(platform)} had a problem. Try again in a moment.`;
    case purchaseErrorCodes.notAllowed:
      return platform === "ios"
        ? "Purchases are turned off on this device. Check Screen Time's content and privacy restrictions."
        : "Purchases are not allowed for this Google account.";
    case purchaseErrorCodes.productUnavailable:
      return `This plan is not available in your ${store} region yet.`;
    case purchaseErrorCodes.alreadyPurchased:
      return "You already have this subscription. Tap Restore purchases to bring it back.";
    case purchaseErrorCodes.receiptInUse:
    case purchaseErrorCodes.receiptInUseByOther:
      return `The subscription on this ${storeAccount(platform)} belongs to another Equina account. Sign in to that account to use it.`;
    case purchaseErrorCodes.inProgress:
      return "A purchase is already in progress.";
    case purchaseErrorCodes.ineligible:
      return "This offer is not available for your account.";
    case purchaseErrorCodes.invalidCredentials:
    case purchaseErrorCodes.configuration:
      return "Subscriptions are not set up correctly yet. Try again later.";
    default:
      return fallback;
  }
};

export const restoreFallbackLine = "Your purchases could not be restored. Try again.";

/**
 * Said before an account is deleted while a store still renews its plan.
 * Deleting the account cancels nothing in the store, and Apple asks apps to
 * say so and to have the subscription cancelled first (Offering account
 * deletion in your app; Guideline 5.1.1(v)).
 */
export const deletionBillingNote = (renewingStore: "app_store" | "play" | null) =>
  renewingStore === "app_store"
    ? "Your subscription is billed by the App Store and keeps renewing after your account is deleted. " +
      "Cancel it in your App Store account settings first."
    : renewingStore === "play"
      ? "Your subscription is billed by Google Play and keeps renewing after your account is deleted. " +
        "Cancel it in Google Play's subscriptions first."
      : null;
