import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import type { EquinaBackend, RideEntry, RideMoodRecord } from "../../backend";
import type { OnboardingDiscipline } from "../onboarding/OnboardingScreen";
import type { RideCompletion, RideMood, RideSession } from "./RideExperience";

export type RideLogInput = {
  session: RideCompletion;
  mood: RideMood;
  horseId?: string;
  riderNote?: string;
};

// The client speaks capitalised discipline and mood names; the database speaks
// the shared public.discipline enum and a lowercase mood. The translation lives
// here, at the UI boundary, so the repository stays database-shaped and
// App.tsx keeps its existing types.
const moodToRecord: Record<RideMood, RideMoodRecord> = {
  Fresh: "fresh",
  Focused: "focused",
  Tender: "tender"
};

const moodFromRecord: Record<RideMoodRecord, RideMood> = {
  fresh: "Fresh",
  focused: "Focused",
  tender: "Tender"
};

const disciplineFromRecord: Record<string, OnboardingDiscipline> = {
  dressage: "Dressage",
  jumping: "Jumping",
  eventing: "Eventing",
  trail: "Trail"
};

/**
 * Only four of the six enum values are reachable from the ride flow. The other
 * two exist for horse and rider profiles, so a defensive fallback keeps a hand
 * edited row from breaking the recap.
 */
export const rideSessionFrom = (entry: RideEntry): RideSession => ({
  id: entry.id,
  startedAt: entry.startedAt,
  completedAt: entry.completedAt,
  discipline: disciplineFromRecord[entry.discipline] ?? "Trail",
  ...(entry.trainingType ? { trainingType: entry.trainingType } : {}),
  focus: entry.focus,
  plannedDuration: entry.plannedDuration ?? "",
  elapsedSeconds: entry.elapsedSeconds,
  completedPhases: entry.completedPhases,
  totalPhases: entry.totalPhases,
  ...(entry.phases ? { phases: entry.phases } : {}),
  mood: entry.mood ? moodFromRecord[entry.mood] : "Focused"
});

const messageFor = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    if (/row-level security|permission|forbidden|not enabled/i.test(error.message)) {
      return "You do not have permission to make that change.";
    }
    if (/network|fetch|offline/i.test(error.message)) {
      return "Equina is offline. Reconnect and try again.";
    }
    return error.message;
  }
  return fallback;
};

export function useRideJournal({
  backend,
  enabled
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
}) {
  const [entries, setEntries] = useState<RideEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const entriesRequest = useRef(0);

  const refresh = useCallback(async () => {
    if (!backend || !enabled) {
      setEntries([]);
      setLoading(false);
      setRefreshing(false);
      setLoaded(false);
      return;
    }
    const request = ++entriesRequest.current;
    if (entries.length === 0) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const next = await backend.rides.list();
      if (request !== entriesRequest.current) return;
      setEntries(next);
    } catch (loadError) {
      if (request === entriesRequest.current) {
        setError(messageFor(loadError, "Your ride journal could not be loaded."));
      }
    } finally {
      if (request === entriesRequest.current) {
        setLoading(false);
        setRefreshing(false);
        setLoaded(true);
      }
    }
  }, [backend, enabled, entries.length]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void refresh();
  }, [backend, enabled]);

  const runMutation = useCallback(async <T,>(
    key: string,
    operation: () => Promise<T>,
    fallback: string
  ): Promise<T> => {
    if (offline) throw new Error("Equina is offline. Reconnect and try again.");
    setSaving(key);
    setError("");
    try {
      return await operation();
    } catch (mutationError) {
      const nextMessage = messageFor(mutationError, fallback);
      setError(nextMessage);
      throw new Error(nextMessage);
    } finally {
      setSaving("");
    }
  }, [offline]);

  const logRide = useCallback(async (input: RideLogInput) => {
    if (!backend || !enabled) throw new Error("Ride logging is not enabled for this account.");
    return await runMutation("ride:create", async () => {
      const created = await backend.rides.create({
        horseId: input.horseId,
        discipline: input.session.discipline.toLowerCase() as RideEntry["discipline"],
        trainingType: input.session.trainingType,
        focus: input.session.focus,
        plannedDuration: input.session.plannedDuration,
        startedAt: input.session.startedAt,
        completedAt: input.session.completedAt,
        elapsedSeconds: input.session.elapsedSeconds,
        completedPhases: input.session.completedPhases,
        totalPhases: input.session.totalPhases,
        phases: input.session.phases,
        mood: moodToRecord[input.mood],
        riderNote: input.riderNote
      });
      setEntries((current) => [created, ...current]);
      return created;
    }, "The ride could not be saved.");
  }, [backend, enabled, runMutation]);

  const updateRide = useCallback(async (
    id: string,
    patch: { focus?: string; mood?: RideMood; riderNote?: string; elapsedSeconds?: number; completedPhases?: number }
  ) => {
    if (!backend || !enabled) throw new Error("Ride logging is not enabled for this account.");
    return await runMutation(`ride:${id}`, async () => {
      const updated = await backend.rides.update(id, {
        focus: patch.focus,
        mood: patch.mood ? moodToRecord[patch.mood] : undefined,
        riderNote: patch.riderNote,
        elapsedSeconds: patch.elapsedSeconds,
        completedPhases: patch.completedPhases
      });
      setEntries((current) => current.map((entry) => entry.id === id ? updated : entry));
      return updated;
    }, "The ride could not be updated.");
  }, [backend, enabled, runMutation]);

  const deleteRide = useCallback(async (id: string) => {
    if (!backend || !enabled) throw new Error("Ride logging is not enabled for this account.");
    await runMutation(`ride:${id}`, async () => {
      await backend.rides.remove(id);
      setEntries((current) => current.filter((entry) => entry.id !== id));
    }, "The ride could not be removed.");
  }, [backend, enabled, runMutation]);

  const latestEntry = entries[0] ?? null;

  return {
    entries,
    latestEntry,
    /** The most recent ride in the shape the home recap already renders. */
    lastRide: latestEntry ? rideSessionFrom(latestEntry) : null,
    loading,
    loaded,
    refreshing,
    saving,
    error,
    offline,
    clearError: () => setError(""),
    refresh,
    logRide,
    updateRide,
    deleteRide
  };
}

export type RideJournalController = ReturnType<typeof useRideJournal>;
