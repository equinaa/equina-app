import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The rides Equina saved to Apple Health in the last day, kept on this phone
 * under the rider's account: each workout's sync identifier and the ride's
 * start and end, and when it was saved. Ride times only, like the ride
 * timeline; nothing read from Apple Health is ever written here.
 *
 * Why: a watch's own workout reaches the iPhone when the watch ends it and
 * syncs, usually after the rider tapped Finish, so the check made as the ride
 * is saved cannot see it. This list lets the app look again later and remove
 * Equina's copy once the watch's is there, whether or not the ride's effort
 * card is ever opened. After a day the watch has synced or never will: the
 * entry is looked at once more, the next time the app can, and goes.
 *
 * A second list, the same shape, keeps the rides that could not be saved
 * because Apple Health did not allow it yet (its sheet not shown, or saving
 * refused), for a week: they are saved once it does.
 */

export type SavedRideWorkout = {
  syncIdentifier: string;
  start: number;
  end: number;
  savedAt: number;
};

/** What the check of one saved ride found (apple-health.ts, removeRideCopyIfCovered). */
export type SavedRideCheck = "removed" | "kept" | "unreadable";

/** How long a saved ride is checked for the watch's own workout. */
export const SAVED_RIDE_CHECK_MS = 24 * 60 * 60 * 1000;

/** A day of rides is a handful; this only keeps a broken clock from growing the list. */
export const MAX_SAVED_RIDE_WORKOUTS = 20;

/** An entry past its time is looked at once more; one that cannot be looked at goes after this many times its time. */
export const RIDE_ENTRY_HARD_LIMIT = 7;

/** How long a ride Apple Health did not let Equina save waits to be saved. */
export const MISSED_RIDE_KEEP_MS = 7 * 24 * 60 * 60 * 1000;

export type SavedRideWorkoutsStorage = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export const savedRideWorkoutsKey = (userId: string) => `equina.apple-health-saved-rides.v1:${userId}`;
export const missedRideWorkoutsKey = (userId: string) => `equina.apple-health-missed-rides.v1:${userId}`;

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * Every entry that can be trusted, with its four fields and nothing else:
 * anything more in storage is not read back.
 */
export const parseSavedRideWorkouts = (raw: string | null | undefined): SavedRideWorkout[] => {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    const kept: SavedRideWorkout[] = [];
    for (const item of value) {
      if (!item || typeof item !== "object") continue;
      const { syncIdentifier, start, end, savedAt } = item as Record<string, unknown>;
      if (typeof syncIdentifier !== "string" || !syncIdentifier.startsWith("equina.ride.")) continue;
      if (!finite(start) || !finite(end) || end <= start || !finite(savedAt)) continue;
      kept.push({ syncIdentifier, start, end, savedAt });
    }
    return kept;
  } catch {
    return [];
  }
};

/** The list with this ride added, or its earlier entry replaced, newest last. */
export const withSavedRideWorkout = (list: readonly SavedRideWorkout[], entry: SavedRideWorkout): SavedRideWorkout[] =>
  [...list.filter((each) => each.syncIdentifier !== entry.syncIdentifier), entry].slice(-MAX_SAVED_RIDE_WORKOUTS);

/**
 * Still worth checking: saved less than a day ago (or the list's own time).
 * A save stamped far in the future (the clock was moved back) is not, or it
 * would never expire.
 */
export const savedRideStillChecked = (entry: SavedRideWorkout, now: number, checkFor = SAVED_RIDE_CHECK_MS) =>
  Math.abs(now - entry.savedAt) < checkFor;

/**
 * One pass over the list. Every entry is checked, and dropped once it is
 * done with ("removed"): Equina's copy gone, or the missed ride saved. One
 * that is not done yet ("kept") stays while it is still in its time, and
 * after it goes: an entry past its time is checked once more, so a watch
 * workout that synced while the app was away is still found. One that cannot
 * be checked now ("unreadable") stays for the next pass, up to
 * RIDE_ENTRY_HARD_LIMIT times its time, and once the iPhone turns out to be
 * locked the rest wait too: they would be unreadable just the same.
 */
export const tidySavedRideWorkouts = async (
  list: readonly SavedRideWorkout[],
  now: number,
  check: (entry: SavedRideWorkout) => Promise<SavedRideCheck>,
  checkFor = SAVED_RIDE_CHECK_MS
): Promise<SavedRideWorkout[]> => {
  const next: SavedRideWorkout[] = [];
  let readable = true;
  for (const entry of list) {
    if (!savedRideStillChecked(entry, now, RIDE_ENTRY_HARD_LIMIT * checkFor)) continue;
    if (!readable) {
      next.push(entry);
      continue;
    }
    const outcome = await check(entry).catch((): SavedRideCheck => "unreadable");
    if (outcome === "removed") continue;
    if (outcome === "unreadable") {
      readable = false;
      next.push(entry);
      continue;
    }
    if (savedRideStillChecked(entry, now, checkFor)) next.push(entry);
  }
  return next;
};

export function createSavedRideWorkoutsStore(
  storage: SavedRideWorkoutsStorage,
  { keyOf = savedRideWorkoutsKey, checkFor = SAVED_RIDE_CHECK_MS }: { keyOf?: (userId: string) => string; checkFor?: number } = {}
) {
  // Read, change, write: one at a time, or a ride saved during a check is lost.
  let queue: Promise<unknown> = Promise.resolve();
  const inTurn = <T>(task: () => Promise<T>): Promise<T> => {
    const next = queue.then(task);
    queue = next.catch(() => undefined);
    return next;
  };

  const read = async (userId: string) => {
    try {
      return parseSavedRideWorkouts(await storage.getItem(keyOf(userId)));
    } catch {
      return [];
    }
  };

  const write = async (userId: string, list: readonly SavedRideWorkout[]) => {
    try {
      if (list.length) await storage.setItem(keyOf(userId), JSON.stringify(list));
      else await storage.removeItem(keyOf(userId));
    } catch {
      // No storage: this ride's copy is left to the effort card, as before.
    }
  };

  /** Kept as Equina saves a ride to Apple Health. */
  const add = (userId: string, entry: SavedRideWorkout) =>
    inTurn(async () => {
      await write(userId, withSavedRideWorkout(await read(userId), entry));
    });

  /** One pass of tidySavedRideWorkouts over this account's list, written back. Nothing is asked of Apple Health for an empty list. */
  const tidy = (userId: string, now: number, check: (entry: SavedRideWorkout) => Promise<SavedRideCheck>) =>
    inTurn(async () => {
      const list = await read(userId);
      if (!list.length) return list;
      const next = await tidySavedRideWorkouts(list, now, check, checkFor);
      if (next.length !== list.length) await write(userId, next);
      return next;
    });

  return { add, tidy, list: (userId: string) => inTurn(() => read(userId)) };
}

/** This phone's list of rides saved in the last day. */
export const savedRideWorkouts = createSavedRideWorkoutsStore(AsyncStorage);

/**
 * This phone's list of timed rides Apple Health did not let Equina save yet,
 * for a week. "removed" from a check means the ride is done with: saved, or
 * no longer to be saved.
 */
export const missedRideWorkouts = createSavedRideWorkoutsStore(AsyncStorage, { keyOf: missedRideWorkoutsKey, checkFor: MISSED_RIDE_KEEP_MS });
