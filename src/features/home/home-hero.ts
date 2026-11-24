import { timeOffOn, type StreakSummary, type TimeOffPeriod } from "../../domain/training-streak";
import type { Discipline } from "../../domain/types";
import { rideTrainingLabel } from "../ride/ride-plan";

/**
 * The Home hero waits, dark, while the rider's own horse photo is known to
 * exist but has no URL yet -- instead of showing a stock picture that the
 * photo then replaces. It stops waiting once the horse list is in, photo or
 * not, so a failed load never leaves the stage empty.
 */
export const heroPhotoPending = (input: {
  connected: boolean;
  authenticated: boolean;
  /** The primary horse's stored photo, from the account snapshot. */
  photoPath?: string;
  /** The photo URL Home has so far. */
  photoUrl: string;
  horsesLoaded: boolean;
}) =>
  input.connected &&
  input.authenticated &&
  Boolean(input.photoPath) &&
  !input.photoUrl &&
  !input.horsesLoaded;

/**
 * Whether the account snapshot decides Home's horse.
 *
 * The snapshot carries only the primary horse, signed with the account so
 * Home opens on it. Once the Stable's list is in, the selected horse is
 * Home's horse. An account refresh -- any Account save, any horse edit --
 * used to put the primary's name and breed back over the photo of a
 * different horse the rider had picked.
 */
export const snapshotSetsHomeHorse = (input: {
  horsesLoaded: boolean;
  selectedHorseId?: string;
  primaryHorseId?: string;
}) => !input.horsesLoaded || (Boolean(input.primaryHorseId) && input.selectedHorseId === input.primaryHorseId);

/** The picture on the stage: nothing while pending, the rider's own unless it failed, else stock. */
export const heroPhotoFor = (input: { pending: boolean; own: string; failed: string; stock: string }) =>
  input.pending ? "" : input.own && input.own !== input.failed ? input.own : input.stock;

/**
 * The rider's discipline is the profile's. A horse's discipline fills in only
 * for a profile that has none; null means keep what the profile says.
 */
export const disciplineFromHorse = (profileDiscipline?: Discipline, horseDiscipline?: Discipline) =>
  profileDiscipline ? null : horseDiscipline ?? null;

/**
 * What today is for Home's horse, for the word after TODAY on the hero.
 * Read from the same scoped streak as the plan card, so the hero and the
 * card never disagree: the training planned today; time off when the horse
 * is off (a ride planned that day is not due); a rest day when the horse has
 * a week with nothing today. No plan for the horse, or none read yet:
 * "unplanned", and Home names the training Start ride will open with.
 */
export type HomeToday =
  | { kind: "training"; trainingType: string }
  | { kind: "time-off" }
  | { kind: "rest" }
  | { kind: "unplanned" };

export const homeTodayFor = (input: {
  /** Home's horse's streak; absent while the plan or the horses are not in. */
  streak?: Pick<StreakSummary, "hasPlan" | "todayPlanned">;
  timeOff: readonly TimeOffPeriod[];
  horseId?: string;
  today: string;
}): HomeToday => {
  if (!input.streak) return { kind: "unplanned" };
  if (timeOffOn(input.timeOff, input.horseId, input.today)) return { kind: "time-off" };
  const planned = input.streak.todayPlanned[0];
  if (planned) return { kind: "training", trainingType: planned.trainingType };
  return input.streak.hasPlan ? { kind: "rest" } : { kind: "unplanned" };
};

/** The word after TODAY. `startRideTraining` is the training under Start ride, in the same words. */
export const homeTodayLabel = (today: HomeToday, startRideTraining: string) =>
  today.kind === "training"
    ? rideTrainingLabel(today.trainingType) ?? startRideTraining
    : today.kind === "time-off"
      ? "Time off"
      : today.kind === "rest"
        ? "Rest day"
        : startRideTraining;
