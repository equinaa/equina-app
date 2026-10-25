import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { EquinaBackend, TrainingPlan, TrainingPlanDay } from "../../backend";
import { localToday } from "../../domain/local-day";
import { planOn, trainingStreak, upcomingPlannedDays } from "../../domain/training-streak";
import { rideTrainingLabel } from "./ride-plan";
import { cancelTrainingReminders, reminderWindowDays, syncTrainingReminders } from "./training-reminders";

const messageFor = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    if (/network|fetch|offline/i.test(error.message)) return "Equina is offline. Reconnect and try again.";
    return error.message;
  }
  return fallback;
};

/**
 * The rider's training week and the streak counted against it. The streak
 * reads when every ride ended across the whole history, reloaded whenever
 * the journal's total changes (a ride saved, logged or deleted).
 *
 * `loaded` means the plan was actually read. A failed read is not "no plan":
 * Home does not offer to plan a week the rider already has, the reminders
 * already scheduled stay, and the read is tried again when the app comes
 * back to the front.
 */
export function useTrainingPlan({
  backend,
  enabled,
  journalTotal,
  horseNames
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
  /** Rides in the journal: when it changes, the streak is read again. */
  journalTotal: number;
  horseNames: Record<string, string>;
}) {
  const [versions, setVersions] = useState<TrainingPlan[]>([]);
  const [completions, setCompletions] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  const completionsRequest = useRef(0);
  // Asked once, by the save that turned reminders on; the tick makes that
  // save rebuild the reminders even when the week itself did not change.
  const askForReminders = useRef(false);
  const [saveTick, setSaveTick] = useState(0);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    if (!backend || !enabled) {
      setVersions([]);
      setCompletions([]);
      setLoaded(false);
      setFailed(false);
      return;
    }
    try {
      const [nextVersions, nextCompletions] = await Promise.all([
        backend.trainingPlans.list(),
        backend.rides.completions()
      ]);
      if (current !== request.current) return;
      setVersions(nextVersions);
      setCompletions(nextCompletions);
      setLoaded(true);
      setFailed(false);
      setError("");
    } catch (loadError) {
      if (current !== request.current) return;
      setFailed(true);
      setError(messageFor(loadError, "Your training plan could not be loaded."));
    }
  }, [backend, enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Back at the front: read again, so another device's change shows up and
  // a read that failed at the yard gets another go.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => subscription.remove();
  }, [refresh]);

  // A ride saved, logged or deleted moves the streak. Only the ride ends are
  // read again; the plan has not changed. The newest read wins.
  const seenTotal = useRef(journalTotal);
  useEffect(() => {
    if (seenTotal.current === journalTotal) return;
    seenTotal.current = journalTotal;
    if (!backend || !enabled) return;
    const current = ++completionsRequest.current;
    void backend.rides.completions().then((next) => {
      if (current === completionsRequest.current) setCompletions(next);
    }).catch(() => undefined);
  }, [backend, enabled, journalTotal]);

  const today = localToday();
  const streak = useMemo(() => trainingStreak(versions, completions, today), [versions, completions, today]);
  const currentPlan = planOn(versions, today) as TrainingPlan | null;

  // The morning reminders follow the plan and the journal, from a plan that
  // was actually read. Turned off in the plan, they are cancelled.
  const reminderKey = JSON.stringify([
    currentPlan?.reminders ? currentPlan.days : null,
    completions[0] ?? "",
    today,
    horseNames
  ]);
  useEffect(() => {
    if (!enabled || !loaded) return;
    const ask = askForReminders.current;
    askForReminders.current = false;
    if (!currentPlan?.reminders) {
      void cancelTrainingReminders();
      return;
    }
    const reminders = upcomingPlannedDays(versions, completions, today, reminderWindowDays).map(({ day, planned }) => {
      const training = rideTrainingLabel(planned.trainingType) ?? "Training";
      const horse = planned.horseId ? horseNames[planned.horseId] : undefined;
      return {
        day,
        planned,
        title: "Training day",
        body: horse ? `${training} with ${horse} is on your plan today.` : `${training} is on your plan today.`
      };
    });
    void syncTrainingReminders(reminders, ask);
  }, [enabled, loaded, reminderKey, saveTick]);

  // Signing out takes the reminders with it. Only a real sign-out: while a
  // session is still being restored, the ones scheduled stay.
  const wasEnabled = useRef(false);
  useEffect(() => {
    if (wasEnabled.current && !enabled) void cancelTrainingReminders();
    wasEnabled.current = enabled;
  }, [enabled]);

  /** The week from today on. The weeks before keep the plan they had. */
  const save = useCallback(async (days: TrainingPlanDay[], reminders: boolean) => {
    if (!backend || !enabled) throw new Error("Ride logging is not enabled for this account.");
    if (!loaded) throw new Error("Your training plan has not loaded yet. Reconnect and try again.");
    setSaving(true);
    setError("");
    try {
      const saved = await backend.trainingPlans.save(localToday(), days, reminders);
      askForReminders.current = reminders;
      setSaveTick((tick) => tick + 1);
      setVersions((current) =>
        [...current.filter((version) => version.id !== saved.id && version.effectiveFrom !== saved.effectiveFrom), saved]
          .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
      );
      return saved;
    } catch (saveError) {
      const message = messageFor(saveError, "Your training plan could not be saved.");
      setError(message);
      void refresh();
      throw new Error(message);
    } finally {
      setSaving(false);
    }
  }, [backend, enabled, loaded, refresh]);

  return {
    versions,
    currentPlan,
    streak,
    loaded,
    failed,
    saving,
    error,
    clearError: () => setError(""),
    refresh,
    save
  };
}

export type TrainingPlanController = ReturnType<typeof useTrainingPlan>;
