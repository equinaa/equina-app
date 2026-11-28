import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import type { RideEntry } from "../../backend";
import type { RidePhaseWindows } from "../ride/ride-plan";
import { approximatePhaseWindows, rideTimelineFor } from "../ride/ride-timeline";
import {
  appleHealthAsked,
  appleHealthAvailable,
  appleHealthReadable,
  connectAppleHealth,
  readRideEffort,
  removeRideCopyIfCovered,
  saveRideWorkout
} from "./apple-health";
import { defaultHealthSettings, healthSettings, type HealthSettings } from "./health-settings";
import { rideSyncIdentifier } from "./health-workouts";
import { savedRideWorkouts } from "./saved-ride-workouts";
import { summarizeRideEffort, type PhasePlacement, type RideEffort } from "./ride-effort";

export type AppleHealthController = {
  /** An iPhone with Apple Health, a build that can reach it, and a signed-in rider. */
  available: boolean;
  settings: HealthSettings;
  update: (patch: Partial<HealthSettings>) => void;
};

/**
 * The rider's Apple Health choices, shared by every screen that shows them:
 * a change in Account reaches an open ride at once. Not available on Android,
 * on the web, in a build without the native side, or with no one signed in.
 */
export function useAppleHealth(userId: string | undefined): AppleHealthController {
  const [available] = useState(() => appleHealthAvailable());
  const [settings, setSettings] = useState<HealthSettings>(defaultHealthSettings);

  useEffect(() => {
    setSettings(defaultHealthSettings);
    if (!userId || !available) return;
    let live = true;
    void healthSettings.load(userId).then((loaded) => {
      if (live) setSettings(loaded);
    });
    const unsubscribe = healthSettings.subscribe(userId, (next) => {
      if (live) setSettings(next);
    });
    return () => {
      live = false;
      unsubscribe();
    };
  }, [available, userId]);

  const update = useCallback((patch: Partial<HealthSettings>) => {
    if (userId) void healthSettings.update(userId, patch);
  }, [userId]);

  // Equina's copy of a ride goes once the watch's own workout for it is in
  // Apple Health: looked for as the app opens and each time it comes back to
  // the front, whatever the effort card's switch, and whether or not the
  // ride is ever opened in the journal.
  useEffect(() => {
    if (!userId || !available) return;
    const tidy = () => void tidyRideCopies(userId).catch(() => undefined);
    tidy();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") tidy();
    });
    return () => subscription.remove();
  }, [available, userId]);

  return { available: available && Boolean(userId), settings, update };
}

/**
 * One pass over the rides this phone saved to Apple Health in the last day
 * (saved-ride-workouts.ts). Only while the iPhone is unlocked: Apple Health
 * cannot be read before, and every ride would look alone in it.
 */
export const tidyRideCopies = async (userId: string) => {
  if (!appleHealthReadable()) return;
  await savedRideWorkouts.tidy(userId, Date.now(), removeRideCopyIfCovered);
};

/**
 * A ride the clock timed, saved to Apple Health as it is finished, when the
 * rider allowed saving workouts in Apple's sheet and has not turned it off in
 * Account. Never for a ride added by hand: its minutes are typed, not measured.
 */
export const saveFinishedRideToAppleHealth = async (userId: string, ride: { startedAt: string; completedAt: string }) => {
  if (!appleHealthAvailable()) return;
  const settings = await healthSettings.load(userId);
  if (!settings.saveRides) return;
  const syncIdentifier = rideSyncIdentifier(ride.startedAt);
  const start = Date.parse(ride.startedAt);
  const end = Date.parse(ride.completedAt);
  if (!syncIdentifier || !Number.isFinite(start) || !Number.isFinite(end)) return;
  const saved = await saveRideWorkout({ start, end, syncIdentifier });
  // The watch's own workout usually arrives after Finish: the ride is looked
  // at again later (tidyRideCopies), with its times and nothing else.
  if (saved === "saved") await savedRideWorkouts.add(userId, { syncIdentifier, start, end, savedAt: Date.now() });
};

export type RideEffortView =
  /** Not shown: no Apple Health, turned off, or the Connect card was put away. */
  | { kind: "off" }
  /** Apple's sheet was never shown: the one-time Connect card. */
  | { kind: "connect" }
  /** Asking Apple Health. An earlier read of this ride shows meanwhile. */
  | { kind: "reading"; effort?: RideEffort }
  | { kind: "ready"; effort: RideEffort }
  /** The iPhone is locked, or the read failed: try again later, not "nothing". */
  | { kind: "unreadable" };

export type RideEffortController = {
  view: RideEffortView;
  /** Where the phases sit on the clock, and how sure that is. */
  windows: readonly RidePhaseWindows[];
  placement: PhasePlacement;
  connect: () => void;
  dismiss: () => void;
  checkAgain: () => void;
};

type Remembered = { effort: RideEffort; windows: readonly RidePhaseWindows[]; placement: PhasePlacement };

// What was read for a ride, in memory only, so going back to a ride shows it
// at once while it is read again (a watch can sync late). Never written
// anywhere; it ends with the app.
const remembered = new Map<string, Remembered>();
const REMEMBERED_RIDES = 30;
const remember = (key: string, value: Remembered) => {
  remembered.delete(key);
  remembered.set(key, value);
  while (remembered.size > REMEMBERED_RIDES) remembered.delete(remembered.keys().next().value!);
};

/** Forgets every ride's effort, as an account signs out. */
export const forgetRideEfforts = () => remembered.clear();

const placementOf = (entry: Pick<RideEntry, "source">, timed: boolean): PhasePlacement =>
  timed ? "timed" : entry.source === "manual" ? "typed" : "estimated";

/**
 * The effort of the ride on screen, read from Apple Health each time it
 * opens and each time the app comes back to the front: a watch's heart rate
 * can arrive minutes after the ride, and Apple Health cannot be read while
 * the iPhone is locked.
 */
export function useRideEffort(entry: RideEntry, health: AppleHealthController | undefined): RideEffortController {
  const enabled = Boolean(health?.available && health.settings.showEffort);
  const dismissed = Boolean(health?.settings.connectDismissed);
  const key = `${entry.riderId}:${entry.id}:${entry.startedAt}:${entry.completedAt}`;
  const kept = remembered.get(key);
  const [view, setView] = useState<RideEffortView>(() => (kept ? { kind: "reading", effort: kept.effort } : { kind: "off" }));
  const [windows, setWindows] = useState<readonly RidePhaseWindows[]>(kept?.windows ?? []);
  const [placement, setPlacement] = useState<PhasePlacement>(kept?.placement ?? placementOf(entry, false));
  const [round, setRound] = useState(0);
  const entryRef = useRef(entry);
  entryRef.current = entry;

  useEffect(() => {
    if (!enabled) {
      setView({ kind: "off" });
      return;
    }
    let live = true;
    void (async () => {
      const asked = await appleHealthAsked();
      if (!live) return;
      if (asked === null) return setView({ kind: "off" });
      if (!asked) return setView(dismissed ? { kind: "off" } : { kind: "connect" });

      const ride = entryRef.current;
      const earlier = remembered.get(key);
      setView({ kind: "reading", ...(earlier ? { effort: earlier.effort } : {}) });
      const timeline = await rideTimelineFor(ride);
      const placed = timeline ?? approximatePhaseWindows(ride);
      const where = placementOf(ride, Boolean(timeline));
      const start = Date.parse(ride.startedAt);
      const end = Date.parse(ride.completedAt);
      const reading = await readRideEffort({
        start,
        end,
        syncIdentifier: ride.source === "manual" ? null : rideSyncIdentifier(ride.startedAt)
      });
      if (!live) return;
      setWindows(placed);
      setPlacement(where);
      if (!reading) {
        setView(earlier ? { kind: "ready", effort: earlier.effort } : { kind: "unreadable" });
        return;
      }
      const effort = summarizeRideEffort(reading, { start, end }, placed);
      remember(key, { effort, windows: placed, placement: where });
      setView({ kind: "ready", effort });
    })();
    return () => {
      live = false;
    };
  }, [dismissed, enabled, key, round]);

  // Back from the Health app or the lock screen: read again.
  useEffect(() => {
    if (!enabled) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setRound((count) => count + 1);
    });
    return () => subscription.remove();
  }, [enabled]);

  const connect = useCallback(() => {
    void connectAppleHealth().then(() => setRound((count) => count + 1));
  }, []);
  const dismiss = useCallback(() => health?.update({ connectDismissed: true }), [health]);
  const checkAgain = useCallback(() => setRound((count) => count + 1), []);

  return { view, windows, placement, connect, dismiss, checkAgain };
}
