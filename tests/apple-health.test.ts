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
  APPLE_HEALTH_SOURCE,
  coveringRideWorkout,
  EQUESTRIAN_SPORTS,
  healthSourceLabel,
  kcalFrom,
  matchRideWorkout,
  ownRideWorkouts,
  primaryReadings,
  rideSyncIdentifier,
  sourceChipSpoken,
  workoutCoversRide,
  workoutIsRide,
  type HealthWorkout
} from "../src/features/health/health-workouts";
import {
  createSavedRideWorkoutsStore,
  MAX_SAVED_RIDE_WORKOUTS,
  MISSED_RIDE_KEEP_MS,
  missedRideWorkoutsKey,
  parseSavedRideWorkouts,
  RIDE_ENTRY_HARD_LIMIT,
  SAVED_RIDE_CHECK_MS,
  savedRideStillChecked,
  savedRideWorkoutsKey,
  tidySavedRideWorkouts,
  withSavedRideWorkout,
  type SavedRideCheck,
  type SavedRideWorkout,
  type SavedRideWorkoutsStorage
} from "../src/features/health/saved-ride-workouts";

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
  assert.equal(coveringRideWorkout([hike, watch, mine], ride, own)?.uuid, "watch", "The watch's workout is the ride.");
  assert.equal(coveringRideWorkout([hike, mine], ride, own), null, "A hike around the ride is not: Equina's copy stays.");
}

// The overlap is measured against the ride, not the shorter of the two.
{
  const hour = { start: Date.UTC(2026, 10, 3, 18, 0, 0), end: Date.UTC(2026, 10, 3, 19, 0, 0) };
  const at = (hh: number, mm: number) => Date.UTC(2026, 10, 3, hh, mm, 0);
  // An Outdoor Walk from 17:55 to 18:10 shares ten minutes of a sixty-minute
  // ride. Taken for it, the ride was not saved, Equina's copy was deleted and
  // only the walk's readings were read.
  const walk = workout({ uuid: "walk", activityType: 52, start: at(17, 55), end: at(18, 10) });
  assert.equal(matchRideWorkout([walk], hour, own), null, "A walk inside a ride is not the ride.");
  assert.equal(coveringRideWorkout([walk], hour, own), null);
  // A six-minute "Other" workout started by mistake halfway through.
  const other = workout({ uuid: "other", activityType: 3000, start: at(18, 30), end: at(18, 36) });
  assert.equal(matchRideWorkout([other], hour, own), null, "Six minutes of a sixty-minute ride is not the ride.");
  assert.equal(matchRideWorkout([walk, other], hour, own), null);
  // A watch started twenty minutes late still matches (its readings are
  // the rider's), but it is not the ride: Equina's copy stays and is saved.
  const late = workout({ uuid: "late", start: at(18, 20), end: at(19, 0) });
  assert.equal(matchRideWorkout([late], hour, own)?.uuid, "late");
  assert.equal(workoutCoversRide(late, hour), false);
  assert.equal(coveringRideWorkout([late], hour, own), null, "Two workouts in Fitness rather than none for the ride.");
  // Half the ride is the line.
  assert.equal(matchRideWorkout([workout({ uuid: "half", start: at(18, 30), end: at(19, 5) })], hour, own)?.uuid, "half");
  assert.equal(matchRideWorkout([workout({ uuid: "less", start: at(18, 31), end: at(19, 5) })], hour, own), null);
  // One watch workout over two rides back to back still stands for each.
  const both = workout({ uuid: "both", start: at(17, 58), end: at(20, 2) });
  const second = { start: at(19, 0), end: at(20, 0) };
  assert.equal(matchRideWorkout([both], hour, own)?.uuid, "both");
  assert.equal(matchRideWorkout([both], second, own)?.uuid, "both");
  // The watch's own, the ride itself: Equina's copy goes.
  const watch = workout({ uuid: "watch", start: at(17, 59), end: at(19, 1) });
  assert.equal(coveringRideWorkout([walk, other, watch], hour, own)?.uuid, "watch");
  // A watch over two rides back to back is neither: both copies stay.
  assert.equal(workoutIsRide(both, hour), false);
  assert.equal(coveringRideWorkout([both], hour, own), null);
  assert.equal(coveringRideWorkout([both], second, own), null);
}

// A short ride with the watch started while mounting and stopped after
// dismounting: the watch's workout holds the whole ride, so it is the ride,
// and Fitness lists it once. Its calories, with the tack-up minutes, are not
// the ride's: Equina's own sum over the ride stays the card's.
{
  const at = (hh: number, mm: number) => Date.UTC(2026, 10, 3, hh, mm, 0);
  const short = { start: at(10, 0), end: at(10, 30) };
  const mounted = workout({ uuid: "mounted", start: at(9, 55), end: at(10, 33) });
  assert.equal(workoutCoversRide(mounted, short), false, "Its calories are not the ride's.");
  assert.equal(workoutIsRide(mounted, short), true);
  assert.equal(coveringRideWorkout([mounted], short, own)?.uuid, "mounted", "Equina's copy goes.");
  // Half an hour around a half-hour ride is a session, not the ride.
  assert.equal(workoutIsRide(workout({ start: at(9, 40), end: at(10, 45) }), short), false);
  // An all-day show workout.
  assert.equal(workoutIsRide(workout({ start: at(8, 0), end: at(17, 0) }), short), false);
  // Any other type over the ride never replaces it: Fitness keeps it as a ride.
  for (const activityType of [3000, 52]) {
    const exact = workout({ uuid: `type-${activityType}`, activityType, start: at(10, 0), end: at(10, 30) });
    assert.equal(workoutIsRide(exact, short), false);
    assert.equal(coveringRideWorkout([exact], short, own), null, `${activityType} leaves Equina's copy.`);
    // Its readings and calories still stand for the ride on the card.
    assert.equal(matchRideWorkout([exact], short, own)?.uuid, `type-${activityType}`);
    assert.equal(workoutCoversRide(exact, short), true);
  }
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
assert.equal(APPLE_HEALTH_SOURCE, "Apple Health");
// The chip as VoiceOver reads it: never "From Apple Health, through Apple Health".
assert.equal(sourceChipSpoken("Apple Watch"), "From Apple Watch, through Apple Health");
assert.equal(sourceChipSpoken(APPLE_HEALTH_SOURCE), "From Apple Health");

// Two devices worn at once are never mixed into one line.
{
  const readings = [
    { at: 1, bpm: 100, sourceKey: "watch", label: "Apple Watch" },
    { at: 2, bpm: 60, sourceKey: "ring", label: "Oura" },
    { at: 3, bpm: 60, sourceKey: "ring", label: "Oura" },
    { at: 4, bpm: 104, sourceKey: "watch", label: "Apple Watch" }
  ];
  assert.deepEqual(primaryReadings(readings, "watch"), { readings: [{ at: 1, bpm: 100 }, { at: 4, bpm: 104 }], label: "Apple Watch", sourceKey: "watch" });
  assert.deepEqual(primaryReadings([...readings, { at: 5, bpm: 61, sourceKey: "ring", label: "Oura" }]).label, "Oura", "Else the source with the most readings.");
  assert.deepEqual(primaryReadings(readings, "strap").readings.length, 2, "A workout without readings of its own falls back.");
  assert.equal(primaryReadings(readings, "strap").sourceKey, "watch", "And says which source it fell back to.");
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
  assert.match(adapter, /if \(coveringRideWorkout\(workouts, ride, own\)\) return "skipped";/, "Skipped only for a workout that is the ride.");
  assert.doesNotMatch(adapter, /if \(matchRideWorkout\(workouts, ride, own\)\) return "skipped";/);
  assert.match(adapter, /if \(ownRideWorkouts\(workouts, own, ride\.syncIdentifier\)\.length\) return "skipped";/);
  assert.match(adapter, /healthkit\.WorkoutActivityType\.equestrianSports,/);
  assert.match(adapter, /\{ HKMetadataKeySyncIdentifier: ride\.syncIdentifier, HKMetadataKeySyncVersion: 1 \}/);
  // The ride ends up in Fitness once: Equina's copy goes when the watch's
  // turns up, and only when that workout is the ride itself.
  assert.match(adapter, /const covers = match !== null && workoutCoversRide\(match, ride\);/);
  assert.match(adapter, /const isRide = match !== null && workoutIsRide\(match, ride\);/);
  // Only another app's Equestrian Sports workout that is the ride removes Equina's copy.
  assert.match(adapter, /if \(isRide && ride\.syncIdentifier\) \{\s+for \(const copy of ownRideWorkouts\(/);
  assert.doesNotMatch(adapter, /if \(covers && ride\.syncIdentifier\)/);
  // Its own readings only then; otherwise every reading in the ride's time.
  assert.match(adapter, /const matchProxy = match && \(covers \|\| isRide\) \? workouts\.find\(/);
  // The chip names the source of what is shown: the heart rate's, the
  // workout's app for calories alone, Apple Health for a mix.
  assert.match(adapter, /const fromWorkout = Boolean\(match && picked\.sourceKey === match\.bundleIdentifier\);/);
  assert.match(adapter, /const sourceLabel = picked\.readings\.length\s+\? fromWorkout \|\| kcalSource === undefined\s+\? picked\.label\s+: APPLE_HEALTH_SOURCE\s+: kcalSource;/);
  assert.doesNotMatch(adapter, /const sourceLabel = match \? healthSourceLabel\(match\)/);
  // Saving: Apple tells whether it may, unlike reading.
  assert.match(adapter, /if \(status === healthkit\.AuthorizationStatus\.sharingAuthorized\) return "allowed";\s+if \(status === healthkit\.AuthorizationStatus\.sharingDenied\) return "denied";\s+return "not-asked";/);
  assert.match(adapter, /let samples = matchProxy \? await query\(\{ workout: matchProxy \}\) : \[\];\s+if \(!samples\.length\) samples = await query\(around\);/);
  // The clean-up without the card: locked is "later", and only a workout
  // that is the ride removes the copy.
  const removal = adapter.slice(adapter.indexOf("export const removeRideCopyIfCovered"));
  assert.match(removal, /if \(!healthkit\.isProtectedDataAvailable\(\)\) return "unreadable";/);
  assert.match(removal, /if \(!coveringRideWorkout\(workouts, ride, own\)\) return "kept";\s+for \(const copy of ownRideWorkouts\(workouts, own, ride\.syncIdentifier\)\) \{\s+await healthkit\.deleteObjects\(WORKOUT, \{ uuid: copy\.uuid \}\);/);
}

// --- Equina's copy goes without the card ---------------------------------------------

{
  const now = Date.UTC(2026, 10, 3, 21, 0, 0);
  const saved = (minutesAgo: number, patch: Partial<SavedRideWorkout> = {}): SavedRideWorkout => ({
    syncIdentifier: `equina.ride.${new Date(now - minutesAgo * minute - 60 * minute).toISOString()}`,
    start: now - minutesAgo * minute - 60 * minute,
    end: now - minutesAgo * minute,
    savedAt: now - minutesAgo * minute,
    ...patch
  });

  // Ride times only: anything else in storage is not read back.
  const fresh = saved(5);
  assert.deepEqual(parseSavedRideWorkouts(JSON.stringify([{ ...fresh, heartRate: [120], kcal: 310 }])), [fresh]);
  assert.deepEqual(Object.keys(parseSavedRideWorkouts(JSON.stringify([fresh]))[0] ?? {}).sort(), ["end", "savedAt", "start", "syncIdentifier"]);
  assert.deepEqual(parseSavedRideWorkouts(null), []);
  assert.deepEqual(parseSavedRideWorkouts("{broken"), []);
  assert.deepEqual(parseSavedRideWorkouts(JSON.stringify({ fresh })), []);
  assert.deepEqual(
    parseSavedRideWorkouts(JSON.stringify([{ ...fresh, syncIdentifier: "other.app" }, { ...fresh, end: fresh.start }, { ...fresh, savedAt: "now" }, fresh])),
    [fresh],
    "An entry that cannot be trusted is dropped, not the rest."
  );
  assert.equal(savedRideWorkoutsKey("rider-1"), "equina.apple-health-saved-rides.v1:rider-1");

  // The same ride saved twice is one entry; the list never grows past its cap.
  assert.deepEqual(withSavedRideWorkout([fresh], { ...fresh, savedAt: now }), [{ ...fresh, savedAt: now }]);
  let many: SavedRideWorkout[] = [];
  for (let index = 0; index < MAX_SAVED_RIDE_WORKOUTS + 5; index += 1) many = withSavedRideWorkout(many, saved(index));
  assert.equal(many.length, MAX_SAVED_RIDE_WORKOUTS);
  assert.equal(many[many.length - 1]?.savedAt, saved(MAX_SAVED_RIDE_WORKOUTS + 4).savedAt, "Newest last.");

  // A day, and no more; a save stamped in the future does not live forever.
  assert.equal(savedRideStillChecked(saved(60), now), true);
  assert.equal(savedRideStillChecked(saved(SAVED_RIDE_CHECK_MS / minute), now), false);
  assert.equal(savedRideStillChecked(saved(-2 * 24 * 60), now), false);
  assert.equal(SAVED_RIDE_CHECK_MS, 24 * 60 * minute);

  // One pass: removed goes, still alone stays, and once the iPhone is
  // locked the rest wait without being asked. A ride over a day old is
  // looked at once more, the first time the app can (the watch may have
  // synced while it was away), and goes whatever it finds.
  {
    const removed = saved(30, { syncIdentifier: "equina.ride.removed" });
    const alone = saved(20, { syncIdentifier: "equina.ride.alone" });
    const old = saved(25 * 60, { syncIdentifier: "equina.ride.old" });
    const asked: string[] = [];
    const answers: Record<string, SavedRideCheck> = { "equina.ride.removed": "removed", "equina.ride.alone": "kept", "equina.ride.old": "kept" };
    const next = await tidySavedRideWorkouts([removed, old, alone], now, async (entry) => {
      asked.push(entry.syncIdentifier);
      return answers[entry.syncIdentifier] ?? "unreadable";
    });
    assert.deepEqual(next, [alone]);
    assert.deepEqual(asked, ["equina.ride.removed", "equina.ride.old", "equina.ride.alone"], "A ride over a day old is looked at once more.");
    // Saturday's ride, the app next opened on Monday: the watch's workout is there, and Equina's copy goes.
    const monday = await tidySavedRideWorkouts([old], now, async () => "removed");
    assert.deepEqual(monday, []);

    const lockedAsked: string[] = [];
    const locked = await tidySavedRideWorkouts([removed, alone, old], now, async (entry) => {
      lockedAsked.push(entry.syncIdentifier);
      return "unreadable";
    });
    assert.deepEqual(locked, [removed, alone, old], "Locked: all wait for the next pass, the old one too.");
    assert.deepEqual(lockedAsked, ["equina.ride.removed"], "Asked once, then the rest wait.");
    // One that can never be read goes in the end.
    const ancient = saved(RIDE_ENTRY_HARD_LIMIT * 24 * 60, { syncIdentifier: "equina.ride.ancient" });
    assert.deepEqual(await tidySavedRideWorkouts([ancient], now, async () => "unreadable"), [], "Past the hard limit, dropped unchecked.");
    const failing = await tidySavedRideWorkouts([alone], now, async () => {
      throw new Error("Apple Health");
    });
    assert.deepEqual(failing, [alone], "A failed check is a later check.");
  }

  // The store: per account, one change at a time, nothing asked for an empty list.
  {
    const items = new Map<string, string>();
    const storage: SavedRideWorkoutsStorage = {
      getItem: async (key) => items.get(key) ?? null,
      setItem: async (key, value) => {
        items.set(key, value);
      },
      removeItem: async (key) => {
        items.delete(key);
      }
    };
    const store = createSavedRideWorkoutsStore(storage);
    let checks = 0;
    const check = async (): Promise<SavedRideCheck> => {
      checks += 1;
      return "removed";
    };
    assert.deepEqual(await store.tidy("rider-1", now, check), []);
    assert.equal(checks, 0, "No saved ride, no question to Apple Health.");

    const first = saved(10, { syncIdentifier: "equina.ride.first" });
    const second = saved(5, { syncIdentifier: "equina.ride.second" });
    await Promise.all([store.add("rider-1", first), store.add("rider-1", second)]);
    assert.deepEqual(await store.list("rider-1"), [first, second], "Two rides saved together are both kept.");
    assert.deepEqual(await store.list("rider-2"), [], "Per account.");
    assert.deepEqual(JSON.parse(items.get(savedRideWorkoutsKey("rider-1"))!), [first, second]);

    const kept = await store.tidy("rider-1", now, async (entry) => (entry.syncIdentifier === "equina.ride.first" ? "removed" : "kept"));
    assert.deepEqual(kept, [second]);
    assert.deepEqual(await store.list("rider-1"), [second]);
    await store.tidy("rider-1", now + SAVED_RIDE_CHECK_MS, check);
    assert.equal(items.has(savedRideWorkoutsKey("rider-1")), false, "After a day the list is gone from the phone.");

    const broken = createSavedRideWorkoutsStore({
      getItem: async () => {
        throw new Error("no storage");
      },
      setItem: async () => {
        throw new Error("full");
      },
      removeItem: async () => {
        throw new Error("full");
      }
    });
    await broken.add("rider-3", first);
    assert.deepEqual(await broken.tidy("rider-3", now, check), [], "No storage: nothing breaks.");
  }

  // The rides Apple Health did not let Equina save: the same list, a week long, its own key.
  {
    assert.equal(missedRideWorkoutsKey("rider-1"), "equina.apple-health-missed-rides.v1:rider-1");
    assert.equal(MISSED_RIDE_KEEP_MS, 7 * 24 * 60 * minute);
    const items = new Map<string, string>();
    const store = createSavedRideWorkoutsStore(
      {
        getItem: async (key) => items.get(key) ?? null,
        setItem: async (key, value) => {
          items.set(key, value);
        },
        removeItem: async (key) => {
          items.delete(key);
        }
      },
      { keyOf: missedRideWorkoutsKey, checkFor: MISSED_RIDE_KEEP_MS }
    );
    const first = saved(3 * 24 * 60, { syncIdentifier: "equina.ride.first" });
    await store.add("rider-1", first);
    assert.equal(items.has(missedRideWorkoutsKey("rider-1")), true);
    assert.equal(items.has(savedRideWorkoutsKey("rider-1")), false, "Its own key.");
    assert.deepEqual(await store.tidy("rider-1", now, async () => "kept"), [first], "Three days old: still waiting.");
    assert.deepEqual(await store.tidy("rider-1", now, async () => "removed"), [], "Saved: gone.");
  }

  // Wired in: kept as a ride is saved, looked at on open and on each return
  // to the front, only while Apple Health can be read.
  const hook = read("src/features/health/useAppleHealth.ts");
  assert.match(hook, /const saved = await saveRideWorkout\(\{ start, end, syncIdentifier \}\);\s+[\s\S]*?if \(saved === "saved"\) await savedRideWorkouts\.add\(userId, \{ syncIdentifier, start, end, savedAt: Date\.now\(\) \}\);/);
  assert.match(
    hook,
    /if \(!userId \|\| !available\) return;\s+const tidy = \(\) => \{\s+setSavingStatus\(rideSavingStatus\(\)\);\s+void tidyRideCopies\(userId\)\.catch\(\(\) => undefined\);\s+void saveMissedRides\(userId\)\.catch\(\(\) => undefined\);\s+\};\s+tidy\(\);\s+const subscription = AppState\.addEventListener\("change", \(state\) => \{\s+if \(state === "active"\) tidy\(\);/
  );
  // A ride Apple Health did not let Equina save is kept, and saved once it does: after Connect, and on each return.
  assert.match(hook, /if \(saved === "not-allowed"\) await missedRideWorkouts\.add\(userId, \{ syncIdentifier, start, end, savedAt: Date\.now\(\) \}\);/);
  assert.match(hook, /const connect = useCallback\(async \(\) => \{\s+await connectAppleHealth\(\);\s+if \(!available\) return;\s+setSavingStatus\(rideSavingStatus\(\)\);\s+if \(userId\) await saveMissedRides\(userId\)/);
  assert.match(hook, /if \(!settings\.saveRides\) return "removed";\s+const saved = await saveRideWorkout\(entry\);/, "Account's switch off: the missed rides are not saved.");
  assert.match(hook, /void \(health \? health\.connect\(\) : connectAppleHealth\(\)\)\.then/, "The card's Connect saves them too.");
  // Without this phone's timeline, the whole ride counts.
  assert.match(hook, /summarizeRideEffort\(reading, \{ start, end \}, placed, \{ exact: Boolean\(timeline\) \}\)/);
  assert.match(hook, /export const tidyRideCopies = async \(userId: string\) => \{\s+if \(!appleHealthReadable\(\)\) return;\s+await savedRideWorkouts\.tidy\(userId, Date\.now\(\), removeRideCopyIfCovered\);/);
  // Independent of the card: not behind Show my effort or Save rides.
  const tidyEffect = hook.slice(hook.indexOf("const tidy = () =>"), hook.indexOf("const connect = useCallback(async"));
  assert.ok(tidyEffect.length > 100);
  assert.doesNotMatch(tidyEffect, /showEffort|saveRides|connectDismissed/);
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
    // The rider's choices, and the times of rides saved in the last day
    // (their four fields are checked above): never a number from Apple Health.
    if (!file.endsWith("health-settings.ts") && !file.endsWith("saved-ride-workouts.ts")) {
      assert.doesNotMatch(source, /AsyncStorage|SecureStore|setItem\(/, `${file} keeps no health data.`);
    }
    // Types of a journal entry, yes; the backend itself, a client or a request, no.
    assert.doesNotMatch(source, /^import (?!type )[^;]*from "[^"]*(?:backend|supabase)[^"]*"/m, `${file} sends nothing to a server.`);
    assert.doesNotMatch(source, /fetch\(|createClient|\.rpc\(|\.from\("/, `${file} sends nothing to a server.`);
    assert.doesNotMatch(source, /usePlan|PlanState|planTier|ageGate|dateOfBirth|getDateOfBirth/, `${file}: every plan, any age.`);
  }
  // The server stores nothing of it: no table, no column, no function. The
  // one exception is the line the rider allows to go with a question, which
  // coach-chat hands to the model and saves nowhere (tests/coach-ride-effort.test.ts).
  const walk = (dir: string): string[] =>
    (readdirSync(join(root, dir)) as string[]).flatMap((name) => {
      const path = join(dir, name);
      return statSync(join(root, path)).isDirectory() ? walk(path) : [path];
    });
  const toTheModel = [join("supabase", "functions", "coach-chat", "index.ts"), join("supabase", "functions", "_shared", "coach-provider-input.ts")];
  for (const file of [...walk("supabase"), ...walk(join("src", "backend"))].filter((path) => /\.(ts|sql)$/.test(path))) {
    if (toTheModel.includes(file)) continue;
    assert.doesNotMatch(read(file), /heart_rate|heartRate|active_kcal|activeKcal|apple[_ ]health|ride[_-]effort|HKQuantityType/i, `${relative(root, join(root, file))} knows nothing of Apple Health.`);
  }
  for (const file of toTheModel) {
    assert.doesNotMatch(read(file), /heart_rate|heartRate|active_kcal|activeKcal|apple[_ ]health|HKQuantityType/i, `${file} names no health type or column.`);
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
  // VoiceOver says what the card says: its own title when there is nothing,
  // else what was added, calories alone included.
  assert.match(card, /\? noEffortMessage\(\{ window: shown\.window, manual, now: Date\.now\(\) \}\)\.title\s+: `\$\{capitalized\(effortWords\(shown\)\)\} added to this ride`;/);
  assert.match(card, /AccessibilityInfo\.announceForAccessibility\(spokenNow\);/);
  assert.match(card, /accessibilityLabel=\{sourceChipSpoken\(effort\.sourceLabel\)\}/);
  // "Only you" says Ralf gets it too once the rider allowed it, the same rule as what is sent.
  assert.match(card, /ralfGetsEffort \? "Only you see this\. Ralf gets it when you ask about a ride\." : "Only you see this"/);
  assert.match(card, /ralfGetsEffort \? "Only you see it\. Ralf gets it when you ask about a ride\." : "Only you see it, on this iPhone\."/);
  assert.match(sheet, /const ralfGetsEffort = Boolean\(appleHealth && ralfMayUseEffort\(appleHealth\.settings, minimalContext\)\);/);
  assert.match(card, /if \(reducedMotion\) \{\s+reveal\.setValue\(1\);/, "Reduce Motion: the line is simply there.");
  assert.match(card, /accessibilityLabel=\{stat\.spoken\}/, "Each number is read with its unit spelled out.");
  assert.match(card, /\{stat\.value \?\? "—"\}/, "A missing number is a dash, never 0.");

  // The sheet: the card after the phases, Ralf asked first.
  assert.match(sheet, /<PhasesCard entry=\{entry\} comparison=\{comparison\} \/>\s+\{appleHealth \? \(\s+<RideEffortCard entry=\{entry\} effort=\{effort\} horse=\{horse\} onManage=\{onManageHealth\} ralfGetsEffort=\{ralfGetsEffort\} \/>\s+\) : null\}/);
  assert.match(sheet, /const effortLine = effortShown && appleHealth && !minimalContext/);
  assert.match(sheet, /if \(appleHealth\.settings\.ralfEffort === "allowed"\) return send\(effortLine\);\s+if \(appleHealth\.settings\.ralfEffort === "declined"\) return send\(\);\s+Alert\.alert\(\s+RALF_EFFORT_CONSENT\.title,\s+RALF_EFFORT_CONSENT\.message,/);
  assert.match(sheet, /text: RALF_EFFORT_CONSENT\.decline,\s+style: "cancel",\s+onPress: \(\) => \{\s+appleHealth\.update\(\{ ralfEffort: "declined" \}\);\s+send\(\);/, "Don't allow: the question goes, without the heart rate.");
  // Only this ride's numbers go, and only what the line holds is named.
  assert.match(sheet, /`Ralf gets this ride with your \$\{effortSent\}, and \$\{lastRidesPhrase\(shownScope, words, compared\.baseline\.length\)\}\.`/);
  assert.match(sheet, /`What went well, and the one thing to work on next time\. Ralf gets your \$\{effortSent\} too\.`/);
  assert.doesNotMatch(sheet, /, with your heart rate and calories/);
  assert.match(sheet, /appleHealth\.update\(\{ ralfEffort: "allowed" \}\);\s+send\(effortLine\);/);
  // The line goes beside the question, never inside it (tests/coach-ride-effort.test.ts).
  assert.match(sheet, /withEffort\(\(line\) => onAskRalf\(entry, undefined, rideEffortForRalf\(line\)\)\);/);

  // Account › Privacy and Ralf: the three switches, and Apple's own place for access.
  assert.match(account, /title="Heart rate and calories"\s+detail=\{RALF_EFFORT_SWITCH_DETAIL\}/);
  assert.match(account, /switchValue=\{appleHealth\.settings\.ralfEffort === "allowed" && !values\.reducedPersonalization\}/);
  assert.match(account, /title="Show my effort on rides"/);
  // On only while the card can appear: after "Not now" it reads off, and one tap brings the card back.
  assert.match(
    account,
    /switchValue=\{appleHealth\.settings\.showEffort && !appleHealth\.settings\.connectDismissed\}\s+onToggle=\{\(showEffort\) => appleHealth\.update\(\{ showEffort, \.\.\.\(showEffort \? \{ connectDismissed: false \} : \{\}\) \}\)\}/
  );
  assert.match(card, /accessibilityHint="Hides this for good\. You can still turn it on in Account\."/);
  assert.match(account, /title="Save rides to Apple Health"/);
  // On only when it works: Apple Health allows saving and the rider has not turned it off.
  assert.match(account, /switchValue=\{appleHealth\.settings\.saveRides && appleHealth\.savingStatus === "allowed"\}/);
  assert.match(account, /if \(appleHealth\.savingStatus === "denied"\) return void Linking\.openURL\("x-apple-health:\/\/"\)/, "Refused: only the Health app changes it.");
  assert.match(account, /appleHealth\.update\(\{ saveRides: true \}\);\s+if \(appleHealth\.savingStatus !== "allowed"\) void appleHealth\.connect\(\);/, "Never asked: turning it on asks Apple.");
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
