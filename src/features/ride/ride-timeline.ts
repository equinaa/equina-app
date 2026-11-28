import AsyncStorage from "@react-native-async-storage/async-storage";
import type { RideEntry } from "../../backend";
import type { RidePhaseWindows, RideWindow } from "./ride-plan";

/**
 * When each phase of a saved ride was ridden, on the wall clock: what
 * heart-rate samples from Apple Health are split by. It is ride data, not
 * health data, and it stays on the phone that timed the ride: the journal on
 * the server keeps each phase's minutes, never these windows. Kept per
 * account, like the ride in progress, so another account signing in on the
 * same phone never reads them; looked up by the ride's start, which is the
 * one thing the phone and the journal entry agree on exactly.
 *
 * A ride timed on another phone, logged by hand or saved before the timeline
 * has none here, and `approximatePhaseWindows` stands in for it.
 */

export type RideTimelineStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
};

export const rideTimelineStorageKey = (userId?: string) => `equina.ride-timelines.v1:${userId ?? "guest"}`;

/** About a year of daily rides, and a few hundred kilobytes at most. The oldest go first. */
export const maxKeptRideTimelines = 400;

// No ride has more phases than this (ride_entries allows twelve), and no
// phase is split by more pauses than this.
const maxPhaseIndex = 11;
const maxWindowsPerPhase = 200;

/**
 * The key a ride's timeline is kept under: its start as one ISO string,
 * whatever the spelling -- the phone writes "…T10:00:00.000Z", the server
 * reads it back as "…T10:00:00+00:00". Null for a start that is not a time.
 */
export const rideTimelineKey = (startedAt: string) => {
  const ms = Date.parse(startedAt);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
};

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const parseWindow = (value: unknown): RideWindow | null => {
  if (!value || typeof value !== "object") return null;
  const { start, end } = value as Record<string, unknown>;
  return finite(start) && finite(end) && end > start ? { start, end } : null;
};

/** One ride's windows, or null when any part of them cannot be trusted. */
const parseTimeline = (value: unknown): RidePhaseWindows[] | null => {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxPhaseIndex + 1) return null;
  const phases: RidePhaseWindows[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const { phaseIndex, windows } = item as Record<string, unknown>;
    if (!finite(phaseIndex) || !Number.isInteger(phaseIndex) || phaseIndex < 0 || phaseIndex > maxPhaseIndex) return null;
    if (phaseIndex <= (phases[phases.length - 1]?.phaseIndex ?? -1)) return null;
    if (!Array.isArray(windows) || windows.length > maxWindowsPerPhase) return null;
    const parsed = windows.map(parseWindow);
    if (parsed.some((window) => window === null)) return null;
    phases.push({ phaseIndex, windows: parsed as RideWindow[] });
  }
  return phases;
};

/** Every timeline kept, by key. One that cannot be read is dropped, not the rest. */
export const parseRideTimelines = (raw: string | null | undefined): Record<string, RidePhaseWindows[]> => {
  if (!raw) return {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const kept: Record<string, RidePhaseWindows[]> = {};
    for (const [key, timeline] of Object.entries(value as Record<string, unknown>)) {
      const parsed = rideTimelineKey(key) === key ? parseTimeline(timeline) : null;
      if (parsed) kept[key] = parsed;
    }
    return kept;
  } catch {
    return {};
  }
};

/** The timelines with this ride's added, or replaced, and only the newest kept. */
export const keepRideTimeline = (
  kept: Record<string, RidePhaseWindows[]>,
  startedAt: string,
  phases: RidePhaseWindows[],
  limit = maxKeptRideTimelines
): Record<string, RidePhaseWindows[]> => {
  const key = rideTimelineKey(startedAt);
  if (!key) return kept;
  // ISO strings in one spelling sort as the times they are.
  const keys = [...new Set([...Object.keys(kept), key])].sort().slice(-limit);
  const next: Record<string, RidePhaseWindows[]> = {};
  for (const each of keys) {
    const timeline = each === key ? phases : kept[each];
    if (timeline) next[each] = timeline;
  }
  return next;
};

export function createRideTimelineStore(storage: RideTimelineStorage) {
  // Read, add, write: one at a time, or two rides saved together lose one.
  let queue: Promise<void> = Promise.resolve();

  /**
   * Kept as the ride is saved. A timeline that cannot be kept costs nothing
   * but precision: the ride falls back to `approximatePhaseWindows`.
   */
  const save = (userId: string, startedAt: string, phases: RidePhaseWindows[]) => {
    queue = queue.then(async () => {
      try {
        const key = rideTimelineStorageKey(userId);
        const kept = parseRideTimelines(await storage.getItem(key));
        await storage.setItem(key, JSON.stringify(keepRideTimeline(kept, startedAt, phases)));
      } catch {
        // Full storage, or none: the approximation stands in.
      }
    });
    return queue;
  };

  /** The windows kept for a journal entry, or null when this phone has none for it. */
  const forRide = async (entry: Pick<RideEntry, "riderId" | "startedAt">): Promise<RidePhaseWindows[] | null> => {
    // A ride just saved is read back with its timeline.
    await queue;
    const key = rideTimelineKey(entry.startedAt);
    if (!key) return null;
    try {
      return parseRideTimelines(await storage.getItem(rideTimelineStorageKey(entry.riderId)))[key] ?? null;
    } catch {
      return null;
    }
  };

  return { save, forRide };
}

const onThisPhone = createRideTimelineStore(AsyncStorage);

/** Keeps a finished ride's windows on this phone, under the rider's account and the ride's start. */
export const saveRideTimeline = onThisPhone.save;

/** A journal entry's windows as this phone timed them, or null. */
export const rideTimelineFor = onThisPhone.forRide;

/**
 * The windows a ride's saved minutes suggest, for a ride with no timeline:
 * each phase reached, back to back from the start, for the time it was
 * ridden (its planned time when the entry kept none). Pauses are not known,
 * so they are left out: after a break the phases are placed too early. Never
 * past the ride's end.
 */
export const approximatePhaseWindows = (entry: Pick<RideEntry, "startedAt" | "completedAt" | "phases">): RidePhaseWindows[] => {
  const start = Date.parse(entry.startedAt);
  const completed = Date.parse(entry.completedAt);
  const phases = entry.phases ?? [];
  if (!Number.isFinite(start) || phases.length === 0) return [];
  const end = Number.isFinite(completed) ? completed : Number.POSITIVE_INFINITY;
  // A live ride keeps the time of every phase it reached and none for the
  // rest; an entry with no ridden time at all has only the plan to go by.
  const timed = phases.some((phase) => phase.actualSeconds !== undefined);
  const windows: RidePhaseWindows[] = [];
  let cursor = start;
  phases.forEach((phase, phaseIndex) => {
    const seconds = timed ? phase.actualSeconds : phase.plannedSeconds;
    if (seconds === undefined) return;
    const from = Math.min(cursor, end);
    const to = Math.min(cursor + seconds * 1000, end);
    cursor += seconds * 1000;
    windows.push({ phaseIndex, windows: to > from ? [{ start: from, end: to }] : [] });
  });
  return windows;
};
