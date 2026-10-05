import { Linking, Platform } from "react-native";
import Purchases, {
  PURCHASES_ERROR_CODE,
  type CustomerInfo,
  type PurchasesPackage
} from "react-native-purchases";
import {
  customerStateFrom,
  offersFrom,
  oneAtATime,
  planProductFor,
  purchaseErrorCode,
  trialEligibilityFrom,
  type CustomerState,
  type PurchasesBridge,
  type TrialEligibility
} from "./purchase-catalog";

/**
 * react-native-purchases on iOS and Android. Metro picks this file for the
 * phone builds and revenuecat.ts for the web, so the SDK (and its 1 MB of
 * browser fallback) never reaches the web bundle.
 *
 * RevenueCat is a single native instance per app run, so this module keeps
 * the little state that comes with it: whether it is configured, whom it is
 * identified as, and the packages behind the offers on screen.
 */

let configured = false;
let identifiedAs: string | null = null;
const packages = new Map<string, PurchasesPackage>();

// logIn and logOut reach RevenueCat in the order the riders caused them. The
// app does not wait for a sign-out, so without this the next rider's logIn
// could run first and the late logOut would leave them anonymous -- and a
// purchase made then would belong to no Equina account.
const inOrder = oneAtATime();

const customerState = (info: CustomerInfo): CustomerState =>
  customerStateFrom({
    active: info.entitlements.active,
    all: info.entitlements.all,
    managementUrl: info.managementURL
  });

const appleStores = new Set(["APP_STORE", "MAC_APP_STORE"]);

export const revenueCat: PurchasesBridge = {
  supported: true,

  configure(apiKey, appUserId) {
    if (configured) return true;
    try {
      // Configured with the rider's id, so RevenueCat never makes an
      // anonymous customer for someone who is signed in.
      Purchases.configure({ apiKey, appUserID: appUserId });
      configured = true;
      identifiedAs = appUserId;
      return true;
    } catch {
      // A dev client built before react-native-purchases was installed has
      // no native module, and configure throws. The plans stay closed.
      return false;
    }
  },

  identify(appUserId) {
    return inOrder(async () => {
      if (identifiedAs === appUserId) return customerState(await Purchases.getCustomerInfo());
      const { customerInfo } = await Purchases.logIn(appUserId);
      identifiedAs = appUserId;
      packages.clear();
      return customerState(customerInfo);
    });
  },

  forget() {
    return inOrder(async () => {
      if (!configured || identifiedAs === null) return;
      identifiedAs = null;
      packages.clear();
      try {
        // logOut rejects (code 22) for a customer who is already anonymous.
        if (!(await Purchases.isAnonymous())) await Purchases.logOut();
      } catch {
        // Offline, or already anonymous: the next sign-in calls logIn, which
        // switches customers either way.
      }
    });
  },

  async loadOffers() {
    const offerings = await Purchases.getOfferings();
    const available = offerings.current?.availablePackages ?? [];
    packages.clear();
    for (const item of available) {
      if (planProductFor(item.product.identifier) && !packages.has(item.product.identifier)) {
        packages.set(item.product.identifier, item);
      }
    }
    return offersFrom(available.map((item) => item.product));
  },

  async trialEligibility(offers) {
    const withTrial = offers.filter((offer) => offer.freeTrial);
    if (withTrial.length === 0) return {};
    if (Platform.OS !== "ios") {
      // Google Play hands the app only the offers this account may use, so a
      // free phase on an Android product is one the rider will get.
      return Object.fromEntries(withTrial.map((offer) => [offer.productId, "eligible" as TrialEligibility]));
    }
    const answers = await Purchases.checkTrialOrIntroductoryPriceEligibility(withTrial.map((offer) => offer.productId));
    return Object.fromEntries(
      Object.entries(answers).map(([productId, answer]) => [productId, trialEligibilityFrom(Number(answer.status))])
    );
  },

  async purchase(productId, replacingProductId) {
    const item = packages.get(productId);
    if (!item) {
      throw Object.assign(new Error("This plan is not in the current offering."), {
        code: PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR
      });
    }
    // The App Store moves a rider between plans of one subscription group by
    // itself. Google Play needs the subscription being replaced, or it bills
    // both. Its ids carry the base plan after a colon, which it does not want.
    const change =
      Platform.OS === "android" && replacingProductId && replacingProductId !== productId
        ? { oldProductIdentifier: replacingProductId.split(":")[0] ?? replacingProductId }
        : null;
    try {
      const { customerInfo } = await Purchases.purchasePackage(item, null, change);
      return customerState(customerInfo);
    } catch (error) {
      if (purchaseErrorCode(error) === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR) return "cancelled";
      throw error;
    }
  },

  async restore() {
    return customerState(await Purchases.restorePurchases());
  },

  onCustomerChange(listener) {
    const handler = (info: CustomerInfo) => listener(customerState(info));
    Purchases.addCustomerInfoUpdateListener(handler);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(handler);
    };
  },

  async manage(state) {
    const store = state?.subscription?.store;
    // Apple's own sheet for an App Store subscription. Anything else -- Google
    // Play, or a plan bought on the web -- has a management page RevenueCat
    // knows, and Android has no sheet at all.
    if (Platform.OS === "ios" && (!store || appleStores.has(store))) {
      await Purchases.showManageSubscriptions();
      return;
    }
    const url =
      state?.managementUrl ??
      (Platform.OS === "android" ? "https://play.google.com/store/account/subscriptions" : null);
    if (url) await Linking.openURL(url);
    else await Purchases.showManageSubscriptions();
  }
};
