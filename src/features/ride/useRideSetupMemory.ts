import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseRideSetupMemory, rememberSetup, type RidePlan, type RideSetupMemory } from "./ride-plan";

// Per account on this phone: two riders sharing a phone keep their own setups.
const storageKey = (userId?: string) => `equina.ride-setup.v1:${userId ?? "guest"}`;

/**
 * The last setup, so the next ride opens on the rider's own training and
 * minutes instead of the defaults every time. Kept on the phone only: it is a
 * convenience, and a fresh install simply starts from the yard's phases.
 */
export function useRideSetupMemory(userId?: string) {
  const [memory, setMemory] = useState<RideSetupMemory | null>(null);

  useEffect(() => {
    let cancelled = false;
    setMemory(null);
    AsyncStorage.getItem(storageKey(userId))
      .then((raw) => {
        if (!cancelled) setMemory(parseRideSetupMemory(raw));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const remember = useCallback((plan: RidePlan) => {
    setMemory((current) => {
      const next = rememberSetup(current, plan);
      void AsyncStorage.setItem(storageKey(userId), JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  }, [userId]);

  return { memory, remember };
}
