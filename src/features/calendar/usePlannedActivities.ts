import { useCallback, useEffect, useRef, useState } from "react";
import type { EquinaBackend, PlannedActivity, PlannedActivityInput } from "../../backend";
import { firstLoggableDay } from "../../domain/activity-calendar";
import { localToday } from "../../domain/local-day";

/**
 * The rider's scheduled activities (202611270001), from a month back on: the
 * ones still ahead, and the ones whose day has come and wait for an answer.
 */
export function usePlannedActivities({ backend, enabled }: { backend: EquinaBackend | null; enabled: boolean }) {
  const [items, setItems] = useState<PlannedActivity[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);

  const refresh = useCallback(async () => {
    const asked = ++request.current;
    if (!backend || !enabled) {
      setItems([]);
      setLoaded(false);
      setError("");
      return;
    }
    try {
      const next = await backend.plannedActivities.listFrom(firstLoggableDay(localToday()));
      if (asked !== request.current) return;
      setItems(next);
      setError("");
    } catch {
      // The server's words (a missing table, a network code) are not the rider's.
      if (asked === request.current) setError("Your scheduled activities could not be loaded.");
    } finally {
      if (asked === request.current) setLoaded(true);
    }
  }, [backend, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const replace = (next: PlannedActivity) =>
    setItems((current) => current.map((item) => (item.id === next.id ? next : item)));

  const schedule = useCallback(async (input: PlannedActivityInput) => {
    if (!backend || !enabled) throw new Error("Scheduling is not available for this account.");
    const created = await backend.plannedActivities.create(input);
    setItems((current) =>
      [...current, created].sort((left, right) =>
        left.day === right.day ? left.startMinutes - right.startMinutes : left.day < right.day ? -1 : 1
      )
    );
    return created;
  }, [backend, enabled]);

  const markDone = useCallback(async (id: string, rideEntryId: string) => {
    if (!backend) throw new Error("Scheduling is not available for this account.");
    replace(await backend.plannedActivities.markDone(id, rideEntryId));
  }, [backend]);

  const skip = useCallback(async (id: string) => {
    if (!backend) throw new Error("Scheduling is not available for this account.");
    replace(await backend.plannedActivities.skip(id));
  }, [backend]);

  const remove = useCallback(async (id: string) => {
    if (!backend) throw new Error("Scheduling is not available for this account.");
    await backend.plannedActivities.remove(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, [backend]);

  return { items, loaded, error, refresh, schedule, markDone, skip, remove };
}

export type PlannedActivitiesController = ReturnType<typeof usePlannedActivities>;
