import { Platform, TurboModuleRegistry } from "react-native";
import {
  healthSourceLabel,
  kcalFrom,
  matchRideWorkout,
  ownRideWorkouts,
  primaryReadings,
  workoutCoversRide,
  type HealthWorkout
} from "./health-workouts";
import { READING_REACH_MS, type RideEffortReading } from "./ride-effort";

/**
 * Apple Health, on the iPhone only: read a ride's heart rate and active
 * energy, and save a finished ride as an Equestrian Sports workout. What is
 * read is returned to the caller and never stored or sent anywhere.
 *
 * Android and the web have no Apple Health, and a build made before the
 * library was added has no native side for it: in all of them every call
 * here reports "not available" and the feature is not shown.
 */

type HealthKitPackage = typeof import("@kingstinct/react-native-healthkit");
type NitroPackage = typeof import("react-native-nitro-modules");
type WorkoutProxy = Awaited<ReturnType<HealthKitPackage["queryWorkoutSamples"]>>[number];

/**
 * Every native object the package creates as it is imported (its
 * src/modules.ts). Creating one that is missing throws while the module
 * loads, so each is checked first (tests/apple-health.test.ts keeps this
 * list in step with the package).
 */
export const HEALTHKIT_HYBRID_OBJECTS = [
  "CoreModule",
  "MedicationModule",
  "WorkoutsModule",
  "CharacteristicTypeModule",
  "QuantityTypeModule",
  "CategoryTypeModule",
  "CorrelationTypeModule",
  "ElectrocardiogramModule",
  "HeartbeatSeriesModule",
  "StateOfMindModule"
] as const;

// Read once. Requiring the package without its native side is not an error
// a try/catch sees: Metro reports a module that fails to load at run time as
// fatal (a red screen in development, a closed app in a release). So the
// native side is asked for first, Nitro's TurboModule and then each object.
let loaded: HealthKitPackage | null | undefined;
const healthKit = (): HealthKitPackage | null => {
  if (loaded !== undefined) return loaded;
  if (Platform.OS !== "ios") return (loaded = null);
  if (!TurboModuleRegistry.get("NitroModules")) return (loaded = null);
  try {
    const { NitroModules } = require("react-native-nitro-modules") as NitroPackage;
    if (!HEALTHKIT_HYBRID_OBJECTS.every((name) => NitroModules.hasHybridObject(name))) return (loaded = null);
    loaded = require("@kingstinct/react-native-healthkit") as HealthKitPackage;
  } catch {
    loaded = null;
  }
  return loaded;
};

const HEART_RATE = "HKQuantityTypeIdentifierHeartRate";
const ACTIVE_ENERGY = "HKQuantityTypeIdentifierActiveEnergyBurned";
const WORKOUT = "HKWorkoutTypeIdentifier";

/**
 * Asked for in one sheet, Apple's own: read heart rate, active energy and
 * workouts; save workouts. Nothing else.
 */
const ACCESS = {
  toRead: [HEART_RATE, ACTIVE_ENERGY, WORKOUT],
  toShare: [WORKOUT]
} as const;

/** This iPhone has Apple Health and this build can reach it. */
export const appleHealthAvailable = () => {
  const healthkit = healthKit();
  if (!healthkit) return false;
  try {
    return healthkit.isHealthDataAvailable();
  } catch {
    return false;
  }
};

/**
 * Whether Apple's sheet was already shown for what Equina reads and saves.
 * What the rider chose in it is never known for reading (Apple keeps it
 * private), only that they were asked. Null when Apple Health is not available.
 */
export const appleHealthAsked = async (): Promise<boolean | null> => {
  const healthkit = healthKit();
  if (!healthkit) return null;
  try {
    return (await healthkit.getRequestStatusForAuthorization(ACCESS)) === healthkit.AuthorizationRequestStatus.unnecessary;
  } catch {
    return null;
  }
};

/** Shows Apple's sheet. True once it was answered, whatever the answer. */
export const connectAppleHealth = async () => {
  const healthkit = healthKit();
  if (!healthkit) return false;
  try {
    return await healthkit.requestAuthorization(ACCESS);
  } catch {
    return false;
  }
};

const workoutOf = (proxy: WorkoutProxy): HealthWorkout => {
  const sync = proxy.metadata?.HKMetadataKeySyncIdentifier;
  const kcal = kcalFrom(proxy.totalEnergyBurned);
  return {
    uuid: proxy.uuid,
    start: proxy.startDate.getTime(),
    end: proxy.endDate.getTime(),
    activityType: Number(proxy.workoutActivityType),
    bundleIdentifier: proxy.sourceRevision.source.bundleIdentifier,
    sourceName: proxy.sourceRevision.source.name,
    ...(proxy.sourceRevision.productType ? { productType: proxy.sourceRevision.productType } : {}),
    ...(proxy.device?.name ? { deviceName: proxy.device.name } : {}),
    ...(proxy.device?.model ? { deviceModel: proxy.device.model } : {}),
    ...(kcal !== undefined ? { kcal } : {}),
    ...(typeof sync === "string" ? { syncIdentifier: sync } : {})
  };
};

const workoutsDuring = async (healthkit: HealthKitPackage, ride: { start: number; end: number }) => {
  const proxies = await healthkit.queryWorkoutSamples({
    filter: { date: { startDate: new Date(ride.start), endDate: new Date(ride.end) } },
    limit: 20,
    ascending: true
  });
  return proxies.map((proxy) => ({ proxy, workout: workoutOf(proxy) }));
};

const activeKcalDuring = async (healthkit: HealthKitPackage, ride: { start: number; end: number }) => {
  const statistics = await healthkit.queryStatisticsForQuantity(ACTIVE_ENERGY, ["cumulativeSum"], {
    filter: { date: { startDate: new Date(ride.start), endDate: new Date(ride.end) } },
    unit: "kcal"
  });
  return kcalFrom(statistics.sumQuantity);
};

/**
 * What Apple Health has for a ride's time: the watch's workout during it
 * when there is one (its heart rate and calories), otherwise the heart-rate
 * readings and the active calories it holds for those minutes anyway.
 *
 * When a watch workout covers the ride and Equina also saved the ride, the
 * copy Equina saved is removed, so the ride is in Fitness once: the watch
 * often saves its workout a moment after Finish, too late to be seen then.
 *
 * Null when it cannot be read now: no Apple Health, or the iPhone is locked
 * (Apple Health is encrypted while it is), which is not the same as nothing.
 */
export const readRideEffort = async (ride: {
  start: number;
  end: number;
  /** Equina's own copy of the ride, if it saved one (health-workouts.ts). */
  syncIdentifier: string | null;
}): Promise<RideEffortReading | null> => {
  const healthkit = healthKit();
  if (!healthkit || ride.end <= ride.start) return null;
  try {
    if (!healthkit.isProtectedDataAvailable()) return null;
    const own = healthkit.currentAppSource().bundleIdentifier;
    const workouts = await workoutsDuring(healthkit, ride);
    const match = matchRideWorkout(workouts.map((each) => each.workout), ride, own);
    const matchProxy = match ? workouts.find((each) => each.workout.uuid === match.uuid)?.proxy : undefined;

    if (match && ride.syncIdentifier) {
      for (const copy of ownRideWorkouts(workouts.map((each) => each.workout), own, ride.syncIdentifier)) {
        void healthkit.deleteObjects(WORKOUT, { uuid: copy.uuid }).catch(() => 0);
      }
    }

    const query = (filter: Parameters<HealthKitPackage["queryQuantitySamples"]>[1]["filter"]) =>
      healthkit.queryQuantitySamples(HEART_RATE, { filter, unit: "count/min", limit: 0, ascending: true });
    const around = { date: { startDate: new Date(ride.start - READING_REACH_MS), endDate: new Date(ride.end + READING_REACH_MS) } };
    // The workout's own readings first; some apps save a workout without linking any.
    let samples = matchProxy ? await query({ workout: matchProxy }) : [];
    if (!samples.length) samples = await query(around);

    const picked = primaryReadings(
      samples.map((sample) => ({
        at: (sample.startDate.getTime() + sample.endDate.getTime()) / 2,
        bpm: sample.quantity,
        sourceKey: sample.sourceRevision.source.bundleIdentifier,
        label: healthSourceLabel({
          productType: sample.sourceRevision.productType,
          deviceModel: sample.device?.model,
          deviceName: sample.device?.name,
          sourceName: sample.sourceRevision.source.name,
          bundleIdentifier: sample.sourceRevision.source.bundleIdentifier
        })
      })),
      match?.bundleIdentifier
    );

    // A workout's own total when it is the ride; otherwise what Apple Health
    // counts for those minutes, each source once.
    const kcal = match && match.kcal !== undefined && workoutCoversRide(match, ride)
      ? match.kcal
      : await activeKcalDuring(healthkit, ride).catch(() => undefined);
    const sourceLabel = match ? healthSourceLabel(match) : picked.label;

    return {
      capture: match ? "watch-workout" : "samples",
      ...(sourceLabel ? { sourceLabel } : {}),
      heartRate: picked.readings,
      ...(kcal !== undefined ? { activeKcal: kcal } : {})
    };
  } catch {
    return null;
  }
};

export type RideWorkoutSave = "saved" | "skipped" | "not-allowed" | "unavailable";

/**
 * Saves a finished ride to Apple Health as an Equestrian Sports workout:
 * its start and end, and its active calories when Apple Health already holds
 * them for those minutes (never a number Equina made up). The sync
 * identifier makes a second save of the same ride replace nothing and add
 * nothing; a watch workout that already covers the ride means it is not saved
 * at all. Saving works with the iPhone locked; checking first needs it
 * unlocked, and a locked phone saves without the check (readRideEffort tidies up).
 */
export const saveRideWorkout = async (ride: { start: number; end: number; syncIdentifier: string }): Promise<RideWorkoutSave> => {
  const healthkit = healthKit();
  if (!healthkit) return "unavailable";
  if (ride.end <= ride.start) return "skipped";
  try {
    if (healthkit.authorizationStatusFor(WORKOUT) !== healthkit.AuthorizationStatus.sharingAuthorized) return "not-allowed";
    let kcal: number | undefined;
    if (healthkit.isProtectedDataAvailable()) {
      const own = healthkit.currentAppSource().bundleIdentifier;
      const workouts = (await workoutsDuring(healthkit, ride)).map((each) => each.workout);
      if (matchRideWorkout(workouts, ride, own)) return "skipped";
      if (ownRideWorkouts(workouts, own, ride.syncIdentifier).length) return "skipped";
      kcal = await activeKcalDuring(healthkit, ride).catch(() => undefined);
    }
    await healthkit.saveWorkoutSample(
      healthkit.WorkoutActivityType.equestrianSports,
      [],
      new Date(ride.start),
      new Date(ride.end),
      kcal !== undefined ? { energyBurned: Math.round(kcal) } : undefined,
      { HKMetadataKeySyncIdentifier: ride.syncIdentifier, HKMetadataKeySyncVersion: 1 }
    );
    return "saved";
  } catch {
    return "skipped";
  }
};
