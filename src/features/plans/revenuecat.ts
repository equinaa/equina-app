import type { PurchasesBridge } from "./purchase-catalog";

/**
 * The web's stand-in for revenuecat.native.ts. Equina sells plans through the
 * App Store and Google Play only, so the web never loads RevenueCat's SDK:
 * importing it here would add its browser build to the bundle, and
 * configuring it with an App Store key throws.
 */

const notOnTheWeb = async (): Promise<never> => {
  throw new Error("Plans are sold in the iOS and Android apps.");
};

export const revenueCat: PurchasesBridge = {
  supported: false,
  configure: () => false,
  identify: notOnTheWeb,
  forget: async () => undefined,
  loadOffers: notOnTheWeb,
  trialEligibility: notOnTheWeb,
  purchase: notOnTheWeb,
  restore: notOnTheWeb,
  onCustomerChange: () => () => undefined,
  manage: notOnTheWeb
};
