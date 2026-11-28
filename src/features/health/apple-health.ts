import { Platform, TurboModuleRegistry } from "react-native";
import {
  APPLE_HEALTH_SOURCE,
  coveringRideWorkout,
  healthSourceLabel,
  kcalFrom,
  matchRideWorkout,
  ownRideWorkouts,
  primaryReadings,
  workoutCoversRide,
  workoutIsRide,
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

export type RideSavingStatus = "unavailable" | "not-asked" | "allowed" | "denied";

/**
 * Whether Equina may save workouts. Apple tells this, unlike what it may
 * read: "not-asked" until its sheet was answered, then "allowed" or
 * "denied". Asking again does nothing once it was answered: the rider then
 * changes it in the Health app. Works with the iPhone locked.
 */
export const rideSavingStatus = (): RideSavingStatus => {
  const healthkit = healthKit();
  if (!healthkit) return "unavailable";
  try {
    const status = healthkit.authorizationStatusFor(WORKOUT);
    if (status === healthkit.AuthorizationStatus.sharingAuthorized) return "allowed";
    if (status === healthkit.AuthorizationStatus.sharingDenied) return "denied";
    return "not-asked";
  } catch {
    return "unavailable";
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
 * Whether Apple Health can be read right now: it is encrypted while the
 * iPhone is locked, and every read then comes back empty.
 */
export const appleHealthReadable = () => {
  const healthkit = healthKit();
  if (!healthkit) return false;
  try {
    return healthkit.isProtectedDataAvailable();
  } catch {
    return false;
  }
};

/**
 * What Apple Health has for a ride's time: the watch's workout during it
 * when there is one (its heart rate and calories), otherwise the heart-rate
 * readings and the active calories it holds for those minutes anyway.
 *
 * When another app's Equestrian Sports workout is the ride itself
 * (workoutIsRide) and Equina also saved the ride, the copy Equina saved is
 * removed, so the ride is in Fitness once, as a ride: the watch often saves
 * its workout a moment after Finish, too late to be seen then.
 * useAppleHealth.ts does the same as the app opens, for rides whose card is
 * never opened. A workout of another type over the ride never removes it.
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
    // Only a workout that is the ride itself stands in for it: one that
    // shares just part of it (a watch started late) keeps Equina's copy, and
    // its own readings would leave the rest of the ride out. Its calories
    // only when the two are the same stretch of time (workoutCoversRide);
    // Equina's copy goes only for an Equestrian Sports one (workoutIsRide).
    const covers = match !== null && workoutCoversRide(match, ride);
    const isRide = match !== null && workoutIsRide(match, ride);
    const matchProxy = match && (covers || isRide) ? workouts.find((each) => each.workout.uuid === match.uuid)?.proxy : undefined;

    if (isRide && ride.syncIdentifier) {
      for (const copy of ownRideWorkouts(workouts.map((each) => each.workout), own, ride.syncIdentifier)) {
        void healthkit.deleteObjects(WORKOUT, { uuid: copy.uuid }).catch(() => 0);
      }
    }

    const query = (filter: Parameters<HealthKitPackage["queryQuantitySamples"]>[1]["filter"]) =>
      healthkit.queryQuantitySamples(HEART_RATE, { filter, unit: "count/min", limit: 0, ascending: true });
    const around = { date: { startDate: new Date(ride.start - READING_REACH_MS), endDate: new Date(ride.end + READING_REACH_MS) } };
    // The workout's own readings first when it is the ride; some apps save a
    // workout without linking any. Otherwise every reading in the ride's time.
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
    const kcalSource = match && covers && match.kcal !== undefined ? healthSourceLabel(match) : undefined;
    const kcal = match && kcalSource !== undefined
      ? match.kcal
      : await activeKcalDuring(healthkit, ride).catch(() => undefined);
    // The chip names where the numbers shown came from: the heart rate's
    // source, the workout's app when it gave the calories alone, and Apple
    // Health when the two came from different places.
    const fromWorkout = Boolean(match && picked.sourceKey === match.bundleIdentifier);
    const sourceLabel = picked.readings.length
      ? fromWorkout || kcalSource === undefined
        ? picked.label
        : APPLE_HEALTH_SOURCE
      : kcalSource;

    return {
      capture: fromWorkout ? "watch-workout" : "samples",
      ...(sourceLabel ? { sourceLabel } : {}),
      heartRate: picked.readings,
      ...(kcal !== undefined ? { activeKcal: kcal } : {}),
      ...(kcal !== undefined && kcalSource ? { kcalSource } : {})
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
 * nothing; another app's Equestrian Sports workout that already is the ride
 * (coveringRideWorkout) means it is not saved at all. Saving works with the iPhone locked; checking
 * first needs it unlocked, and a locked phone saves without the check
 * (removeRideCopyIfCovered tidies up later).
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
      if (coveringRideWorkout(workouts, ride, own)) return "skipped";
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

export type RideCopyCheck = "removed" | "kept" | "unreadable";

/**
 * Removes the workout Equina saved for a ride once another app's Equestrian
 * Sports workout (the watch's, most often) is the ride itself, so the ride
 * is in Fitness once. "removed" when Equina's copy is gone or was already gone, "kept"
 * while no such workout is there, "unreadable" while the iPhone is locked or
 * Apple Health cannot be reached: then it is asked again later.
 */
export const removeRideCopyIfCovered = async (ride: { start: number; end: number; syncIdentifier: string }): Promise<RideCopyCheck> => {
  const healthkit = healthKit();
  if (!healthkit || ride.end <= ride.start) return "unreadable";
  try {
    if (!healthkit.isProtectedDataAvailable()) return "unreadable";
    const own = healthkit.currentAppSource().bundleIdentifier;
    const workouts = (await workoutsDuring(healthkit, ride)).map((each) => each.workout);
    if (!coveringRideWorkout(workouts, ride, own)) return "kept";
    for (const copy of ownRideWorkouts(workouts, own, ride.syncIdentifier)) {
      await healthkit.deleteObjects(WORKOUT, { uuid: copy.uuid });
    }
    return "removed";
  } catch {
    return "unreadable";
  }
};
