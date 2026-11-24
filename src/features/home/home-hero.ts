import { timeOffOn, type StreakSummary, type TimeOffPeriod } from "../../domain/training-streak";
import type { Discipline } from "../../domain/types";
import { rideTrainingLabel, rideTrainingTypeById, type RideTrainingType } from "../ride/ride-plan";

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

/**
 * Today's planned training as Start ride opens with it: the app's own type,
 * or one it no longer lists in the words the plan has, so TODAY and the line
 * under Start ride name the same training.
 */
export const plannedTraining = (trainingType: string): RideTrainingType =>
  rideTrainingTypeById(trainingType) ?? { id: trainingType, label: rideTrainingLabel(trainingType) ?? "Training" };

/** The word after TODAY. `startRideTraining` is the training under Start ride, in the same words. */
export const homeTodayLabel = (today: HomeToday, startRideTraining: string) =>
  today.kind === "training"
    ? plannedTraining(today.trainingType).label
    : today.kind === "time-off"
      ? "Time off"
      : today.kind === "rest"
        ? "Rest day"
        : startRideTraining;

/**
 * The hero's title and words on a day with nothing to ride: a rest day in
 * the horse's week, or time off. A training day keeps the discipline's
 * words until there are some for each training (null). "Your streak stays
 * safe" only above a streak Home shows: a horse shared with the rider, or
 * one with no week, has none.
 */
export const heroDayOff = (today: HomeToday, horseName: string | undefined, streakShown: boolean) =>
  today.kind === "rest"
    ? {
        title: "Rest day.",
        body: horseName
          ? `Nothing is planned for ${horseName} today. Rest is part of the plan.`
          : "Nothing is planned for today. Rest is part of the plan."
      }
    : today.kind === "time-off"
      ? { title: "Time off.", body: `${horseName ?? "Your horse"} is off work.${streakShown ? " Your streak stays safe." : ""}` }
      : null;

/**
 * The line under the week on Home's plan card, from the same HomeToday as
 * the hero above it, so time off is never called a rest day. `planned` is
 * today's planned training in words, if any.
 */
export const planCardTodayLine = (input: { ridden: boolean; planned: string | null; today: HomeToday }) =>
  input.ridden
    ? "Today's training is in the journal."
    : input.planned
      ? `Today: ${input.planned}`
      : input.today.kind === "time-off"
        ? "Time off. Nothing to keep today."
        : "Rest day. Nothing to keep today.";

/**
 * What Home's plan card shows for its horse: the week, once the plan and the
 * horse list are both in; a way to try again when either failed (without the
 * horse list Home cannot tell whose week it is, and a list that never
 * arrived used to leave the card's place empty all session); else nothing
 * yet. A horse not in the rider's plan, shared with them, has none.
 */
export const homePlanCard = (input: {
  inPlan: boolean;
  planLoaded: boolean;
  planFailed: boolean;
  horsesLoaded: boolean;
  horsesListed: boolean;
}): "week" | "retry" | "none" => {
  if (!input.inPlan) return "none";
  if (input.planLoaded && input.horsesListed) return "week";
  return (!input.planLoaded && input.planFailed) || (input.horsesLoaded && !input.horsesListed) ? "retry" : "none";
};

/**
 * Whose rides Home's ride summary counts: the horse the hero shows. Until
 * the horse list is in, or when it failed, that is the account's primary
 * horse; then Home's horse. Before, every horse's rides were counted until
 * the list arrived, and all session long when it failed.
 */
export const summaryHorseId = (input: { horsesListed: boolean; homeHorseId?: string; primaryHorseId?: string }) =>
  input.horsesListed ? input.homeHorseId : input.primaryHorseId;

/**
 * Whether Up next shows post-ride care as done for Home's horse (the
 * summary's): only for the horse it was logged for. Care logged on one horse
 * is not another's when Home switches to it. A rider with no horse logs it
 * for no horse, as before. Null: none logged since the last ride.
 */
export const careLoggedOn = (logged: { horseId?: string } | null, horseId: string | undefined) =>
  logged !== null && logged.horseId === horseId;
