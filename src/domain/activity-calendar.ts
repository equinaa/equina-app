import { addMonths } from "./calendar-month";
import { localDayOf } from "./local-day";
import { addDays, isoWeekday } from "./training-streak";

/**
 * How far back an activity can be added by hand: today and the 29 days
 * before it. The server takes a logged activity that ended up to 31 days
 * (744 hours) ago (ride_entries_dates_plausible). Counted in local days, a
 * window of 31 could reach past that when the clocks went back inside it (a
 * local day of 25 hours); 30 always leaves a day to spare.
 */
export const activityLogWindowDays = 30;

/** The oldest day an activity can be added for, as a local YYYY-MM-DD. */
export const firstLoggableDay = (today: string) => addDays(today, -(activityLogWindowDays - 1));

/** Whether a day can take a new activity: "open", still ahead, or past the window. */
export type DayLogState = "open" | "future" | "tooOld";

export const logStateOn = (day: string, today: string): DayLogState => {
  if (day > today) return "future";
  if (day < firstLoggableDay(today)) return "tooOld";
  return "open";
};

/** Monday to Sunday of the week a day falls in. */
export const weekOf = (day: string): string[] => {
  const monday = addDays(day, -(isoWeekday(day) - 1));
  return Array.from({ length: 7 }, (_, index) => addDays(monday, index));
};

/**
 * The day an activity belongs to: the local day it started, as the rider
 * chose it in Add activity. A ride past midnight stays on the evening it began.
 */
export const activityDayOf = (entry: { startedAt: string; completedAt: string }): string | null =>
  localDayOf(entry.startedAt) ?? localDayOf(entry.completedAt);

/** Activities grouped by their day, each day's in the order they started. */
export const activitiesByDay = <T extends { startedAt: string; completedAt: string }>(
  entries: readonly T[]
): Map<string, T[]> => {
  const days = new Map<string, T[]>();
  for (const entry of entries) {
    const day = activityDayOf(entry);
    if (!day) continue;
    const list = days.get(day) ?? [];
    list.push(entry);
    days.set(day, list);
  }
  for (const list of days.values()) list.sort((left, right) => Date.parse(left.startedAt) - Date.parse(right.startedAt));
  return days;
};

const localMidnight = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, date ?? 1);
};

/**
 * A month as instants: from its first local midnight up to, not including,
 * the next month's. Activities are read by when they started.
 */
export const monthSpan = (month: string): { from: string; to: string } => ({
  from: localMidnight(`${month}-01`).toISOString(),
  to: localMidnight(`${addMonths(month, 1)}-01`).toISOString()
});

/**
 * Whether the journal, read back to `journalSince`, already holds every
 * activity of a month; an older month is read on its own.
 */
export const journalCoversMonth = (month: string, journalSince: Date) =>
  Date.parse(monthSpan(month).from) >= journalSince.getTime();

const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;
const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
] as const;

/** "Thursday 27 November": the heading over a day's activities. */
export const dayHeading = (day: string) =>
  `${weekdayNames[isoWeekday(day) - 1]} ${Number(day.slice(8, 10))} ${monthNames[Number(day.slice(5, 7)) - 1]}`;

/** "Wed 25": a day of the month shown just above it. */
export const shortWeekdayDate = (day: string) =>
  `${(weekdayNames[isoWeekday(day) - 1] ?? "").slice(0, 3)} ${Number(day.slice(8, 10))}`;

/**
 * How far ahead an activity can be scheduled: about three months. The server
 * takes a plan up to 92 days out (planned_activities_dates_guard).
 */
export const activityScheduleDaysAhead = 90;

/** The furthest day an activity can be scheduled for. */
export const lastSchedulableDay = (today: string) => addDays(today, activityScheduleDaysAhead);

/**
 * What a day can take: an activity logged as done ("log"), one scheduled
 * ahead ("schedule"), or nothing new (too old, too far).
 */
export type DayUse = "log" | "schedule" | "tooOld" | "tooFar";

export const dayUseOn = (day: string, today: string): DayUse => {
  if (day < firstLoggableDay(today)) return "tooOld";
  if (day > lastSchedulableDay(today)) return "tooFar";
  return day > today ? "schedule" : "log";
};

/** Whether a day can be picked in Add activity, to log or to schedule. */
export const pickableDay = (day: string, today: string) => {
  const use = dayUseOn(day, today);
  return use === "log" || use === "schedule";
};
