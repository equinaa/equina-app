/**
 * The calendar day a person is living in, on this device.
 *
 * Days used to be read off toISOString(), which is UTC. A rider in Romania
 * who finished at 01:30 on a Monday had the ride filed under Sunday, in the
 * week before; a rider in Brazil who rode at 22:00 had it filed under
 * tomorrow. Rides, "today" and the weeks they fall in are the rider's local
 * calendar, so they are read with the local Date getters.
 *
 * Arithmetic between two such days (weeks, months, days until a due date)
 * stays in the YYYY-MM-DD strings, which have no time zone to get wrong.
 */

const pad = (value: number) => String(value).padStart(2, "0");

/** YYYY-MM-DD of an instant (a timestamp, an ISO string or a Date) in local time. Null if it is not one. */
export const localDayOf = (value: number | string | Date): string | null => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/** Today on this device, as YYYY-MM-DD. */
export const localToday = (now: number | Date = Date.now()): string => localDayOf(now) as string;

/** Local midnight on the first day of the month before `now`'s, as an instant. */
export const startOfPreviousMonth = (now: number | Date = Date.now()): Date => {
  const date = now instanceof Date ? now : new Date(now);
  return new Date(date.getFullYear(), date.getMonth() - 1, 1);
};

const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

/** "Fri 23 Oct · 14:50" in local time, the way a journal line reads. Null if it is not an instant. */
export const localMomentLabel = (value: number | string | Date): string | null => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return `${weekdayNames[date.getDay()]} ${date.getDate()} ${monthNames[date.getMonth()]} · ${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** "1 Sep": a local day, short. Null if it is not one. */
export const shortDayLabel = (day: string): string | null => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!match) return null;
  return `${Number(match[3])} ${monthNames[Number(match[2]) - 1]}`;
};
