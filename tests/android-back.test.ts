import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  androidBackAction,
  shopBuyerBack,
  shopSellerBack,
  type BackAction,
  type BackShopBuyerView,
  type BackShopSellerView,
  type BackState,
  type BackTab
} from "../src/ui/navigation/android-back";

// What Android's Back does on each screen. Nobody has run the app on Android
// when this is written, so the table is checked here state by state, and the
// last blocks check how App.tsx and app.json are wired to it.

const root = process.cwd();
const app = readFileSync(join(root, "src", "App.tsx"), "utf8");

// A signed-in rider on Home with nothing open.
const home: BackState = {
  phase: "authenticated",
  recoveryRequired: false,
  betaDoor: false,
  accountCreated: true,
  onboardingTransitioning: false,
  entryRoute: "signin",
  otpVisible: false,
  onboardingStep: "you",
  modalSheetOpen: false,
  tab: "home",
  rideActive: false,
  rideReady: false,
  recapVisible: false,
  ralfOpen: false,
  academyMode: "home",
  shopMode: "browse",
  shopBuyerView: "browse",
  shopSellerView: "dashboard",
  stableFromAccount: false
};
const signedOut: BackState = { ...home, phase: "signedOut", accountCreated: false };
const back = (patch: Partial<BackState>, from: BackState = home) => androidBackAction({ ...from, ...patch });
const system: BackAction = { type: "system" };
const stay: BackAction = { type: "stay" };

const tabs: readonly BackTab[] = ["home", "gear", "stable", "assistant", "community", "profile"];
const buyerViews = Object.keys(shopBuyerBack) as BackShopBuyerView[];
const sellerViews = Object.keys(shopSellerBack) as BackShopSellerView[];
const flags = [false, true] as const;

{
  // Home, and the front page of every other tab.
  assert.deepEqual(back({}), system, "Home is where Back leaves the app.");
  for (const tab of ["stable", "assistant", "community", "gear"] as const) {
    assert.deepEqual(back({ tab }), { type: "go-home" }, `The ${tab} tab's front page goes Home first.`);
  }
  assert.deepEqual(back({ academyMode: "video" }), system, "A lesson left open on another tab is not Home's business.");
}

{
  // Screens over the tabs.
  for (const tab of tabs) {
    assert.deepEqual(back({ tab, ralfOpen: true }), { type: "close-ralf" }, "Ralf closes back to the tab that asked for him.");
  }
  assert.deepEqual(back({ tab: "profile" }), { type: "close-account" });
  assert.deepEqual(back({ tab: "assistant", academyMode: "video" }), { type: "academy-home" });
  assert.deepEqual(back({ tab: "stable", stableFromAccount: true }), { type: "back-to-account" });
  assert.deepEqual(back({ tab: "stable", stableFromAccount: true, ralfOpen: true }), { type: "close-ralf" });
  assert.deepEqual(back({ recapVisible: true }), { type: "close-recap" });
  assert.deepEqual(back({ tab: "stable", recapVisible: true }), { type: "go-home" }, "The recap only shows on Home.");
}

{
  // The Shop's pages follow their own back arrows, and always reach the front page.
  assert.deepEqual(back({ tab: "gear", shopBuyerView: "checkout" }), { type: "shop-buyer", view: "product" });
  assert.deepEqual(back({ tab: "gear", shopMode: "sell", shopSellerView: "conversation" }), { type: "shop-seller", view: "messages" });
  assert.deepEqual(
    back({ tab: "gear", shopMode: "sell", shopBuyerView: "checkout" }),
    { type: "go-home" },
    "The buyer's page is not showing while the seller's dashboard is."
  );
  for (const [table, front] of [[shopBuyerBack, "browse"], [shopSellerBack, "dashboard"]] as const) {
    for (const start of Object.keys(table)) {
      let view: string | null = start;
      for (let steps = 0; view !== front; steps += 1) {
        assert.ok(steps < 4, `${start} never reaches ${front}.`);
        view = (table as Record<string, string | null>)[view as string] ?? null;
        assert.notEqual(view, null, `${start} has a page with no way back.`);
      }
    }
  }
  // The tables copy the arrows in GearScreen.
  const gear = app.slice(app.indexOf("function GearScreen("), app.indexOf("function ShopRouteHeader("));
  assert.ok(gear.length > 0, "GearScreen moved; check the Shop tables by hand.");
  for (const view of buyerViews) {
    if (view === "browse") continue;
    const at = gear.indexOf(`) : buyerView === "${view}"`);
    assert.ok(at > 0, `Shop buyer page ${view} is not drawn where it was.`);
    const arrow = gear.slice(at).match(/onBack=\{\(\) => onBuyerViewChange\("([a-z]+)"\)\}/)?.[1];
    assert.equal(arrow, shopBuyerBack[view], `Shop buyer page ${view}`);
  }
  for (const view of sellerViews) {
    if (view === "dashboard") continue;
    // The listing page is the last branch, with no test of its own.
    const at = gear.indexOf(view === "listing" ? "<SellerListingPage" : `) : sellerView === "${view}"`);
    assert.ok(at > 0, `Shop seller page ${view} is not drawn where it was.`);
    const arrow = gear.slice(at).match(/onBack=\{\(\) => onSellerViewChange\("([a-z]+)"\)\}/)?.[1];
    assert.equal(arrow, shopSellerBack[view], `Shop seller page ${view}`);
  }
}

{
  // A ride in progress: Back neither ends it (the X throws it away without
  // asking) nor finishes it, and the ride screen stays up.
  assert.deepEqual(back({ rideActive: true, rideReady: true }), stay);
  assert.deepEqual(back({ rideActive: true, rideReady: true, recapVisible: true, ralfOpen: true }), stay);
  assert.deepEqual(
    back({ tab: "community", rideActive: true, rideReady: true }),
    { type: "go-home" },
    "From another tab Back goes Home, which is the ride's screen again."
  );
  assert.deepEqual(back({ rideActive: true, rideReady: false }), system, "No ride screen draws without its plan and clock.");
}

{
  // Signing in and onboarding.
  assert.deepEqual(back({}, signedOut), system, "The sign-in screen is the start.");
  // "Check your inbox": Back goes to the email and the screen waits in the
  // background. Its arrow would drop it, and a new code cannot be asked for
  // within a minute.
  assert.deepEqual(back({ otpVisible: true }, signedOut), system);
  assert.deepEqual(back({ otpVisible: true, entryRoute: "create", onboardingStep: "preview" }, signedOut), system);
  assert.deepEqual(back({ entryRoute: "create", onboardingStep: "preview" }, signedOut), { type: "onboarding-back" });
  assert.deepEqual(back({ entryRoute: "create", onboardingStep: "horse" }, signedOut), { type: "onboarding-back" });
  assert.deepEqual(
    back({ entryRoute: "create", onboardingStep: "you" }, signedOut),
    { type: "onboarding-back" },
    "From the first step a signed-out rider returns to sign-in (goBackOnboarding)."
  );
  const unfinished: BackState = { ...signedOut, phase: "onboarding" };
  assert.deepEqual(back({ onboardingStep: "horse" }, unfinished), { type: "onboarding-back" });
  assert.deepEqual(
    back({ onboardingStep: "you" }, unfinished),
    system,
    "Signed in with onboarding unfinished, step one's only way out is a sign-out, which Back is not."
  );
  assert.deepEqual(back({ onboardingTransitioning: true }), stay, "The arrival takes no touches, and no Back.");
}

{
  // The screens that replace the app. Whatever was open before one came up
  // is not drawn, so it must not decide anything.
  for (const gate of [
    { phase: "restoring" },
    { phase: "recoverableError" },
    { recoveryRequired: true },
    { betaDoor: true }
  ] as Partial<BackState>[]) {
    for (const under of [home, signedOut, { ...home, tab: "profile" as const, ralfOpen: true, modalSheetOpen: true }]) {
      assert.deepEqual(androidBackAction({ ...under, ...gate }), system);
    }
  }
}

{
  // A sheet is open: the screen under it does not move.
  for (const tab of tabs) assert.deepEqual(back({ tab, modalSheetOpen: true }), stay);
}

{
  // Every state: only the listed steps, none touches the ride, and pressing
  // Back again and again always reaches Android.
  type Model = BackState & { accountReturnTab: BackTab };
  const onboardingOrder = ["you", "horse", "preview"] as const;
  // What App.tsx does for each step, as far as this table can see it.
  const press = (state: Model): Model | "system" | "stay" => {
    const action = androidBackAction(state);
    const next = ((): Model | "system" | "stay" => {
      switch (action.type) {
        case "system":
        case "stay":
          return action.type;
        case "onboarding-back": {
          const index = onboardingOrder.indexOf(state.onboardingStep);
          if (index <= 0 && state.phase === "signedOut") return { ...state, entryRoute: "signin" };
          return { ...state, onboardingStep: onboardingOrder[Math.max(index - 1, 0)] ?? "you" };
        }
        case "close-recap":
          return { ...state, recapVisible: false, tab: "home" };
        case "close-ralf":
          return { ...state, ralfOpen: false };
        case "close-account":
          return { ...state, tab: state.accountReturnTab === "profile" ? "home" : state.accountReturnTab };
        case "academy-home":
          return { ...state, academyMode: "home" };
        case "shop-buyer":
          return { ...state, shopBuyerView: action.view };
        case "shop-seller":
          return { ...state, shopSellerView: action.view };
        case "back-to-account":
          return { ...state, tab: "profile" };
        case "go-home":
          return { ...state, tab: "home", stableFromAccount: false };
      }
    })();
    // App.tsx: leaving the Horses tab forgets that it was opened from the account.
    return typeof next === "string" || next.tab === "stable" ? next : { ...next, stableFromAccount: false };
  };

  const seen = new Set<BackAction["type"]>();
  const runOut = (start: Model) => {
    let state: Model | "system" | "stay" = start;
    const onRide = start.accountCreated && start.tab === "home" && start.rideActive && start.rideReady;
    for (let presses = 1; ; presses += 1) {
      assert.ok(presses <= 8, `Back never runs out from ${JSON.stringify(start)}`);
      const before = state as Model;
      seen.add(androidBackAction(before).type);
      state = press(before);
      if (typeof state === "string") {
        if (onRide) assert.equal(state, "stay");
        return;
      }
      assert.equal(state.rideActive, start.rideActive, "No step touches the ride.");
      assert.equal(state.rideReady, start.rideReady, "No step touches the ride.");
    }
  };

  // Inside the app.
  for (const tab of tabs) for (const accountReturnTab of tabs)
  for (const rideActive of flags) for (const rideReady of flags) for (const recapVisible of flags)
  for (const ralfOpen of flags) for (const stableFromAccount of flags)
  for (const academyMode of ["home", "video"] as const) for (const shopMode of ["browse", "sell"] as const)
  for (const shopBuyerView of buyerViews) for (const shopSellerView of sellerViews) {
    runOut({
      ...home, tab, accountReturnTab, rideActive, rideReady, recapVisible, ralfOpen, stableFromAccount,
      academyMode, shopMode, shopBuyerView, shopSellerView
    });
  }
  // Before the app: every phase, signed in or not.
  for (const phase of ["restoring", "signedOut", "onboarding", "authenticated", "recoverableError", "demo"] as const)
  for (const accountCreated of flags) for (const recoveryRequired of flags) for (const betaDoor of flags)
  for (const onboardingTransitioning of flags) for (const modalSheetOpen of flags) for (const otpVisible of flags)
  for (const entryRoute of ["signin", "create"] as const) for (const onboardingStep of onboardingOrder)
  for (const tab of ["home", "profile"] as const) {
    runOut({
      ...home, phase, accountCreated, recoveryRequired, betaDoor, onboardingTransitioning, modalSheetOpen,
      otpVisible, entryRoute, onboardingStep, tab, accountReturnTab: "home"
    });
  }
  assert.deepEqual(
    [...seen].sort(),
    [
      "academy-home", "back-to-account", "close-account", "close-ralf", "close-recap",
      "go-home", "onboarding-back", "shop-buyer", "shop-seller", "stay", "system"
    ],
    "Every step is reachable, and there is no other."
  );
}

{
  // How App.tsx is wired.
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
    });
  const listeners = sourceFiles(join(root, "src")).filter((path) => readFileSync(path, "utf8").includes("BackHandler.addEventListener("));
  assert.deepEqual(listeners, [join(root, "src", "App.tsx")], "One Back listener for the whole app.");
  assert.equal(app.split("BackHandler.addEventListener(").length - 1, 1);

  const start = app.indexOf("const androidBack = useRef");
  const firstEarlyReturn = app.indexOf('if (equinaSession.phase === "restoring")');
  assert.ok(start > 0 && firstEarlyReturn > start, "The listener sits above EquinaApp's first early return, where hooks run on every render.");
  const wiring = app.slice(start, firstEarlyReturn);
  assert.match(wiring, /if \(Platform\.OS !== "android"\) return;/, "Android only: react-native-web logs an error for this call.");
  assert.match(wiring, /return \(\) => subscription\.remove\(\);\s*\}, \[\]\);/, "Registered once and removed on unmount.");
  assert.match(wiring, /catch \{[^}]*return false;/, "A failure in the listener leaves Back to Android.");
  for (const type of ["system", "stay", "onboarding-back", "close-recap", "close-ralf", "close-account", "academy-home", "shop-buyer", "shop-seller", "back-to-account", "go-home"]) {
    assert.ok(wiring.includes(`case "${type}":`), `App.tsx does not carry out "${type}".`);
  }
  // None of these can be a step back: they end or save a ride, sign out,
  // delete, or drop the code screen.
  for (const forbidden of ["cancelRide", "finishRide", "activeRide.clear", "signOut", "scheduleDeletion", "deleteJournalRide", "setOtpVisible", "setRideActive"]) {
    assert.ok(!wiring.includes(forbidden), `Back must never call ${forbidden}.`);
  }

  // The module copies two of EquinaApp's render conditions. If either
  // changes, the table has to change with it.
  assert.ok(app.includes('{tab === "home" && rideActive && ridePlan && rideRun ? ('), "The ride screen is no longer drawn the way android-back.ts assumes.");
  assert.ok(app.includes(') : tab === "home" && lastRideRecapVisible && lastRide ? ('), "The recap is no longer drawn the way android-back.ts assumes.");
}

{
  // Sheets are left to their Modals: a Modal without onRequestClose would
  // swallow Back on Android and close nothing.
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx$/.test(name) ? [path] : [];
    });
  let modals = 0;
  for (const path of sourceFiles(join(root, "src"))) {
    const source = readFileSync(path, "utf8");
    // The opening tag, arrow functions in its props included.
    for (const match of source.matchAll(/<Modal\b(?:=>|[^>])*>/g)) {
      modals += 1;
      assert.match(match[0], /onRequestClose=\{/, `${path}: a Modal without onRequestClose swallows Android's Back.`);
    }
  }
  assert.ok(modals >= 6, "The sheets were found.");
}

{
  // React Native 0.83 hears Back through the activity's onBackPressed, which
  // Android only calls while predictive back is off (enableOnBackInvokedCallback
  // false, Expo's default). Turning it on needs its own test on a device.
  const { expo } = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
    expo: { android?: { predictiveBackGestureEnabled?: boolean } };
  };
  assert.notEqual(expo.android?.predictiveBackGestureEnabled, true, "Predictive back changes how Back reaches the app.");
}

console.log("Android back passed.");
