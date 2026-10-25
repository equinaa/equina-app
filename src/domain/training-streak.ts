import type { TrainingPlan, TrainingPlanDay } from "../backend/contracts";
import { localDayOf } from "./local-day";

/**
 * The training streak: days of training in a row, counted against the
 * rider's own plan.
 *
 * A horse needs rest days, so this is not "every day in a row". A planned day
 * needs a ride; a day off the plan never breaks the streak; a ride on a day
 * off the plan still adds one. Today is still in progress until it ends, so a
 * planned day that has not been ridden yet breaks nothing.
 *
 * The streak starts with the plan: before the rider had one there was nothing
 * to keep, and counting old rides would hand out a streak nobody built.
 * Changing the plan applies from that day on (each version has its
 * effectiveFrom), so a change never breaks or rebuilds a week already ridden.
 *
 * Days are the rider's local calendar days, as YYYY-MM-DD. The arithmetic
 * between them is done in UTC on those strings, which have no time zone.
 */

export type PlanVersion = Pick<TrainingPlan, "effectiveFrom" | "days">;

const MS_PER_DAY = 86_400_000;
const parseDay = (day: string) => Date.parse(`${day}T00:00:00Z`);
const toDay = (timestamp: number) => new Date(timestamp).toISOString().slice(0, 10);

export const addDays = (day: string, days: number) => toDay(parseDay(day) + days * MS_PER_DAY);

/** 1 = Monday ... 7 = Sunday, the way the plan names its days. */
export const isoWeekday = (day: string) => ((new Date(parseDay(day)).getUTCDay() + 6) % 7) + 1;

/** The version in force on a day: the latest one that had started by then. */
export const planOn = (versions: readonly PlanVersion[], day: string): PlanVersion | null => {
  let current: PlanVersion | null = null;
  for (const version of versions) {
    if (version.effectiveFrom <= day && (!current || version.effectiveFrom >= current.effectiveFrom)) current = version;
  }
  return current;
};

/** What the plan says for a day: the training and horse, or null for a day off. */
export const plannedOn = (versions: readonly PlanVersion[], day: string): TrainingPlanDay | null =>
  planOn(versions, day)?.days.find((entry) => entry.weekday === isoWeekday(day)) ?? null;

/** The local days the rider rode on, from when each ride ended. */
export const rideDays = (completedAt: readonly string[]) =>
  new Set(completedAt.map((value) => localDayOf(value)).filter((day): day is string => day !== null));

export type WeekDayState = "ridden" | "missed" | "planned" | "rest";

export type WeekDay = {
  day: string;
  weekday: number;
  planned: TrainingPlanDay | null;
  state: WeekDayState;
  isToday: boolean;
};

/**
 * Monday to Sunday of the week holding `today`. A ride shows on any day; a
 * planned day before today without one is missed; today and the days after
 * are still to come.
 */
export const trainingWeek = (versions: readonly PlanVersion[], ridden: ReadonlySet<string>, today: string): WeekDay[] => {
  const monday = addDays(today, 1 - isoWeekday(today));
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    const planned = plannedOn(versions, day);
    const state: WeekDayState = ridden.has(day)
      ? "ridden"
      : planned
        ? day < today ? "missed" : "planned"
        : "rest";
    return { day, weekday: index + 1, planned, state, isToday: day === today };
  });
};

/** Milestones in training days. Riding four days a week, 100 is about six months. */
export const streakMilestones = [5, 10, 25, 50, 100, 150, 250, 365, 500, 1000] as const;

export type StreakSummary = {
  hasPlan: boolean;
  /** Training days in the current streak. */
  current: number;
  best: number;
  /** The first ride of the current streak. */
  startedOn?: string;
  todayPlanned: TrainingPlanDay | null;
  todayRidden: boolean;
  week: WeekDay[];
  previousMilestone: number;
  nextMilestone: number;
};

export const trainingStreak = (versions: readonly PlanVersion[], completedAt: readonly string[], today: string): StreakSummary => {
  const ridden = rideDays(completedAt);
  const week = trainingWeek(versions, ridden, today);
  const start = versions.reduce<string | null>(
    (earliest, version) => (!earliest || version.effectiveFrom < earliest ? version.effectiveFrom : earliest),
    null
  );

  let current = 0;
  let best = 0;
  let startedOn: string | undefined;
  if (start && start <= today) {
    for (let day = start; day <= today; day = addDays(day, 1)) {
      if (ridden.has(day)) {
        if (current === 0) startedOn = day;
        current += 1;
        best = Math.max(best, current);
      } else if (day !== today && plannedOn(versions, day)) {
        current = 0;
        startedOn = undefined;
      }
    }
  }

  const nextMilestone = streakMilestones.find((milestone) => milestone > current) ?? current + 1;
  const previousMilestone = [...streakMilestones].reverse().find((milestone) => milestone <= current) ?? 0;
  return {
    hasPlan: Boolean(planOn(versions, today)),
    current,
    best,
    ...(startedOn ? { startedOn } : {}),
    todayPlanned: plannedOn(versions, today),
    todayRidden: ridden.has(today),
    week,
    previousMilestone,
    nextMilestone
  };
};

/** The next `count` planned days from `today` on, for the reminders. Days already ridden are skipped. */
export const upcomingPlannedDays = (
  versions: readonly PlanVersion[],
  completedAt: readonly string[],
  today: string,
  count: number
): Array<{ day: string; planned: TrainingPlanDay }> => {
  const ridden = rideDays(completedAt);
  const days: Array<{ day: string; planned: TrainingPlanDay }> = [];
  for (let offset = 0; offset < count; offset += 1) {
    const day = addDays(today, offset);
    const planned = plannedOn(versions, day);
    if (planned && !ridden.has(day)) days.push({ day, planned });
  }
  return days;
};
