import type { HeartRateReading } from "./ride-effort";

/**
 * Which Apple Health workout is a ride's, which one is Equina's own copy of
 * it, and what to call where the numbers came from. Pure: the native calls
 * are in apple-health.ts, and these decisions are tested on their own.
 */

/** HKWorkoutActivityType.equestrianSports: "riding a horse, including polo, horse racing, and horse riding". */
export const EQUESTRIAN_SPORTS = 17;

/** A workout as Apple Health describes it, read on the phone. */
export type HealthWorkout = {
  uuid: string;
  start: number;
  end: number;
  activityType: number;
  /** The app that saved it; a watch's own source is "com.apple.health.<id>". */
  bundleIdentifier: string;
  sourceName: string;
  productType?: string;
  deviceName?: string;
  deviceModel?: string;
  /** Its active energy, in kcal, when it recorded some. */
  kcal?: number;
  /** HKMetadataKeySyncIdentifier, set on the workouts Equina saves. */
  syncIdentifier?: string;
};

type Span = { start: number; end: number };

const overlap = (a: Span, b: Span) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));

/**
 * The sync identifier of the workout Equina saves for a ride: its start, in
 * one spelling, so the same ride is never saved twice whoever saves it. Null
 * for a start that is not a time.
 */
export const rideSyncIdentifier = (startedAt: string) => {
  const ms = Date.parse(startedAt);
  return Number.isFinite(ms) ? `equina.ride.${new Date(ms).toISOString()}` : null;
};

/**
 * Another app's workout (the watch's, most often) during the ride: an
 * Equestrian Sports one first, then any other, the one sharing the most time
 * first. It has to cover at least half of the ride itself, so a walk that
 * ended as the ride began, or a short workout started by mistake halfway
 * through, is not taken for it. One watch workout over two rides back to
 * back still covers each. Equina's own are left out.
 */
export const matchRideWorkout = (
  workouts: readonly HealthWorkout[],
  ride: Span,
  ownBundleIdentifier: string
): HealthWorkout | null => {
  const rideMs = ride.end - ride.start;
  if (rideMs <= 0) return null;
  const candidates = workouts
    .filter((workout) => workout.bundleIdentifier !== ownBundleIdentifier && workout.end > workout.start)
    .map((workout) => ({ workout, shared: overlap(workout, ride) }))
    .filter(({ shared }) => shared > 0 && shared >= 0.5 * rideMs);
  candidates.sort((a, b) => {
    const equestrian = Number(b.workout.activityType === EQUESTRIAN_SPORTS) - Number(a.workout.activityType === EQUESTRIAN_SPORTS);
    return equestrian || b.shared - a.shared;
  });
  return candidates[0]?.workout ?? null;
};

/** A workout's calories stand for the ride only when the two are, give or take, the same stretch of time. */
export const workoutCoversRide = (workout: HealthWorkout, ride: Span) =>
  overlap(workout, ride) >= 0.8 * Math.max(ride.end - ride.start, workout.end - workout.start);

/** Time a workout runs past the ride, before and after it together, that still makes it the ride: tacking up, untacking. */
export const RIDE_WORKOUT_EXTRA_MS = 15 * 60_000;

/**
 * Another app's workout that is the ride itself: an Equestrian Sports one,
 * the ride's whole time or nearly (95%), with no more than a quarter of an
 * hour around it, or half the ride's length for a long ride. A watch started
 * while mounting and stopped after dismounting is the ride; one over two
 * rides back to back, or a show day, is not. Any other type of workout never
 * stands in for the ride, however well it lines up: Fitness keeps the ride
 * as Equestrian Sports. workoutCoversRide stays the rule for calories.
 */
export const workoutIsRide = (workout: HealthWorkout, ride: Span) => {
  if (workout.activityType !== EQUESTRIAN_SPORTS) return false;
  if (workoutCoversRide(workout, ride)) return true;
  const rideMs = ride.end - ride.start;
  const shared = overlap(workout, ride);
  const extra = workout.end - workout.start - shared;
  return rideMs > 0 && shared >= 0.95 * rideMs && extra <= Math.max(RIDE_WORKOUT_EXTRA_MS, 0.5 * rideMs);
};

/**
 * Another app's workout that is the ride itself (workoutIsRide): only then is
 * Equina's own copy not needed, and only then is it removed or never saved.
 * A workout that merely matches (a watch started late, a long hike around the
 * ride, a walk or "Other" over it) leaves Equina's copy where it is: two
 * workouts in Fitness are better than a ride that is not there as a ride.
 */
export const coveringRideWorkout = (
  workouts: readonly HealthWorkout[],
  ride: Span,
  ownBundleIdentifier: string
): HealthWorkout | null => {
  const match = matchRideWorkout(workouts, ride, ownBundleIdentifier);
  return match && workoutIsRide(match, ride) ? match : null;
};

/** Equina's own saved copies of a ride, found by the ride's sync identifier. */
export const ownRideWorkouts = (workouts: readonly HealthWorkout[], ownBundleIdentifier: string, syncIdentifier: string) =>
  workouts.filter((workout) => workout.bundleIdentifier === ownBundleIdentifier && workout.syncIdentifier === syncIdentifier);

/**
 * What the card's chip says the numbers came from. A device's own name in
 * Apple Health is often a person's ("Ana's Apple Watch"), so it is never
 * shown: a watch is "Apple Watch", a strap or an app by its model or app name,
 * and anything else "Apple Health" (APPLE_HEALTH_SOURCE).
 */
export const healthSourceLabel = ({
  productType,
  deviceModel,
  deviceName,
  sourceName,
  bundleIdentifier
}: Partial<Pick<HealthWorkout, "productType" | "deviceModel" | "deviceName" | "sourceName" | "bundleIdentifier">>) => {
  if (/^watch/i.test(productType ?? "") || deviceModel === "Watch" || deviceName === "Apple Watch") return "Apple Watch";
  const personal = (name?: string) => !name || /['’]s\b/i.test(name) || name.length > 30;
  if (deviceName && !personal(deviceName) && !/^iphone/i.test(productType ?? "")) return deviceName;
  if (bundleIdentifier && !bundleIdentifier.startsWith("com.apple.") && sourceName && !personal(sourceName)) return sourceName;
  return APPLE_HEALTH_SOURCE;
};

/** What the chip says when no device or app can be named. */
export const APPLE_HEALTH_SOURCE = "Apple Health";

/** The chip, as VoiceOver reads it: never "From Apple Health, through Apple Health". */
export const sourceChipSpoken = (label: string) =>
  label === APPLE_HEALTH_SOURCE ? "From Apple Health" : `From ${label}, through Apple Health`;

export type SourcedReading = HeartRateReading & { sourceKey: string; label: string };

/**
 * One source's readings, so two devices worn at once never zigzag into one
 * line: the workout's own source when it has readings, else the source with
 * the most readings in the ride. Which source it was comes back with them.
 */
export const primaryReadings = (
  readings: readonly SourcedReading[],
  preferredSourceKey?: string
): { readings: HeartRateReading[]; label?: string; sourceKey?: string } => {
  const counts = new Map<string, number>();
  for (const reading of readings) counts.set(reading.sourceKey, (counts.get(reading.sourceKey) ?? 0) + 1);
  const key = preferredSourceKey && counts.has(preferredSourceKey)
    ? preferredSourceKey
    : [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (key === undefined) return { readings: [] };
  const own = readings.filter((reading) => reading.sourceKey === key);
  return { readings: own.map(({ at, bpm }) => ({ at, bpm })), label: own[0]?.label, sourceKey: key };
};

/** Energy as Apple Health hands it over, in kcal. A unit Equina does not know is left out. */
export const kcalFrom = (quantity: { unit: string; quantity: number } | undefined) => {
  if (!quantity || !Number.isFinite(quantity.quantity) || quantity.quantity <= 0) return undefined;
  if (quantity.unit === "kcal" || quantity.unit === "Cal") return quantity.quantity;
  if (quantity.unit === "kJ") return quantity.quantity / 4.184;
  if (quantity.unit === "cal") return quantity.quantity / 1000;
  return undefined;
};
