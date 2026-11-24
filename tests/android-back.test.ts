import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import {
  androidBackAction,
  carryOutBack,
  shopBuyerBack,
  shopSellerBack,
  type BackAction,
  type BackShopBuyerView,
  type BackShopSellerView,
  type BackState,
  type BackSteps,
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
  accountPage: false,
  academyMode: "home",
  shopMode: "browse",
  shopBuyerView: "browse",
  shopSellerView: "dashboard",
  stableFromAccount: false,
  horsePage: false
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
  // Account's pages and a horse's page go up one level, as their arrows do,
  // before Back leaves the screen.
  assert.deepEqual(back({ tab: "profile", accountPage: true }), { type: "account-root" }, "Account > Privacy goes back to the Account list.");
  assert.deepEqual(back({ tab: "profile", accountPage: true, ralfOpen: true }), { type: "close-ralf" });
  assert.deepEqual(back({ tab: "profile", accountPage: true, modalSheetOpen: true }), stay);
  assert.deepEqual(back({ tab: "stable", horsePage: true }), { type: "stable-list" }, "A horse's page goes back to the horse list.");
  assert.deepEqual(
    back({ tab: "stable", horsePage: true, stableFromAccount: true }),
    { type: "stable-list" },
    "Opened from the account, the list comes first and the account after it."
  );
  assert.deepEqual(back({ tab: "stable", horsePage: true, ralfOpen: true }), { type: "close-ralf" });
  // Each screen's page counts only while its tab is the one showing.
  assert.deepEqual(back({ accountPage: true, horsePage: true }), system);
  assert.deepEqual(back({ tab: "community", accountPage: true, horsePage: true }), { type: "go-home" });
  assert.deepEqual(back({ tab: "stable", accountPage: true }), { type: "go-home" });
  assert.deepEqual(back({ tab: "profile", horsePage: true }), { type: "close-account" });
  assert.deepEqual(back({ accountPage: true }, signedOut), system, "Nothing in the app decides Back before the account exists.");
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
        case "account-root":
          return { ...state, accountPage: false };
        case "close-account":
          return { ...state, tab: state.accountReturnTab === "profile" ? "home" : state.accountReturnTab };
        case "academy-home":
          return { ...state, academyMode: "home" };
        case "shop-buyer":
          return { ...state, shopBuyerView: action.view };
        case "shop-seller":
          return { ...state, shopSellerView: action.view };
        case "stable-list":
          return { ...state, horsePage: false };
        case "back-to-account":
          return { ...state, tab: "profile" };
        case "go-home":
          return { ...state, tab: "home", stableFromAccount: false };
      }
    })();
    if (typeof next === "string") return next;
    // App.tsx: Account and Horses are drawn only on their own tab and not
    // under Ralf, so changing tab or closing Ralf mounts them again at their
    // start, with no page up. Leaving the Horses tab also forgets that it was
    // opened from the account.
    const remounted = next.tab !== state.tab || action.type === "close-ralf";
    return {
      ...next,
      accountPage: next.tab === "profile" && !remounted && next.accountPage,
      horsePage: next.tab === "stable" && !remounted && next.horsePage,
      stableFromAccount: next.tab === "stable" && next.stableFromAccount
    };
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
  for (const accountPage of flags) for (const horsePage of flags)
  for (const academyMode of ["home", "video"] as const) for (const shopMode of ["browse", "sell"] as const)
  for (const shopBuyerView of buyerViews) for (const shopSellerView of sellerViews) {
    runOut({
      ...home, tab, accountReturnTab, rideActive, rideReady, recapVisible, ralfOpen, stableFromAccount,
      accountPage, horsePage, academyMode, shopMode, shopBuyerView, shopSellerView
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
      "academy-home", "account-root", "back-to-account", "close-account", "close-ralf", "close-recap",
      "go-home", "onboarding-back", "shop-buyer", "shop-seller", "stable-list", "stay", "system"
    ],
    "Every step is reachable, and there is no other."
  );
  // A horse's page opened from the account goes back one level at a time.
  const path: string[] = [];
  let state: Model | "system" | "stay" = { ...home, tab: "stable", stableFromAccount: true, horsePage: true, accountReturnTab: "gear" };
  while (typeof state !== "string") {
    path.push(androidBackAction(state).type);
    state = press(state);
  }
  assert.deepEqual(path, ["stable-list", "back-to-account", "close-account", "go-home", "system"]);
}

{
  // carryOutBack: each action calls its own step once, with its page, and
  // only "system" hands Back to Android.
  const actions: Record<BackAction["type"], { action: BackAction; step: keyof BackSteps | null; args: unknown[] }> = {
    system: { action: { type: "system" }, step: null, args: [] },
    stay: { action: { type: "stay" }, step: null, args: [] },
    "onboarding-back": { action: { type: "onboarding-back" }, step: "onboardingBack", args: [] },
    "close-recap": { action: { type: "close-recap" }, step: "closeRecap", args: [] },
    "close-ralf": { action: { type: "close-ralf" }, step: "closeRalf", args: [] },
    "account-root": { action: { type: "account-root" }, step: "accountRoot", args: [] },
    "close-account": { action: { type: "close-account" }, step: "closeAccount", args: [] },
    "academy-home": { action: { type: "academy-home" }, step: "academyHome", args: [] },
    "shop-buyer": { action: { type: "shop-buyer", view: "checkout" }, step: "shopBuyer", args: ["checkout"] },
    "shop-seller": { action: { type: "shop-seller", view: "messages" }, step: "shopSeller", args: ["messages"] },
    "stable-list": { action: { type: "stable-list" }, step: "stableList", args: [] },
    "back-to-account": { action: { type: "back-to-account" }, step: "backToAccount", args: [] },
    "go-home": { action: { type: "go-home" }, step: "goHome", args: [] }
  };
  for (const [type, { action, step, args }] of Object.entries(actions)) {
    const calls: unknown[][] = [];
    const spy = (name: keyof BackSteps) => (...received: unknown[]) => {
      calls.push([name, ...received]);
    };
    const steps: BackSteps = {
      onboardingBack: spy("onboardingBack"),
      closeRecap: spy("closeRecap"),
      closeRalf: spy("closeRalf"),
      accountRoot: spy("accountRoot"),
      closeAccount: spy("closeAccount"),
      academyHome: spy("academyHome"),
      shopBuyer: spy("shopBuyer"),
      shopSeller: spy("shopSeller"),
      stableList: spy("stableList"),
      backToAccount: spy("backToAccount"),
      goHome: spy("goHome")
    };
    assert.equal(carryOutBack(action, steps), type !== "system", `${type}: only "system" leaves Back to Android.`);
    assert.deepEqual(calls, step ? [[step, ...args]] : [], `${type} calls the wrong step.`);
  }
}

// The text inside the bracket that opens at `open`, quoted strings skipped.
function enclosed(source: string, open: number): string {
  const closers: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const expected: string[] = [];
  for (let index = open; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === '"' || char === "'" || char === "`") {
      index += 1;
      while (index < source.length && source.charAt(index) !== char) index += source.charAt(index) === "\\" ? 2 : 1;
    } else if (closers[char]) {
      expected.push(closers[char] ?? "");
    } else if (char === expected.at(-1)) {
      expected.pop();
      if (expected.length === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`No closing bracket for ${source.slice(open, open + 40)}`);
}

// Splits at a separator outside brackets and strings, whitespace collapsed.
function topLevel(source: string, separator: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < source.length; index += 1) {
    const char = source.charAt(index);
    if (char === '"' || char === "'" || char === "`") {
      index += 1;
      while (index < source.length && source.charAt(index) !== char) index += source.charAt(index) === "\\" ? 2 : 1;
    } else if ("({[".includes(char)) {
      depth += 1;
    } else if (")}]".includes(char)) {
      depth -= 1;
    } else if (depth === 0 && source.startsWith(separator, index)) {
      parts.push(source.slice(start, index));
      start = index + separator.length;
      index = start - 1;
    }
  }
  parts.push(source.slice(start));
  return parts.map((part) => part.replace(/\s+/g, " ").trim()).filter(Boolean);
}

// "(a && b)" and "a && b" are the same condition.
const unwrap = (condition: string) =>
  condition.startsWith("(") && enclosed(condition, 0).length === condition.length - 2 ? condition.slice(1, -1).trim() : condition;

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
  assert.match(wiring, /return androidBack\.current\(\);/, "The listener answers with what the handler returns.");
  assert.match(
    wiring,
    /if \(Platform\.OS === "android"\) \{\s*androidBack\.current = \(\) =>\s*carryOutBack\(\s*androidBackAction\(\{/,
    "Only Android builds the handler, and it returns carryOutBack's answer for androidBackAction's choice."
  );

  // What App.tsx hands the table: each value is what decides the layer it
  // draws. Change one only after checking it against EquinaApp by hand.
  const carry = wiring.indexOf("carryOutBack(");
  const [actionArgument = "", stepsArgument = "", ...extra] = topLevel(enclosed(wiring, carry + "carryOutBack".length), ",");
  assert.equal(extra.length, 0);
  assert.ok(actionArgument.startsWith("androidBackAction({"), "carryOutBack carries out androidBackAction's choice.");
  assert.ok(stepsArgument.startsWith("{"), "carryOutBack gets its steps as one object.");
  const state = topLevel(enclosed(actionArgument, actionArgument.indexOf("{")), ",");
  const sheetFlags = state.find((entry) => entry.startsWith("modalSheetOpen:"));
  assert.deepEqual(
    state.filter((entry) => entry !== sheetFlags),
    [
      "phase: equinaSession.phase",
      "recoveryRequired: equinaSession.recoveryRequired",
      "betaDoor",
      "accountCreated",
      "onboardingTransitioning",
      "entryRoute",
      "otpVisible",
      "onboardingStep",
      "tab",
      "rideActive",
      "rideReady: Boolean(ridePlan && rideRun)",
      "recapVisible: lastRideRecapVisible && Boolean(lastRide)",
      "ralfOpen",
      "accountPage: accountBackStep.current !== null",
      "academyMode",
      "shopMode",
      "shopBuyerView",
      "shopSellerView",
      "stableFromAccount",
      "horsePage: horseBackStep.current !== null"
    ],
    "App.tsx hands android-back.ts other values than the ones checked here."
  );

  // Every sheet EquinaApp draws counts as open, and nothing else does.
  const equinaAppStart = app.indexOf("function EquinaApp(");
  const equinaApp = app.slice(equinaAppStart, app.indexOf("\nfunction ", equinaAppStart + 1));
  const sheets = [...equinaApp.matchAll(/\bvisible=\{/g)].map((match) =>
    enclosed(equinaApp, (match.index ?? 0) + "visible=".length)
  );
  assert.equal(sheets.length, 8, "EquinaApp draws a sheet more or less than before: recheck modalSheetOpen.");
  // The plan offer is drawn on a condition instead of taking visible.
  const offer = equinaApp.match(/\{([^{}?]+?) \? \(\s*<PlanOfferScreen\b/)?.[1];
  assert.ok(offer, "The plan offer is no longer drawn where it was.");
  assert.deepEqual(
    topLevel(sheetFlags?.slice("modalSheetOpen:".length) ?? "", "||").map(unwrap).sort(),
    [...sheets, offer].map((condition) => unwrap(condition.replace(/\s+/g, " ").trim())).sort(),
    "modalSheetOpen must be true exactly while one of EquinaApp's sheets is up."
  );

  // The steps, each the handler an on-screen control uses for the same move.
  assert.deepEqual(
    topLevel(enclosed(stepsArgument, 0), ","),
    [
      "onboardingBack: goBackOnboarding",
      "closeRecap: closeRideRecap",
      "closeRalf",
      "accountRoot: () => accountBackStep.current?.()",
      "closeAccount",
      'academyHome: () => navigateAcademy("home")',
      "shopBuyer: setShopBuyerView",
      "shopSeller: setShopSellerView",
      "stableList: () => horseBackStep.current?.()",
      "backToAccount",
      'goHome: () => { setStableFromAccount(false); setTab("home"); }'
    ],
    "App.tsx carries out Back with other handlers than the ones checked here."
  );
  for (const control of [
    "onBack={goBackOnboarding}",
    "onHome={closeRideRecap}",
    "onBack={closeRalf}",
    "onClose={closeAccount}",
    "onAcademyModeChange={navigateAcademy}",
    "onBuyerViewChange={setShopBuyerView}",
    "onSellerViewChange={setShopSellerView}",
    "onBackToAccount={stableFromAccount ? backToAccount : undefined}"
  ]) {
    assert.ok(app.includes(control), `No on-screen control does ${control} any more; recheck the step Back uses.`);
  }
  assert.match(
    app,
    /<TabDock[\s\S]*?onChange=\{\(next\) => \{\s*setStableFromAccount\(false\);\s*setTab\(next\);\s*\}\}/,
    "goHome is what the dock's Home does."
  );

  // Account and Horses hand up the step their arrow takes, each to its own
  // slot, and only from the props of the one screen that owns it.
  for (const [slot, reporter, screen] of [
    ["accountBackStep", "reportAccountBackStep", "AccountScreen"],
    ["horseBackStep", "reportHorseBackStep", "StableScreen"]
  ] as const) {
    assert.ok(wiring.includes(`const ${slot} = useRef<(() => void) | null>(null);`), `${slot} is not where the listener can read it.`);
    assert.match(
      wiring,
      new RegExp(`const ${reporter} = useCallback\\(\\(step: \\(\\(\\) => void\\) \\| null\\) => \\{\\s*${slot}\\.current = step;\\s*\\}, \\[\\]\\);`),
      `${reporter} must only store the step, and keep one identity so the screen's effect does not run on every render.`
    );
    const element = equinaApp.indexOf(`<${screen}\n`);
    assert.ok(element > 0, `EquinaApp no longer draws ${screen}.`);
    const props = equinaApp.slice(element, equinaApp.indexOf("/>", element));
    assert.ok(props.includes(`onBackStep={${reporter}}`), `${screen} must report to ${slot}.`);
    assert.equal(app.split(`onBackStep={${reporter}}`).length - 1, 1, `${reporter} is handed to one screen only.`);
  }

  // AccountScreen: the arrow and Back take the same step, from the same test.
  const account = readFileSync(join(root, "src", "features", "account", "AccountScreen.tsx"), "utf8");
  assert.ok(account.includes('const backToList = route !== "root" && route !== initialRoute;'), "Account's pages are no longer told apart the same way.");
  assert.match(
    account,
    /useEffect\(\(\) => \{\s*if \(!onBackStep\) return;\s*onBackStep\(backToList \? \(\) => navigate\("root"\) : null\);\s*return \(\) => onBackStep\(null\);\s*\}, \[backToList, onBackStep\]\);/,
    "Account hands up the arrow's step to the list while it applies, and takes it back on unmount."
  );
  assert.ok(account.includes('{route !== "root" ? (\n        <AccountRouteHeader'), "Account's arrow is drawn on its pages only.");
  assert.ok(account.includes('onBack={() => (backToList ? navigate("root") : onClose())}'), "Account's arrow takes another step than Back.");

  // StableScreen: same for a horse's page, decided above its early returns
  // (hooks after them would run on some renders only).
  const stableStart = app.indexOf("function StableScreen(");
  const stable = app.slice(stableStart, app.indexOf("\nfunction ", stableStart + 1));
  const drawn = 'const horsePageDrawn = connected && !(loading && !loaded) && resolvedHasHorse && stableMode === "profile";';
  const earlyReturns = [
    "if (connected && loading && !loaded) {",
    "if (!resolvedHasHorse) {",
    'if (connected && stableMode === "list") {'
  ];
  const effect = stable.search(
    /useEffect\(\(\) => \{\s*if \(!onBackStep\) return;\s*onBackStep\(horsePageDrawn \? backToHorseList : null\);\s*return \(\) => onBackStep\(null\);\s*\}, \[horsePageDrawn, onBackStep\]\);/
  );
  assert.ok(stable.includes(drawn), "The horse page is no longer told apart the same way: recheck it against StableScreen's early returns.");
  assert.ok(stable.includes('const backToHorseList = () => setStableMode("list");'));
  assert.ok(effect > 0, "StableScreen hands up the arrow's step while a horse's page is drawn, and takes it back on unmount.");
  let lastReturn = effect;
  for (const early of earlyReturns) {
    const at = stable.indexOf(early);
    assert.ok(at > lastReturn, `StableScreen's early returns moved (${early}): recheck horsePageDrawn and keep the effect above them.`);
    lastReturn = at;
  }
  assert.match(stable, /testID="stable-back"[\s\S]{0,200}onPress=\{backToHorseList\}/, "The horse page's arrow takes another step than Back.");

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
