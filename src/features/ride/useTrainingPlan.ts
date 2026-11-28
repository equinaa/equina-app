import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import type { EquinaBackend, HorseTimeOff, HorseTimeOffInput, RideEnd, TrainingPlan, TrainingPlanDay } from "../../backend";
import { localToday } from "../../domain/local-day";
import { addDays, planOn, trainingStreakFor, upcomingPlannedDays } from "../../domain/training-streak";
import { plannedRidesLabel } from "./planned-rides";
import { cancelTrainingReminders, reminderWindowDays, syncTrainingReminders } from "./training-reminders";

const messageFor = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    if (/network|fetch|offline/i.test(error.message)) return "Equina is offline. Reconnect and try again.";
    return error.message;
  }
  return fallback;
};

/**
 * The rider's training week and the streak counted against it. Each horse
 * has its own week and streak: `streak` is Home's horse's, from the plan's
 * entries and the rides on that horse (training-streak.ts says how). The
 * plan itself stays whole (`versions`, `currentPlan`): the Horse tab and the
 * save need every horse. The streak reads when every ride ended across the
 * whole history, reloaded whenever the journal's total changes (a ride
 * saved, logged or deleted).
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
  horseNames,
  horseId,
  activeHorseIds,
  horsesReady,
  rideActive
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
  /** Rides in the journal: when it changes, the streak is read again. */
  journalTotal: number;
  horseNames: Record<string, string>;
  /** Home's horse, whose streak this is. None for a rider with no horse: the week is read whole. */
  horseId?: string;
  /**
   * The rider's own horses still in the stable: the ones the reminders are
   * for. Empty for a rider with no horse, whose week is read whole. Null when
   * Home only shows horses shared with the rider: no plan on screen, so no
   * reminders they could not see or switch off (`reminderHorsesFor`).
   */
  activeHorseIds: readonly string[] | null;
  /** The horse list has arrived. Until then an empty list means nothing. */
  horsesReady: boolean;
  /** A ride is under way: no permission prompt over it. */
  rideActive: boolean;
}) {
  const [versions, setVersions] = useState<TrainingPlan[]>([]);
  // Every horse's time off: a planned ride on a horse that is off is not due.
  const [timeOff, setTimeOff] = useState<HorseTimeOff[]>([]);
  const [completions, setCompletions] = useState<RideEnd[]>([]);
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
  // A week planned on the web, or before this phone was signed in, never
  // asked this phone for permission: asked once per app session, the first
  // time the reminders are built here.
  const askedOnOpen = useRef(false);
  // Back at the front the reminders are built again, so permission granted
  // in Settings meanwhile takes effect at once.
  const [frontTick, setFrontTick] = useState(0);

  const refresh = useCallback(async () => {
    const current = ++request.current;
    if (!backend || !enabled) {
      setVersions([]);
      setTimeOff([]);
      setCompletions([]);
      setLoaded(false);
      setFailed(false);
      return;
    }
    try {
      const [nextVersions, nextCompletions, nextTimeOff] = await Promise.all([
        backend.trainingPlans.list(),
        backend.rides.completions(),
        backend.horseTimeOff.list()
      ]);
      if (current !== request.current) return;
      setVersions(nextVersions);
      setCompletions(nextCompletions);
      setTimeOff(nextTimeOff);
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
      if (state !== "active") return;
      setFrontTick((tick) => tick + 1);
      void refresh();
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
  const streak = useMemo(
    () => trainingStreakFor(versions, completions, horseId, today, timeOff),
    [versions, completions, today, timeOff, horseId]
  );
  const currentPlan = planOn(versions, today) as TrainingPlan | null;

  // The morning reminders follow the plan and the journal, from a plan that
  // was actually read, and from the horse list once it is in: an empty list
  // before it arrives would cancel every reminder. Turned off in the plan,
  // or with no plan the rider can see (`activeHorseIds` null), they are
  // cancelled. One switch for the rider and one reminder a day, naming every
  // horse still to ride that day.
  const reminderKey = JSON.stringify([
    currentPlan?.reminders ? currentPlan.days : null,
    timeOff.map((period) => [period.horseId, period.startsOn, period.endsOn]),
    completions[0]?.completedAt ?? "",
    completions[0]?.horseId ?? "",
    today,
    horseNames,
    activeHorseIds
  ]);
  useEffect(() => {
    if (!enabled || !loaded || !horsesReady) return;
    const asked = askForReminders.current;
    askForReminders.current = false;
    if (!currentPlan?.reminders || !activeHorseIds) {
      void cancelTrainingReminders();
      return;
    }
    const reminders = upcomingPlannedDays(
      versions,
      completions,
      today,
      reminderWindowDays,
      timeOff,
      new Set(activeHorseIds)
    ).map(({ day, planned }) => ({
      day,
      planned,
      title: "Training day",
      body: `${plannedRidesLabel(planned, horseNames)} ${planned.length === 1 ? "is" : "are"} on your plan today.`
    }));
    // Never over a ride: the prompt waits for it to end.
    const askOnOpen = !askedOnOpen.current && !rideActive && reminders.length > 0;
    if (askOnOpen) askedOnOpen.current = true;
    void syncTrainingReminders(reminders, asked || askOnOpen);
  }, [enabled, loaded, horsesReady, reminderKey, saveTick, frontTick, rideActive]);

  // Signing out takes the reminders with it. Only a real sign-out: while a
  // session is still being restored, the ones scheduled stay.
  const wasEnabled = useRef(false);
  useEffect(() => {
    if (wasEnabled.current && !enabled) void cancelTrainingReminders();
    wasEnabled.current = enabled;
  }, [enabled]);

  /**
   * The week from today on. The weeks before keep the plan they had. The days
   * can be worked out once the save is under way (the editor reads the
   * rider's horses first), so the sheet says it is saving from the tap.
   */
  const save = useCallback(async (days: TrainingPlanDay[] | (() => Promise<TrainingPlanDay[]>), reminders: boolean) => {
    if (!backend || !enabled) throw new Error("Ride logging is not enabled for this account.");
    if (!loaded) throw new Error("Your training plan has not loaded yet. Reconnect and try again.");
    setSaving(true);
    setError("");
    try {
      const saved = await backend.trainingPlans.save(localToday(), typeof days === "function" ? await days() : days, reminders);
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

  /** Puts a horse on time off. Only someone who can edit the horse can. */
  const addTimeOff = useCallback(async (input: HorseTimeOffInput) => {
    if (!backend || !enabled) throw new Error("Ride logging is not enabled for this account.");
    try {
      const created = await backend.horseTimeOff.create(input);
      setTimeOff((current) => [created, ...current]);
      return created;
    } catch (saveError) {
      throw new Error(messageFor(saveError, "The time off could not be saved."));
    }
  }, [backend, enabled]);

  /** The horse is back in work: the period ends yesterday, and the days it covered stay covered. */
  const endTimeOff = useCallback(async (id: string) => {
    if (!backend || !enabled) throw new Error("Ride logging is not enabled for this account.");
    try {
      const ended = await backend.horseTimeOff.end(id, addDays(localToday(), -1));
      setTimeOff((current) => current.map((period) => (period.id === id ? ended : period)));
    } catch (endError) {
      throw new Error(messageFor(endError, "The time off could not be ended."));
    }
  }, [backend, enabled]);

  /**
   * One day as the reminders read it, for a tapped one: what the rider's own
   * horses have planned on it, and what of that is still to ride. Read from
   * the plan as it is now, which may have changed since the reminder went.
   */
  const rideDay = (day: string) => {
    const horses = new Set(activeHorseIds ?? []);
    const plannedWith = (rides: readonly RideEnd[]) =>
      upcomingPlannedDays(versions, rides, day, 1, timeOff, horses)[0]?.planned ?? [];
    return { planned: plannedWith([]), due: plannedWith(completions) };
  };

  const removeTimeOff = useCallback(async (id: string) => {
    if (!backend || !enabled) throw new Error("Ride logging is not enabled for this account.");
    try {
      await backend.horseTimeOff.remove(id);
      setTimeOff((current) => current.filter((period) => period.id !== id));
    } catch (removeError) {
      throw new Error(messageFor(removeError, "The time off could not be removed."));
    }
  }, [backend, enabled]);

  return {
    versions,
    timeOff,
    // When every ride ended, for a past ride's streak on its own horse,
    // which need not be Home's (the journal's ride in context).
    completions,
    addTimeOff,
    endTimeOff,
    removeTimeOff,
    currentPlan,
    streak,
    rideDay,
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
