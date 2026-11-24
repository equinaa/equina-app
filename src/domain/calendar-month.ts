import { addDays, isoWeekday } from "./training-streak";

/**
 * A month on the wall: its days laid out in weeks, and a first and a last day
 * picked from it.
 *
 * Months are "YYYY-MM" and days "YYYY-MM-DD", the rider's local calendar. As
 * everywhere else, the arithmetic stays in those strings, so there is no time
 * zone to get wrong. Weeks start on Monday, the way the plan and the ride
 * statistics count them.
 */

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
] as const;
const weekdayNames = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const;

/** One letter a column, Monday first. */
export const weekdayInitials = ["M", "T", "W", "T", "F", "S", "S"] as const;

const pad = (value: number) => String(value).padStart(2, "0");
const yearOf = (month: string) => Number(month.slice(0, 4));
const monthIndexOf = (month: string) => Number(month.slice(5, 7)) - 1;

/** The month a day falls in: "2026-11-24" -> "2026-11". */
export const monthOf = (day: string) => day.slice(0, 7);

/** The month `by` months later (earlier when negative); the year rolls over. */
export const addMonths = (month: string, by: number) => {
  const count = yearOf(month) * 12 + monthIndexOf(month) + by;
  return `${Math.floor(count / 12)}-${pad((((count % 12) + 12) % 12) + 1)}`;
};

/** 28 to 31. Day 0 of the next month is the last day of this one. */
export const daysInMonth = (month: string) => new Date(Date.UTC(yearOf(month), monthIndexOf(month) + 1, 0)).getUTCDate();

/** "November 2026". */
export const monthLabel = (month: string) => `${monthNames[monthIndexOf(month)] ?? month} ${yearOf(month)}`;

/** "Tuesday 24 November 2026": a day in full, for a screen reader. */
export const fullDayLabel = (day: string) =>
  `${weekdayNames[isoWeekday(day) - 1]} ${Number(day.slice(8, 10))} ${monthLabel(monthOf(day))}`;

/**
 * The month as rows of seven, Monday first. A cell is a day, or null before
 * the 1st and after the last day. Four rows (a February that starts on a
 * Monday) to six.
 */
export const monthGrid = (month: string): (string | null)[][] => {
  const first = `${month}-01`;
  const cells: (string | null)[] = Array.from({ length: isoWeekday(first) - 1 }, () => null);
  const days = daysInMonth(month);
  for (let offset = 0; offset < days; offset += 1) cells.push(addDays(first, offset));
  while (cells.length % 7 !== 0) cells.push(null);
  const rows: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) rows.push(cells.slice(index, index + 7));
  return rows;
};

/**
 * A first and a last day, and which of the two the next tap sets. They are
 * always both there (a one-day period has them equal), so what is on screen
 * can be saved at any point.
 */
export type RangePick = { startsOn: string; endsOn: string; picking: "start" | "end" };

/**
 * What a range may be: no day before `min`, a first day no later than
 * `maxStart`, a last day at most `maxSpanDays` after the first. A limit left
 * out does not apply.
 */
export type RangeLimits = { min?: string; maxStart?: string; maxSpanDays?: number };

/** The last day a tap can land on right now. Null when nothing limits it. */
export const lastPickableDay = (range: RangePick, limits: RangeLimits): string | null => {
  if (range.picking === "end") return limits.maxSpanDays === undefined ? null : addDays(range.startsOn, limits.maxSpanDays);
  return limits.maxStart ?? null;
};

/**
 * Whether a tap on this day does something. A day that would break a limit is
 * not offered, so nothing is picked that could not be saved. While the last
 * day is being picked, a day before the first is still allowed: it starts the
 * range again from there.
 */
export const canPickRangeDay = (range: RangePick, day: string, limits: RangeLimits): boolean => {
  if (limits.min !== undefined && day < limits.min) return false;
  const restarts = range.picking === "start" || day < range.startsOn;
  if (restarts) return limits.maxStart === undefined || day <= limits.maxStart;
  return limits.maxSpanDays === undefined || day <= addDays(range.startsOn, limits.maxSpanDays);
};

/**
 * The range after a tap on a day. The first tap sets the first day (and the
 * last with it, so it is a one-day period until the next tap); the second sets
 * the last day. A tap before the first day starts again from that day, and a
 * tap on the first day itself keeps the one-day period. After the last day is
 * set, the next tap starts a new range. A day that is not allowed changes
 * nothing.
 */
export const pickRangeDay = (range: RangePick, day: string, limits: RangeLimits = {}): RangePick => {
  if (!canPickRangeDay(range, day, limits)) return range;
  if (range.picking === "start" || day < range.startsOn) return { startsOn: day, endsOn: day, picking: "end" };
  return { startsOn: range.startsOn, endsOn: day, picking: "start" };
};

/**
 * Where a day sits in the range: its only day, its first, its last, one in
 * between, or (null) outside it.
 */
export const rangePosition = (
  range: Pick<RangePick, "startsOn" | "endsOn">,
  day: string
): "single" | "start" | "end" | "inside" | null => {
  if (day < range.startsOn || day > range.endsOn) return null;
  if (range.startsOn === range.endsOn) return "single";
  if (day === range.startsOn) return "start";
  if (day === range.endsOn) return "end";
  return "inside";
};
