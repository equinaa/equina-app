import type { RideEntry } from "../backend/contracts";

/**
 * Summarising the ride journal by week and by month.
 *
 * Everything here is derived from the entries on every read. There is no
 * stored total to drift, and a deleted ride disappears from the summary the
 * moment it is deleted.
 *
 * One honesty constraint shapes the whole shape of this: `elapsedSeconds` is
 * only as good as the timer, and the timer runs while the app is open. A rider
 * who starts a session and pockets the phone records a fraction of the real
 * hour. So time is reported as "tracked", never as "time in the saddle", and
 * it is never the headline. The headline is the ride count, which is the one
 * number the journal actually knows.
 */

export type RidePeriod = "week" | "month";

const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD date as UTC midnight, or null if it is not one. */
const parseDay = (value: string): number | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
};

const toDay = (timestamp: number): string => new Date(timestamp).toISOString().slice(0, 10);

/** The calendar day a ride belongs to, from its completion timestamp. */
export const rideDay = (entry: RideEntry): string | null => {
  const parsed = Date.parse(entry.completedAt);
  return Number.isNaN(parsed) ? null : toDay(parsed);
};

export type PeriodBounds = { start: string; endExclusive: string };

/**
 * The period containing `today`, and the one before it.
 *
 * Weeks start on Monday: the European convention, and the one every yard and
 * every competition calendar already runs on.
 */
export const periodBounds = (period: RidePeriod, today: string): PeriodBounds | null => {
  const now = parseDay(today);
  if (now === null) return null;

  if (period === "week") {
    // getUTCDay is 0 for Sunday, so Monday-based offset is (day + 6) % 7.
    const offset = (new Date(now).getUTCDay() + 6) % 7;
    const start = now - offset * MS_PER_DAY;
    return { start: toDay(start), endExclusive: toDay(start + 7 * MS_PER_DAY) };
  }

  const date = new Date(now);
  const start = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
  const next = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1);
  return { start: toDay(start), endExclusive: toDay(next) };
};

export const previousBounds = (period: RidePeriod, bounds: PeriodBounds): PeriodBounds | null => {
  const start = parseDay(bounds.start);
  if (start === null) return null;

  if (period === "week") {
    return { start: toDay(start - 7 * MS_PER_DAY), endExclusive: bounds.start };
  }

  const date = new Date(start);
  const previous = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1);
  return { start: toDay(previous), endExclusive: bounds.start };
};

const within = (day: string, bounds: PeriodBounds): boolean =>
  day >= bounds.start && day < bounds.endExclusive;

export const ridesWithin = (entries: readonly RideEntry[], bounds: PeriodBounds): RideEntry[] =>
  entries.filter((entry) => {
    const day = rideDay(entry);
    return day !== null && within(day, bounds);
  });

export type Tally<T extends string> = { value: T; rides: number };

const tally = <T extends string>(values: readonly (T | undefined)[]): Tally<T>[] => {
  const counts = new Map<T, number>();
  for (const value of values) {
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([value, rides]) => ({ value, rides }))
    .sort((left, right) => right.rides - left.rides || left.value.localeCompare(right.value));
};

export type RideSummary = {
  period: RidePeriod;
  bounds: PeriodBounds;
  rides: number;
  previousRides: number;
  /** Seconds the timer actually ran. Never presented as time in the saddle. */
  trackedSeconds: number;
  /**
   * What was ridden, by the training each ride was set up as. A jumping rider
   * who rode dressage twice and jumped once reads "Dressage 2 · Jumping 1".
   * Rides from before the setup sheet count under their discipline.
   */
  trainings: Tally<string>[];
  moods: Tally<string>[];
  /** Distinct focuses worked, most recent first, for the one-line recap. */
  focuses: string[];
  phasesCompleted: number;
  phasesPlanned: number;
  daysRidden: number;
};

export const summarise = (
  entries: readonly RideEntry[],
  period: RidePeriod,
  today: string
): RideSummary | null => {
  const bounds = periodBounds(period, today);
  if (!bounds) return null;
  const previous = previousBounds(period, bounds);

  const current = ridesWithin(entries, bounds);
  const days = new Set(current.map((entry) => rideDay(entry)).filter((day): day is string => day !== null));

  const focuses: string[] = [];
  for (const entry of [...current].sort((left, right) => right.completedAt.localeCompare(left.completedAt))) {
    const focus = entry.focus.trim();
    if (focus && !focuses.includes(focus)) focuses.push(focus);
  }

  return {
    period,
    bounds,
    rides: current.length,
    previousRides: previous ? ridesWithin(entries, previous).length : 0,
    trackedSeconds: current.reduce((total, entry) => total + Math.max(0, entry.elapsedSeconds), 0),
    trainings: tally(current.map((entry) => entry.trainingType ?? (entry.discipline as string))),
    moods: tally(current.map((entry) => entry.mood as string | undefined)),
    focuses,
    phasesCompleted: current.reduce((total, entry) => total + Math.max(0, entry.completedPhases), 0),
    phasesPlanned: current.reduce((total, entry) => total + Math.max(0, entry.totalPhases), 0),
    daysRidden: days.size
  };
};

/**
 * The sentence a rider wants first: how this period compares with the last
 * one. Returns null when there is nothing honest to compare -- a first period
 * has no previous, and claiming "up 3" against zero history is the kind of
 * invented encouragement this app already removed once.
 */
export const describeTrend = (summary: RideSummary): string | null => {
  if (summary.rides === 0) return null;
  if (summary.previousRides === 0) return null;
  const difference = summary.rides - summary.previousRides;
  const unit = summary.period === "week" ? "last week" : "last month";
  if (difference === 0) return `Same as ${unit}`;
  if (difference === 1) return `One more than ${unit}`;
  if (difference === -1) return `One fewer than ${unit}`;
  return difference > 0 ? `${difference} more than ${unit}` : `${Math.abs(difference)} fewer than ${unit}`;
};

/** Tracked time, rounded the way a person would say it. */
export const describeTracked = (seconds: number): string | null => {
  if (seconds < 60) return null;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min tracked`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours} h tracked` : `${hours} h ${rest} min tracked`;
};

/**
 * How the horse felt, when the rider said so.
 *
 * The denominator is rides that recorded a feeling, not rides. "Felt fresh"
 * may only be said when every ride in the period recorded it -- with three
 * rides and one check-in, the short phrase would claim two feelings nobody
 * entered, which is exactly the kind of invented fact this app removed once.
 */
export const describeMood = (summary: RideSummary): string | null => {
  const recorded = summary.moods.reduce((sum, entry) => sum + entry.rides, 0);
  const top = summary.moods[0];
  if (recorded === 0 || !top) return null;
  if (top.rides === recorded && recorded === summary.rides) {
    return summary.rides === 1 ? `Felt ${top.value}` : `Felt ${top.value} every time`;
  }
  return `Felt ${top.value} in ${top.rides} of ${recorded} logged`;
};
