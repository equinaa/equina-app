import type { HorseTimeOff, RideEnd, TrainingPlan, TrainingPlanDay } from "../backend/contracts";
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
 * Each horse has its own week and its own streak. The plan is stored as one
 * week for the rider, every entry with its horse, and a horse's week is the
 * entries that carry its id (`planForHorse`); its rides are the rides on it
 * (`ridesForHorse`). A ride on one horse never covers another horse's
 * planned day. An entry or a ride without a horse counts for no horse; only
 * a rider with no horse at all reads the week unscoped, every entry and
 * every ride together, as it always was.
 *
 * A planned ride on a horse that is off that day (rest, break, stall rest,
 * injury, vet treatment) is not due: it neither needs a ride nor breaks the
 * streak.
 *
 * Days are the rider's local calendar days, as YYYY-MM-DD. The arithmetic
 * between them is done in UTC on those strings, which have no time zone.
 */

export type PlanVersion = Pick<TrainingPlan, "effectiveFrom" | "days">;
export type TimeOffPeriod = Pick<HorseTimeOff, "horseId" | "kind" | "startsOn" | "endsOn">;

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

/** What the plan says for a day: each horse and its training. Empty on a rest day. */
export const plannedOn = (versions: readonly PlanVersion[], day: string): TrainingPlanDay[] =>
  planOn(versions, day)?.days.filter((entry) => entry.weekday === isoWeekday(day)) ?? [];

/** The time off a horse is on that day, if any. */
export const timeOffOn = (periods: readonly TimeOffPeriod[], horseId: string | undefined, day: string) =>
  horseId ? periods.find((period) => period.horseId === horseId && period.startsOn <= day && day <= period.endsOn) ?? null : null;

/** The planned rides that still need doing: those whose horse is not off that day. */
export const dueOn = (versions: readonly PlanVersion[], periods: readonly TimeOffPeriod[], day: string) =>
  plannedOn(versions, day).filter((entry) => !timeOffOn(periods, entry.horseId, day));

/**
 * Whether a plan entry or a ride is the horse's. No horse to scope by (a
 * rider with no horse at all) takes everything; otherwise only what carries
 * that horse's id, so an entry or a ride without a horse counts for none.
 */
export const belongsTo = (item: { horseId?: string }, horseId: string | undefined) =>
  horseId === undefined || item.horseId === horseId;

/** The items of one horse; all of them for a rider with no horse. */
export const ofHorse = <T extends { horseId?: string }>(items: readonly T[], horseId: string | undefined): T[] =>
  items.filter((item) => belongsTo(item, horseId));

/**
 * One horse's training week, version by version. Its streak starts with the
 * first version that planned it, so the versions before are left out; a
 * later version without it stays, and means it was taken out of the plan
 * from that day.
 */
export const planForHorse = (versions: readonly PlanVersion[], horseId: string | undefined): PlanVersion[] => {
  if (horseId === undefined) return [...versions];
  const scoped = [...versions]
    .sort((left, right) => left.effectiveFrom.localeCompare(right.effectiveFrom))
    .map((version) => ({ ...version, days: ofHorse(version.days, horseId) }));
  const first = scoped.findIndex((version) => version.days.length > 0);
  return first < 0 ? [] : scoped.slice(first);
};

/** When each ride on one horse ended; every ride for a rider with no horse. */
export const ridesForHorse = (rides: readonly RideEnd[], horseId: string | undefined) =>
  ofHorse(rides, horseId).map((ride) => ride.completedAt);

/**
 * The plan to save after editing one horse's week: that horse's days from
 * the editor, every other horse's as the plan has them now. With the rider's
 * own horses in the stable (`activeHorseIds`), the days of a horse that is no
 * longer one of them are dropped; without them, nothing is. They are read as
 * the plan is saved: a list read earlier may not know a horse added since on
 * another device, and would drop its week. Opened without a horse (a rider
 * with none), the editor's days are the plan.
 */
export const mergeHorseWeek = (
  current: readonly TrainingPlanDay[],
  edited: readonly TrainingPlanDay[],
  horseId: string | undefined,
  activeHorseIds?: readonly string[]
): TrainingPlanDay[] => {
  if (horseId === undefined) return [...edited];
  const kept = current.filter((entry) =>
    entry.horseId !== horseId && (!activeHorseIds || !entry.horseId || activeHorseIds.includes(entry.horseId))
  );
  return [...kept, ...edited.filter((entry) => entry.horseId === horseId)];
};

/** The local days the rider rode on, from when each ride ended. */
export const rideDays = (completedAt: readonly string[]) =>
  new Set(completedAt.map((value) => localDayOf(value)).filter((day): day is string => day !== null));

export type WeekDayState = "ridden" | "missed" | "planned" | "off" | "rest";

export type WeekDay = {
  day: string;
  weekday: number;
  /** Every horse the plan has that day, due or not. */
  planned: TrainingPlanDay[];
  /** The ones still to ride: their horse is not off. */
  due: TrainingPlanDay[];
  state: WeekDayState;
  isToday: boolean;
};

/**
 * Monday to Sunday of the week holding `today`. A ride shows on any day; a
 * planned day before today without one is missed; today and the days after
 * are still to come; a planned day whose horses are all off is off.
 */
export const trainingWeek = (
  versions: readonly PlanVersion[],
  ridden: ReadonlySet<string>,
  today: string,
  periods: readonly TimeOffPeriod[] = []
): WeekDay[] => {
  const monday = addDays(today, 1 - isoWeekday(today));
  return Array.from({ length: 7 }, (_, index) => {
    const day = addDays(monday, index);
    const planned = plannedOn(versions, day);
    const due = planned.filter((entry) => !timeOffOn(periods, entry.horseId, day));
    const state: WeekDayState = ridden.has(day)
      ? "ridden"
      : due.length
        ? day < today ? "missed" : "planned"
        : planned.length ? "off" : "rest";
    return { day, weekday: index + 1, planned, due, state, isToday: day === today };
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
  /** Today's planned rides still to do: their horse is not off. */
  todayPlanned: TrainingPlanDay[];
  todayRidden: boolean;
  week: WeekDay[];
  previousMilestone: number;
  nextMilestone: number;
};

export const trainingStreak = (
  versions: readonly PlanVersion[],
  completedAt: readonly string[],
  today: string,
  periods: readonly TimeOffPeriod[] = []
): StreakSummary => {
  const ridden = rideDays(completedAt);
  const week = trainingWeek(versions, ridden, today, periods);
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
      } else if (day !== today && dueOn(versions, periods, day).length) {
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
    todayPlanned: dueOn(versions, periods, today),
    todayRidden: ridden.has(today),
    week,
    previousMilestone,
    nextMilestone
  };
};

/**
 * One horse's streak: its own week and the rides on it. A horse's week with
 * no day in it is no plan: the horse was taken out of it, and Home offers to
 * plan one again. A rider with no horse reads the week whole, exactly as it
 * always was: a week of rest days is still their plan.
 */
export const trainingStreakFor = (
  versions: readonly PlanVersion[],
  rides: readonly RideEnd[],
  horseId: string | undefined,
  today: string,
  periods: readonly TimeOffPeriod[] = []
): StreakSummary => {
  const week = planForHorse(versions, horseId);
  const streak = trainingStreak(week, ridesForHorse(rides, horseId), today, periods);
  return horseId === undefined ? streak : { ...streak, hasPlan: Boolean(planOn(week, today)?.days.length) };
};

/**
 * The planned days in the next `count` days from `today` on, for the
 * reminders, with the rides still due: one reminder a day for every horse.
 * A horse already ridden that day, a horse that is off, and a horse that is
 * no longer the rider's own (`activeHorses`) are skipped. With no horses,
 * the week is read unscoped: any ride that day covers it.
 */
export const upcomingPlannedDays = (
  versions: readonly PlanVersion[],
  rides: readonly RideEnd[],
  today: string,
  count: number,
  periods: readonly TimeOffPeriod[] = [],
  activeHorses: ReadonlySet<string> = new Set()
): Array<{ day: string; planned: TrainingPlanDay[] }> => {
  const scoped = activeHorses.size > 0;
  const riddenBy = new Map<string | undefined, Set<string>>();
  const ridden = (horseId: string | undefined) => {
    let days = riddenBy.get(horseId);
    if (!days) {
      days = rideDays(ridesForHorse(rides, horseId));
      riddenBy.set(horseId, days);
    }
    return days;
  };
  const days: Array<{ day: string; planned: TrainingPlanDay[] }> = [];
  for (let offset = 0; offset < count; offset += 1) {
    const day = addDays(today, offset);
    const planned = scoped
      ? dueOn(versions, periods, day).filter((entry) =>
          entry.horseId !== undefined && activeHorses.has(entry.horseId) && !ridden(entry.horseId).has(day)
        )
      : ridden(undefined).has(day) ? [] : dueOn(versions, periods, day);
    if (planned.length) days.push({ day, planned });
  }
  return days;
};
