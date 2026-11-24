/**
 * What Android's Back button or back gesture does, decided from what is on
 * screen.
 *
 * Nothing here knows React or React Native: EquinaApp hands over the few
 * values that decide which layer it draws, and gets back one thing to do. The
 * checks follow the order EquinaApp draws its layers (its early returns, then
 * the app layer, then the onboarding layer), top-most first, so Back always
 * answers for the screen the rider is looking at.
 *
 * Two things never reach this file:
 * - The keyboard. Android closes it before the app hears about Back.
 * - Sheets. Every sheet in the app is a React Native Modal. While one is up,
 *   its dialog takes Back and calls its onRequestClose, and no
 *   hardwareBackPress reaches JavaScript at all.
 *
 * "system" hands Back to Android, which moves Equina to the background with
 * everything as it was, as the Home button does. It never closes the app.
 *
 * Back only ever takes a step that loses nothing. It never ends a ride, never
 * signs anyone out, never deletes, and never drops the screen that waits for
 * an emailed code. The ride's X throws the ride away without asking, so "do
 * what the close button does" is the one rule this file must not follow
 * everywhere.
 */

export type BackTab = "home" | "gear" | "stable" | "assistant" | "community" | "profile";
export type BackShopBuyerView =
  | "browse"
  | "product"
  | "checkout"
  | "orders"
  | "saved"
  | "messages"
  | "conversation"
  | "fit"
  | "protection";
export type BackShopSellerView = "dashboard" | "orders" | "revenue" | "messages" | "conversation" | "listing";

export type BackState = {
  /** useEquinaSession's phase. */
  phase: "restoring" | "signedOut" | "onboarding" | "authenticated" | "recoverableError" | "demo";
  /** The new-password screen after a reset link or code. */
  recoveryRequired: boolean;
  /** Signed in, but outside the beta. */
  betaDoor: boolean;
  accountCreated: boolean;
  /** Onboarding is fading into the app; neither layer takes touches. */
  onboardingTransitioning: boolean;
  entryRoute: "signin" | "create";
  /** "Check your inbox": the emailed code or link. */
  otpVisible: boolean;
  onboardingStep: "you" | "horse" | "preview";
  /** One of the sheets EquinaApp itself opens is up. It is a Modal; see above. */
  modalSheetOpen: boolean;
  tab: BackTab;
  rideActive: boolean;
  /** The ride has its plan and its clock, which is when its screen draws. */
  rideReady: boolean;
  /** The recap was asked for and there is a ride to recap. */
  recapVisible: boolean;
  ralfOpen: boolean;
  academyMode: "home" | "video";
  shopMode: "browse" | "sell";
  shopBuyerView: BackShopBuyerView;
  shopSellerView: BackShopSellerView;
  /** Horses was opened from the account's "Horses" row. */
  stableFromAccount: boolean;
};

export type BackAction =
  /** Not handled: Android puts Equina in the background, as it does today. */
  | { type: "system" }
  /** Handled, and nothing changes. */
  | { type: "stay" }
  | { type: "onboarding-back" }
  | { type: "close-recap" }
  | { type: "close-ralf" }
  | { type: "close-account" }
  | { type: "academy-home" }
  | { type: "shop-buyer"; view: BackShopBuyerView }
  | { type: "shop-seller"; view: BackShopSellerView }
  | { type: "back-to-account" }
  | { type: "go-home" };

// Where each Shop page's own back arrow leads (GearScreen in App.tsx). Null is
// the Shop's front page, which has no arrow.
export const shopBuyerBack: Record<BackShopBuyerView, BackShopBuyerView | null> = {
  browse: null,
  product: "browse",
  checkout: "product",
  orders: "browse",
  saved: "browse",
  messages: "browse",
  conversation: "product",
  fit: "product",
  protection: "product"
};
export const shopSellerBack: Record<BackShopSellerView, BackShopSellerView | null> = {
  dashboard: null,
  orders: "dashboard",
  revenue: "dashboard",
  messages: "dashboard",
  conversation: "messages",
  listing: "dashboard"
};

const system: BackAction = { type: "system" };
const stay: BackAction = { type: "stay" };

export function androidBackAction(state: BackState): BackAction {
  // The screens that stand in for the whole app (EquinaApp's early returns).
  // Their buttons retry, sign out or delete, and none of those is a step back.
  if (state.phase === "restoring" || state.phase === "recoverableError") return system;
  if (state.recoveryRequired || state.betaDoor) return system;

  // The arrival takes no touches, and no Back either.
  if (state.onboardingTransitioning) return stay;

  // A sheet is up and Back still came here, which its Modal should not allow
  // (it can, for a frame, while the sheet's dialog is still opening). The
  // screen under an open sheet must not move.
  if (state.modalSheetOpen) return stay;

  if (!state.accountCreated) {
    // "Check your inbox": the rider is about to go to their email, and many
    // go with Back. In the background the screen is still here when they come
    // back with the code. Its own arrow drops it, and a new code cannot be
    // asked for within a minute.
    if (state.otpVisible) return system;
    // The sign-in screen is where a signed-out rider starts.
    if (state.phase === "signedOut" && state.entryRoute === "signin") return system;
    if (state.onboardingStep !== "you") return { type: "onboarding-back" };
    // From the first step a signed-out rider goes back to sign-in
    // (goBackOnboarding). One who is signed in has nowhere to go back to: the
    // way out there is "Switch account", which signs out.
    return state.phase === "signedOut" ? { type: "onboarding-back" } : system;
  }

  const onHome = state.tab === "home";
  // The ride's screen has one way out that keeps the ride, Finish, and one
  // that throws it away, the X. Back is neither: it does nothing, and the
  // ride and its clock stay on screen.
  if (onHome && state.rideActive && state.rideReady) return stay;
  if (onHome && state.recapVisible) return { type: "close-recap" };

  // Ralf opens over whichever tab asked for him.
  if (state.ralfOpen) return { type: "close-ralf" };
  // Account closes to the tab it was opened from.
  if (state.tab === "profile") return { type: "close-account" };
  if (state.tab === "assistant" && state.academyMode === "video") return { type: "academy-home" };
  if (state.tab === "gear") {
    if (state.shopMode === "sell") {
      const view = shopSellerBack[state.shopSellerView];
      if (view) return { type: "shop-seller", view };
    } else {
      const view = shopBuyerBack[state.shopBuyerView];
      if (view) return { type: "shop-buyer", view };
    }
  }
  if (state.tab === "stable" && state.stableFromAccount) return { type: "back-to-account" };

  // A tab's front page goes Home, and Home leaves the app.
  return onHome ? system : { type: "go-home" };
}
