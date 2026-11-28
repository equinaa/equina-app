import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  createHealthSettingsStore,
  defaultHealthSettings,
  healthSettingsKey,
  parseHealthSettings,
  ralfMayUseEffort,
  type HealthSettingsStorage
} from "../src/features/health/health-settings";
import {
  EQUESTRIAN_SPORTS,
  healthSourceLabel,
  kcalFrom,
  matchRideWorkout,
  ownRideWorkouts,
  primaryReadings,
  rideSyncIdentifier,
  workoutCoversRide,
  type HealthWorkout
} from "../src/features/health/health-workouts";

// Apple Health, phase 1 (2026-11-28): the rider's heart rate and calories are
// read on the iPhone for the ride's time and never stored by Equina; finished
// rides are saved to Apple Health as Equestrian Sports workouts. Every plan,
// any age; iPhone only. Ralf sees the numbers only after a yes.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const minute = 60_000;
const t0 = Date.UTC(2026, 10, 3, 20, 0, 0);
const ride = { start: t0, end: t0 + 52 * minute };
const own = "com.equina.mobile";

// --- Which workout is the ride's ------------------------------------------------------

const workout = (patch: Partial<HealthWorkout>): HealthWorkout => ({
  uuid: "w",
  start: ride.start,
  end: ride.end,
  activityType: EQUESTRIAN_SPORTS,
  bundleIdentifier: "com.apple.health.0F5A",
  sourceName: "Ana's Apple Watch",
  productType: "Watch7,1",
  ...patch
});

{
  const watch = workout({ uuid: "watch", start: t0 - 2 * minute, end: t0 + 51 * minute, kcal: 410 });
  const walk = workout({ uuid: "walk", activityType: 52, start: t0 - 40 * minute, end: t0 + 5 * minute });
  const hike = workout({ uuid: "hike", activityType: 24, start: t0 - 60 * minute, end: t0 + 120 * minute });
  const mine = workout({ uuid: "mine", bundleIdentifier: own, sourceName: "Equina", syncIdentifier: rideSyncIdentifier(new Date(t0).toISOString()) ?? undefined });

  assert.equal(matchRideWorkout([hike, watch, mine], ride, own)?.uuid, "watch", "An Equestrian Sports workout first, even with less time shared.");
  assert.equal(matchRideWorkout([mine], ride, own), null, "Equina's own copy is not the watch's.");
  assert.equal(matchRideWorkout([walk], ride, own), null, "A walk that ended five minutes in is not the ride.");
  assert.equal(matchRideWorkout([hike], ride, own)?.uuid, "hike", "Another workout covering the whole ride is its heart rate.");
  assert.equal(matchRideWorkout([watch], { start: t0, end: t0 }, own), null);
  assert.equal(workoutCoversRide(watch, ride), true, "The watch's calories are the ride's.");
  assert.equal(workoutCoversRide(hike, ride), false, "A three-hour hike's calories are not.");
  assert.deepEqual(ownRideWorkouts([watch, mine], own, mine.syncIdentifier!).map((each) => each.uuid), ["mine"]);
  assert.deepEqual(ownRideWorkouts([mine], own, "equina.ride.other"), []);
}

// One ride, one identifier, however the start is spelled.
assert.equal(rideSyncIdentifier("2026-11-03T20:00:00+00:00"), rideSyncIdentifier("2026-11-03T20:00:00.000Z"));
assert.equal(rideSyncIdentifier("2026-11-03T20:00:00.000Z"), "equina.ride.2026-11-03T20:00:00.000Z");
assert.equal(rideSyncIdentifier("not a time"), null);

// Where the numbers came from, never a person's device name.
assert.equal(healthSourceLabel({ productType: "Watch7,1", sourceName: "Ana's Apple Watch", bundleIdentifier: "com.apple.health.1" }), "Apple Watch");
assert.equal(healthSourceLabel({ deviceModel: "Watch", deviceName: "Apple Watch" }), "Apple Watch");
assert.equal(healthSourceLabel({ productType: "iPhone17,1", sourceName: "Ana’s iPhone", bundleIdentifier: "com.apple.health.2" }), "Apple Health");
assert.equal(healthSourceLabel({ sourceName: "Oura", bundleIdentifier: "com.ouraring.oura" }), "Oura");
assert.equal(healthSourceLabel({ deviceName: "Polar H10", sourceName: "Polar Beat", bundleIdentifier: "fi.polar.beat" }), "Polar H10");
assert.equal(healthSourceLabel({ deviceName: "Ana's strap", sourceName: "Ana's phone", bundleIdentifier: "com.example" }), "Apple Health");
assert.equal(healthSourceLabel({}), "Apple Health");

// Two devices worn at once are never mixed into one line.
{
  const readings = [
    { at: 1, bpm: 100, sourceKey: "watch", label: "Apple Watch" },
    { at: 2, bpm: 60, sourceKey: "ring", label: "Oura" },
    { at: 3, bpm: 60, sourceKey: "ring", label: "Oura" },
    { at: 4, bpm: 104, sourceKey: "watch", label: "Apple Watch" }
  ];
  assert.deepEqual(primaryReadings(readings, "watch"), { readings: [{ at: 1, bpm: 100 }, { at: 4, bpm: 104 }], label: "Apple Watch" });
  assert.deepEqual(primaryReadings([...readings, { at: 5, bpm: 61, sourceKey: "ring", label: "Oura" }]).label, "Oura", "Else the source with the most readings.");
  assert.deepEqual(primaryReadings(readings, "strap").readings.length, 2, "A workout without readings of its own falls back.");
  assert.deepEqual(primaryReadings([]), { readings: [] });
}

assert.equal(kcalFrom({ unit: "kcal", quantity: 410 }), 410);
assert.equal(Math.round(kcalFrom({ unit: "kJ", quantity: 4184 }) ?? 0), 1000);
assert.equal(kcalFrom({ unit: "kcal", quantity: 0 }), undefined);
assert.equal(kcalFrom({ unit: "count", quantity: 3 }), undefined);
assert.equal(kcalFrom(undefined), undefined);

// --- The rider's choices, on this phone ----------------------------------------------

{
  assert.deepEqual(defaultHealthSettings, { showEffort: true, saveRides: true, connectDismissed: false, ralfEffort: null }, "Ralf is not asked for yet.");
  assert.deepEqual(parseHealthSettings(null), defaultHealthSettings);
  assert.deepEqual(parseHealthSettings("{broken"), defaultHealthSettings);
  assert.deepEqual(parseHealthSettings("[]"), defaultHealthSettings);
  assert.deepEqual(
    parseHealthSettings(JSON.stringify({ showEffort: false, saveRides: "no", ralfEffort: "maybe", heartRate: [120, 130] })),
    { ...defaultHealthSettings, showEffort: false },
    "Unknown values fall back, and nothing but the four choices is read."
  );
  assert.equal(healthSettingsKey("rider-1"), "equina.apple-health.v1:rider-1");
  assert.equal(ralfMayUseEffort({ ...defaultHealthSettings, ralfEffort: "allowed" }, false), true);
  assert.equal(ralfMayUseEffort({ ...defaultHealthSettings, ralfEffort: "allowed" }, true), false, "Minimal context sends only the question's facts.");
  assert.equal(ralfMayUseEffort(defaultHealthSettings, false), false, "No answer is no.");
  assert.equal(ralfMayUseEffort({ ...defaultHealthSettings, ralfEffort: "declined" }, false), false);

  const items = new Map<string, string>();
  const storage: HealthSettingsStorage = {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => {
      items.set(key, value);
    }
  };
  const store = createHealthSettingsStore(storage);
  const heard: string[] = [];
  const stop = store.subscribe("rider-1", (settings) => heard.push(settings.ralfEffort ?? "unasked"));
  assert.deepEqual(await store.load("rider-1"), defaultHealthSettings);
  await store.update("rider-1", { ralfEffort: "allowed" });
  await store.update("rider-1", { saveRides: false });
  assert.deepEqual(JSON.parse(items.get(healthSettingsKey("rider-1"))!), { ...defaultHealthSettings, ralfEffort: "allowed", saveRides: false });
  assert.deepEqual(heard, ["allowed", "allowed"], "Every screen showing them hears the change.");
  assert.deepEqual(await store.load("rider-2"), defaultHealthSettings, "Per account: another rider on the same phone starts fresh.");
  stop();
  await store.update("rider-1", { ralfEffort: "declined" });
  assert.equal(heard.length, 2, "Unsubscribed.");
  assert.equal((await createHealthSettingsStore(storage).load("rider-1")).ralfEffort, "declined", "Kept across launches.");

  // Two changes at once both land.
  const together = createHealthSettingsStore(storage);
  await Promise.all([together.update("rider-3", { showEffort: false }), together.update("rider-3", { saveRides: false })]);
  assert.deepEqual(parseHealthSettings(items.get(healthSettingsKey("rider-3"))), { ...defaultHealthSettings, showEffort: false, saveRides: false });

  // No storage: the session goes on with what the rider chose.
  const failing = createHealthSettingsStore({
    getItem: async () => {
      throw new Error("no storage");
    },
    setItem: async () => {
      throw new Error("full");
    }
  });
  assert.deepEqual(await failing.load("rider-4"), defaultHealthSettings);
  assert.equal((await failing.update("rider-4", { connectDismissed: true })).connectDismissed, true);
  assert.equal((await failing.load("rider-4")).connectDismissed, true);
}

// --- The native side: iPhone only, and never a crash without it ----------------------

{
  const adapter = read("src/features/health/apple-health.ts");
  // Android and the web first; then Nitro's TurboModule, which a build from
  // before this change does not have; then each object the package creates
  // as it loads. Metro reports a failing run-time require as fatal, past any try/catch.
  assert.match(
    adapter,
    /if \(Platform\.OS !== "ios"\) return \(loaded = null\);\s+if \(!TurboModuleRegistry\.get\("NitroModules"\)\) return \(loaded = null\);\s+try \{\s+const \{ NitroModules \} = require\("react-native-nitro-modules"\) as NitroPackage;\s+if \(!HEALTHKIT_HYBRID_OBJECTS\.every\(\(name\) => NitroModules\.hasHybridObject\(name\)\)\) return \(loaded = null\);\s+loaded = require\("@kingstinct\/react-native-healthkit"\) as HealthKitPackage;\s+\} catch \{\s+loaded = null;/
  );
  const created = [...read("node_modules/@kingstinct/react-native-healthkit/src/modules.ts").matchAll(/createHybridObject<[^>]+>\(\s*'([A-Za-z]+)'/g)].map((match) => match[1]);
  const checked = [...adapter.slice(adapter.indexOf("HEALTHKIT_HYBRID_OBJECTS = ["), adapter.indexOf("] as const;")).matchAll(/"([A-Za-z]+)"/g)].map((match) => match[1]);
  assert.ok(created.length >= 10, "The package still creates its objects in src/modules.ts.");
  assert.deepEqual([...checked].sort(), [...created].sort(), "Every object the package creates on import is checked before it is required.");
  assert.match(read("node_modules/react-native-nitro-modules/src/turbomodule/NativeNitroModules.ts"), /TurboModuleRegistry\.getEnforcing<Spec>\('NitroModules'\)/, "Nitro's TurboModule is still called NitroModules.");

  // Only this file loads the native side; elsewhere it is types at most.
  const sourceFiles = (readdirSync(join(root, "src"), { recursive: true }) as string[])
    .filter((name) => /\.tsx?$/.test(name))
    .map((name) => join("src", name));
  for (const file of sourceFiles) {
    if (file === join("src", "features", "health", "apple-health.ts")) continue;
    const source = read(file);
    assert.doesNotMatch(source, /(?:from|require\()\s*["'](?:@kingstinct\/react-native-healthkit|react-native-nitro-modules|@react-native-healthkit\/core)["']/, `${file} reaches Apple Health only through apple-health.ts.`);
  }

  // Asked for in Apple's own sheet: read heart rate, active energy and workouts; save workouts. Nothing else.
  assert.match(adapter, /toRead: \[HEART_RATE, ACTIVE_ENERGY, WORKOUT\],\s+toShare: \[WORKOUT\]/);
  assert.match(adapter, /const HEART_RATE = "HKQuantityTypeIdentifierHeartRate";/);
  assert.match(adapter, /const ACTIVE_ENERGY = "HKQuantityTypeIdentifierActiveEnergyBurned";/);
  assert.match(adapter, /const WORKOUT = "HKWorkoutTypeIdentifier";/);
  // A locked iPhone cannot be read: that is not "no heart rate".
  assert.match(adapter, /if \(!healthkit\.isProtectedDataAvailable\(\)\) return null;/);
  // Saved once, as Equestrian Sports, only when allowed, never over a watch workout.
  assert.match(adapter, /authorizationStatusFor\(WORKOUT\) !== healthkit\.AuthorizationStatus\.sharingAuthorized\) return "not-allowed";/);
  assert.match(adapter, /if \(matchRideWorkout\(workouts, ride, own\)\) return "skipped";/);
  assert.match(adapter, /if \(ownRideWorkouts\(workouts, own, ride\.syncIdentifier\)\.length\) return "skipped";/);
  assert.match(adapter, /healthkit\.WorkoutActivityType\.equestrianSports,/);
  assert.match(adapter, /\{ HKMetadataKeySyncIdentifier: ride\.syncIdentifier, HKMetadataKeySyncVersion: 1 \}/);
  // The ride ends up in Fitness once: Equina's copy goes when the watch's turns up.
  assert.match(adapter, /if \(match && ride\.syncIdentifier\) \{\s+for \(const copy of ownRideWorkouts\(/);
}

// The build: the plugin without background delivery, and no Nitro on Android.
{
  const app = JSON.parse(read("app.json")) as { expo: { plugins: Array<string | [string, Record<string, unknown>]> } };
  const plugin = app.expo.plugins.find((entry) => Array.isArray(entry) && entry[0] === "@kingstinct/react-native-healthkit");
  assert.ok(Array.isArray(plugin), "The library's config plugin is in app.json.");
  assert.equal(plugin[1].background, false, "No background delivery: Equina reads only when a ride is opened.");
  const pkg = JSON.parse(read("package.json")) as {
    dependencies: Record<string, string>;
    expo?: { autolinking?: { android?: { exclude?: string[] } } };
  };
  assert.equal(pkg.dependencies["@kingstinct/react-native-healthkit"], "16.2.0");
  // The library's own build and tests use Nitro ^0.35; the pod and the JS must agree.
  assert.match(pkg.dependencies["react-native-nitro-modules"] ?? "", /^0\.35\.\d+$/);
  assert.equal(JSON.parse(read("node_modules/react-native-nitro-modules/package.json")).version, pkg.dependencies["react-native-nitro-modules"]);
  assert.ok(pkg.expo?.autolinking?.android?.exclude?.includes("react-native-nitro-modules"), "Android has no Apple Health: its build stays as it was.");
}

// --- Nothing is kept, nothing reaches the server -------------------------------------

{
  const health = (readdirSync(join(root, "src", "features", "health")) as string[]).map((name) => join("src", "features", "health", name));
  for (const file of health) {
    const source = read(file);
    if (!file.endsWith("health-settings.ts")) {
      assert.doesNotMatch(source, /AsyncStorage|SecureStore|setItem\(/, `${file} keeps no health data.`);
    }
    // Types of a journal entry, yes; the backend itself, a client or a request, no.
    assert.doesNotMatch(source, /^import (?!type )[^;]*from "[^"]*(?:backend|supabase)[^"]*"/m, `${file} sends nothing to a server.`);
    assert.doesNotMatch(source, /fetch\(|createClient|\.rpc\(|\.from\("/, `${file} sends nothing to a server.`);
    assert.doesNotMatch(source, /usePlan|PlanState|planTier|ageGate|dateOfBirth|getDateOfBirth/, `${file}: every plan, any age.`);
  }
  // The server knows nothing of it: no table, no column, no function.
  const walk = (dir: string): string[] =>
    (readdirSync(join(root, dir)) as string[]).flatMap((name) => {
      const path = join(dir, name);
      return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
    });
  for (const file of [...walk("supabase"), ...walk(join("src", "backend"))].filter((path) => /\.(ts|sql)$/.test(path))) {
    assert.doesNotMatch(read(file), /heart_rate|heartRate|active_kcal|activeKcal|apple[_ ]health|ride[_-]effort|HKQuantityType/i, `${relative(root, join(root, file))} knows nothing of Apple Health.`);
  }
  // The memory cache is a Map that ends with the app, cleared at sign-out.
  const hook = read("src/features/health/useAppleHealth.ts");
  assert.match(hook, /const remembered = new Map<string, Remembered>\(\);/);
  assert.match(read("src/App.tsx"), /await clearActiveRide\(equinaSession\.session\?\.user\.id\);\s+forgetRideEfforts\(\);/);
}

// --- What the rider sees -------------------------------------------------------------

{
  const card = read("src/features/health/RideEffortCard.tsx");
  const sheet = read("src/features/ride/RideJournalSheet.tsx");
  const account = read("src/features/account/AccountScreen.tsx");
  const app = read("src/App.tsx");

  // Apple's words: "Apple Health", never the framework's name, in anything on screen.
  for (const [name, source] of Object.entries({ card, sheet, account, effort: read("src/features/health/ride-effort.ts") })) {
    assert.doesNotMatch(source, /HealthKit/, `${name} never says HealthKit.`);
  }
  assert.match(card, /label="Connect Apple Health" onPress=\{controller\.connect\}/, "Connect opens Apple's sheet, with no copy of it before.");
  assert.match(card, /Not now/);
  assert.match(card, /Only you see this/);
  assert.match(card, /accessibilityRole="adjustable"/, "The chart is read phase by phase.");
  assert.match(card, /AccessibilityInfo\.announceForAccessibility\(state === "none" \? "No heart rate found for this ride" : "Heart rate added to this ride"\)/);
  assert.match(card, /if \(reducedMotion\) \{\s+reveal\.setValue\(1\);/, "Reduce Motion: the line is simply there.");
  assert.match(card, /accessibilityLabel=\{stat\.spoken\}/, "Each number is read with its unit spelled out.");
  assert.match(card, /\{stat\.value \?\? "—"\}/, "A missing number is a dash, never 0.");

  // The sheet: the card after the phases, Ralf asked first.
  assert.match(sheet, /<PhasesCard entry=\{entry\} comparison=\{comparison\} \/>\s+\{appleHealth \? <RideEffortCard entry=\{entry\} effort=\{effort\} horse=\{horse\} onManage=\{onManageHealth\} \/> : null\}/);
  assert.match(sheet, /const effortLine = effortShown && appleHealth && !minimalContext/);
  assert.match(sheet, /if \(appleHealth\.settings\.ralfEffort === "allowed"\) return send\(effortLine\);\s+if \(appleHealth\.settings\.ralfEffort === "declined"\) return send\(\);\s+Alert\.alert\(\s+RALF_EFFORT_CONSENT\.title,\s+RALF_EFFORT_CONSENT\.message,/);
  assert.match(sheet, /appleHealth\.update\(\{ ralfEffort: "declined" \}\);\s+send\(\);/, "Not now: the question goes, without the heart rate.");
  assert.match(sheet, /appleHealth\.update\(\{ ralfEffort: "allowed" \}\);\s+send\(effortLine\);/);
  assert.match(sheet, /withEffort\(\(line\) => \(line \? onAskRalf\(entry, rideReviewPrompt\(factsWith\(line\)\)\) : onAskRalf\(entry\)\)\);/);

  // Account › Privacy and Ralf: the three switches, and Apple's own place for access.
  assert.match(account, /title="Heart rate and calories"\s+detail=\{RALF_EFFORT_SWITCH_DETAIL\}/);
  assert.match(account, /switchValue=\{appleHealth\.settings\.ralfEffort === "allowed" && !values\.reducedPersonalization\}/);
  assert.match(account, /title="Show my effort on rides"/);
  assert.match(account, /title="Save rides to Apple Health"/);
  assert.match(account, /title="Apple Health access"/);

  // App: every signed-in rider on an iPhone that has it; saved as a timed ride finishes, never one added by hand.
  assert.match(app, /const appleHealth = useAppleHealth\(accountMode === "connected" \? equinaSession\.session\?\.user\.id : undefined\);/);
  const finish = app.slice(app.indexOf("const finishRide = "), app.indexOf("const logActivity = "));
  assert.match(finish, /if \(!ridePersistence\) \{[\s\S]*?return;\s+\}[\s\S]*if \(riderId && appleHealth\.available\) void saveFinishedRideToAppleHealth\(riderId, session\)/);
  assert.equal(app.split("saveFinishedRideToAppleHealth(").length - 1, 1, "Only Finish saves a workout.");
  assert.equal(app.split("appleHealth={appleHealth.available ? appleHealth : undefined}").length - 1, 2, "The journal and Account.");
  assert.match(app, /onManageHealth=\{\(\) => \{\s+setRideJournalOpen\(false\);\s+rideJournal\.clearError\(\);\s+openAccountAt\("privacy"\);/);
  assert.match(app, /minimalContext=\{accountController\.snapshot\.preferences\.reducedPersonalization\}/);
  const hook = read("src/features/health/useAppleHealth.ts");
  assert.match(hook, /if \(!settings\.saveRides\) return;/, "Account's switch stops saving.");
  assert.match(hook, /syncIdentifier: ride\.source === "manual" \? null : rideSyncIdentifier\(ride\.startedAt\)/);
}

console.log("Apple Health passed.");
