import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type { EquinaBackend, PlanState } from "../../backend";
import {
  legalLinks,
  manageFailedLine,
  purchaseFailureLine,
  purchaseSuccessLine,
  restoreFallbackLine,
  restoreOutcomeLine,
  syncPendingLine
} from "./paywall-copy";
import {
  purchaseErrorCode,
  purchaseErrorCodes,
  purchasesAvailable,
  revenueCatApiKey,
  storeAndPlanDisagree,
  type CustomerState,
  type StoreOffer,
  type StorePlatform,
  type TrialEligibility
} from "./purchase-catalog";
import { tierOf } from "./plan-rules";
import { revenueCat } from "./revenuecat";

// Public SDK keys, safe in the client. Read here, by name, so Expo inlines them.
const iosKey = process.env.EXPO_PUBLIC_REVENUECAT_IOS_API_KEY;
const androidKey = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY;

export type PurchasesStatus = "idle" | "loading" | "ready" | "failed";
export type PurchaseBusy =
  | { kind: "purchase"; productId: string }
  | { kind: "restore" }
  | { kind: "manage" }
  | null;
export type PurchaseMessage = { tone: "error" | "notice"; text: string } | null;

/**
 * Buying a plan through RevenueCat: the offers on sale, the purchase, a
 * restore, and the store's subscription settings.
 *
 * The store's answer is never the plan itself. After every purchase, restore
 * or change RevenueCat reports, the server reads the rider's subscriptions
 * (sync-purchases) and my_plan() is loaded again; the database decides what
 * is open, exactly as it does for a plan the Equina team grants.
 *
 * Until every condition in purchasesAvailable holds, this does nothing at all
 * -- no SDK call -- and the plan screen keeps saying subscriptions open with
 * the App Store release.
 */
export function usePurchases({
  backend,
  connected,
  userId,
  capability,
  plan,
  onPlanChanged
}: {
  backend: EquinaBackend | null;
  /** A signed-in rider on a real account, not the demo. */
  connected: boolean;
  userId: string | null;
  capability: boolean;
  plan: PlanState;
  /** Loads my_plan() again. */
  onPlanChanged: () => Promise<void>;
}) {
  const platform: StorePlatform = Platform.OS === "android" ? "android" : "ios";
  const apiKey = revenueCatApiKey({
    platform: Platform.OS,
    iosKey,
    androidKey,
    isDev: typeof __DEV__ !== "undefined" && __DEV__
  });
  const [nativeMissing, setNativeMissing] = useState(false);
  const available =
    revenueCat.supported &&
    !nativeMissing &&
    purchasesAvailable({
      connected,
      userId,
      platform: Platform.OS,
      apiKey,
      privacyPolicyUrl: legalLinks().privacyPolicyUrl,
      capability,
      enforced: plan.enforced
    });

  const [status, setStatus] = useState<PurchasesStatus>("idle");
  const [offers, setOffers] = useState<StoreOffer[]>([]);
  const [eligibility, setEligibility] = useState<Record<string, TrialEligibility>>({});
  const [customer, setCustomer] = useState<CustomerState | null>(null);
  const [busy, setBusy] = useState<PurchaseBusy>(null);
  const [message, setMessage] = useState<PurchaseMessage>(null);

  // Whom RevenueCat is identified as, from this hook's point of view. Until
  // it is the signed-in rider, nothing is bought or restored: a purchase
  // made under the previous customer would belong to someone else.
  const identified = useRef<string | null>(null);
  const [identifiedUser, setIdentifiedUser] = useState<string | null>(null);
  const [identifyAttempt, setIdentifyAttempt] = useState(0);
  const userRef = useRef(userId);
  userRef.current = userId;
  // The last customer state the server was asked to reconcile, or the first
  // one seen after sign-in. A change RevenueCat reports with the same
  // fingerprint needs no sync.
  const lastFingerprint = useRef<string | null>(null);
  const planRef = useRef(plan);
  planRef.current = plan;
  const availableRef = useRef(available);
  availableRef.current = available;
  const busyRef = useRef(false);
  const storeReady = () =>
    availableRef.current && identified.current !== null && identified.current === userRef.current;
  // Syncs run one after another. Two at once could finish out of order and
  // leave the older answer on screen.
  const syncChain = useRef<Promise<unknown>>(Promise.resolve());
  const loadRequest = useRef(0);

  /**
   * Has the server reconcile the rider's subscriptions, then reloads the
   * plan either way: a webhook may have written it already. Answers whether
   * the server confirmed.
   */
  const sync = useCallback((): Promise<boolean> => {
    const run = syncChain.current.then(async () => {
      let synced = false;
      try {
        if (backend) {
          await backend.plans.syncPurchases();
          synced = true;
        }
      } catch {
        // Kept quiet here: callers that the rider is waiting on say so.
      }
      await onPlanChanged().catch(() => undefined);
      return synced;
    });
    syncChain.current = run.catch(() => undefined);
    return run;
  }, [backend, onPlanChanged]);

  const loadOffers = useCallback(async () => {
    const request = ++loadRequest.current;
    setStatus("loading");
    try {
      const next = await revenueCat.loadOffers();
      // Eligibility only adds the trial line; without it, full prices show.
      const trials = await revenueCat.trialEligibility(next).catch(() => ({}));
      if (request !== loadRequest.current) return;
      setOffers(next);
      setEligibility(trials);
      setStatus("ready");
    } catch {
      if (request === loadRequest.current) setStatus("failed");
    }
  }, []);

  // A new account, or a signed-out one, starts clean. Declared before the
  // identity effect so it runs first when the rider changes.
  useEffect(() => {
    lastFingerprint.current = null;
    // Prices still loading for the previous rider land nowhere.
    loadRequest.current += 1;
    setCustomer(null);
    setOffers([]);
    setEligibility({});
    setMessage(null);
    setStatus("idle");
  }, [userId]);

  // Identity. RevenueCat's app user id is the Supabase user id, so the
  // server can find a purchase's rider from the webhook alone.
  useEffect(() => {
    if (!userId) {
      // Signed out. A no-op unless RevenueCat was configured this run.
      identified.current = null;
      void revenueCat.forget();
      return;
    }
    if (!available || !apiKey) return;
    if (!revenueCat.configure(apiKey, userId)) {
      setNativeMissing(true);
      return;
    }
    let active = true;
    setStatus("loading");
    void (async () => {
      try {
        const state = await revenueCat.identify(userId);
        if (!active) return;
        identified.current = userId;
        setIdentifiedUser(userId);
        lastFingerprint.current = state.fingerprint;
        setCustomer(state);
        // A webhook that never arrived would otherwise leave a paying rider
        // on Free until the next renewal.
        if (storeAndPlanDisagree(state.subscription?.tier ?? null, planRef.current)) void sync();
        await loadOffers();
      } catch {
        if (active) setStatus("failed");
      }
    })();
    return () => {
      active = false;
    };
  }, [apiKey, available, identifyAttempt, loadOffers, sync, userId]);

  // Renewals, lapses and refunds the SDK learns of while the app is open.
  useEffect(() => {
    if (!available) return;
    return revenueCat.onCustomerChange((state) => {
      if (!availableRef.current || identified.current !== userId) return;
      setCustomer(state);
      if (lastFingerprint.current === null || state.fingerprint === lastFingerprint.current) {
        lastFingerprint.current = state.fingerprint;
        return;
      }
      lastFingerprint.current = state.fingerprint;
      void sync();
    });
  }, [available, sync, userId]);

  const purchase = useCallback(async (productId: string): Promise<boolean> => {
    if (!storeReady() || busyRef.current) return false;
    busyRef.current = true;
    setBusy({ kind: "purchase", productId });
    setMessage(null);
    try {
      const offer = offers.find((item) => item.productId === productId);
      // Google Play replaces only a subscription it bills itself; any other
      // product named here makes the purchase fail.
      const current = customer?.subscription;
      const replacing = current?.store === "PLAY_STORE" ? current.productId : null;
      const result = await revenueCat.purchase(productId, replacing);
      if (result === "cancelled") return false;
      lastFingerprint.current = result.fingerprint;
      setCustomer(result);
      const synced = await sync();
      const name = offer ? tierOf(planRef.current, offer.tier).name : "your plan";
      const trial = offer && eligibility[offer.productId] === "eligible" ? offer.freeTrial : null;
      setMessage({ tone: "notice", text: synced ? purchaseSuccessLine(name, trial) : syncPendingLine });
      return true;
    } catch (error) {
      const code = purchaseErrorCode(error);
      const text = purchaseFailureLine(code, platform);
      if (text) setMessage({ tone: code === purchaseErrorCodes.paymentPending ? "notice" : "error", text });
      return false;
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [customer, eligibility, offers, platform, sync]);

  // From a tap only: it can make the store ask the rider to sign in.
  const restore = useCallback(async () => {
    if (!storeReady() || busyRef.current) return;
    busyRef.current = true;
    setBusy({ kind: "restore" });
    setMessage(null);
    try {
      const state = await revenueCat.restore();
      lastFingerprint.current = state.fingerprint;
      setCustomer(state);
      await sync();
      setMessage({ tone: "notice", text: restoreOutcomeLine(Boolean(state.subscription), platform) });
    } catch (error) {
      const text = purchaseFailureLine(purchaseErrorCode(error), platform, restoreFallbackLine);
      if (text) setMessage({ tone: "error", text });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [platform, sync]);

  const manage = useCallback(async () => {
    if (!storeReady() || busyRef.current) return;
    busyRef.current = true;
    setBusy({ kind: "manage" });
    setMessage(null);
    try {
      await revenueCat.manage(customer);
    } catch {
      setMessage({ tone: "error", text: manageFailedLine(platform) });
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }, [customer, platform]);

  // "Try again": the identity first if that is what failed, else the offers.
  const reload = useCallback(() => {
    if (!availableRef.current) return;
    if (identified.current !== userRef.current) setIdentifyAttempt((attempt) => attempt + 1);
    else void loadOffers();
  }, [loadOffers]);

  return {
    available,
    /** RevenueCat knows the rider: restore and purchases may run. */
    storeReady: available && identifiedUser !== null && identifiedUser === userId,
    platform,
    status,
    offers,
    eligibility,
    subscription: customer?.subscription ?? null,
    busy,
    message,
    purchase,
    restore,
    manage,
    reload
  };
}

export type PurchasesController = ReturnType<typeof usePurchases>;
