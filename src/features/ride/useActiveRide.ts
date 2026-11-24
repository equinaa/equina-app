import { useCallback, useEffect, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseActiveRide, serializeActiveRide, type ActiveRide } from "./active-ride";
import type { RidePlan, RideRun } from "./ride-plan";

// Per account on this phone, like the setup memory: a ride belongs to the
// rider who started it, and another account signing in never inherits it.
const storageKey = (userId?: string) => `equina.active-ride.v1:${userId ?? "guest"}`;

/** For sign-out, which runs before the account is gone from the session. */
export const clearActiveRide = (userId?: string) =>
  AsyncStorage.removeItem(storageKey(userId)).catch(() => undefined);

/**
 * The ride in progress, written at every change of its state (start, pause,
 * resume, a new phase) and read once the account is known. The run is
 * timestamps, so nothing is written while the clock simply runs.
 *
 * `onLoaded` gets the stored ride, or null when there is none to bring back;
 * one that is too old or unreadable is removed.
 */
export function useActiveRide(userId: string | undefined, ready: boolean, onLoaded: (ride: ActiveRide | null) => void) {
  const loadedRef = useRef(onLoaded);
  loadedRef.current = onLoaded;

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    const key = storageKey(userId);
    AsyncStorage.getItem(key)
      .then((raw) => {
        if (cancelled) return;
        const ride = parseActiveRide(raw, Date.now());
        if (raw && !ride) void AsyncStorage.removeItem(key).catch(() => undefined);
        loadedRef.current(ride);
      })
      .catch(() => {
        if (!cancelled) loadedRef.current(null);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, ready]);

  const save = useCallback((plan: RidePlan, run: RideRun) => {
    void AsyncStorage.setItem(storageKey(userId), serializeActiveRide(plan, run, Date.now())).catch(() => undefined);
  }, [userId]);

  const clear = useCallback(() => {
    void clearActiveRide(userId);
  }, [userId]);

  return { save, clear };
}
