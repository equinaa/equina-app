import type { HorseTimelineRecord } from "../backend/contracts";

/**
 * Turning horse records into a care schedule.
 *
 * The record table already carries everything this needs: what happened
 * (`occurredOn`), what it was (`recordType`), and when it is next due
 * (`dueOn`). What was missing is derivation. The stored `status` column
 * defaults to "current" and nothing ever moves it, so a vaccination that
 * lapsed in March still reports itself as current. Urgency is computed here,
 * from the due date, every time it is read -- there is no state to drift.
 *
 * Cadence lives in the record's `details`, which already exists as a jsonb
 * object. The most recent record of a (horse, type) pair carries the interval
 * forward: log the farrier, and the next visit is scheduled from that one.
 */

export type CareType = Extract<
  HorseTimelineRecord["recordType"],
  "vaccination" | "dental" | "farrier" | "vet" | "care"
>;

export type CareUrgency = "overdue" | "today" | "soon" | "scheduled";

/** Record types that recur. A passport or a lab result happens once. */
export const careTypes: readonly CareType[] = ["farrier", "vaccination", "dental", "vet", "care"];

export const isCareType = (value: HorseTimelineRecord["recordType"]): value is CareType =>
  (careTypes as readonly string[]).includes(value);

/**
 * Starting cadences, in days. These are the intervals riders and vets reach
 * for most often, not medical advice -- every one is editable per record, and
 * a horse in work is shod on a different cycle than one at grass.
 */
export const defaultCadenceDays: Record<CareType, number> = {
  farrier: 42,
  vaccination: 365,
  dental: 365,
  vet: 365,
  care: 90
};

export const careTypeLabels: Record<CareType, string> = {
  farrier: "Farrier",
  vaccination: "Vaccination",
  dental: "Dental",
  vet: "Vet check",
  care: "Routine care"
};

/** How close a due date has to be before it is worth surfacing. */
export const soonWindowDays = 14;

const MS_PER_DAY = 86_400_000;

/** Parse a YYYY-MM-DD date as UTC midnight. Returns null if it is not one. */
export const parseCareDate = (value: string | undefined): number | null => {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? null : parsed;
};

export const formatCareDate = (timestamp: number): string =>
  new Date(timestamp).toISOString().slice(0, 10);

/**
 * Whole days from `today` until `dueOn`. Negative when overdue.
 * Both sides are normalised to UTC midnight so a rider in Lisbon and one in
 * Helsinki agree on what "due today" means for the same horse.
 */
export const daysUntilDue = (dueOn: string | undefined, today: string): number | null => {
  const due = parseCareDate(dueOn);
  const now = parseCareDate(today);
  if (due === null || now === null) return null;
  return Math.round((due - now) / MS_PER_DAY);
};

export const careUrgency = (dueOn: string | undefined, today: string): CareUrgency | null => {
  const days = daysUntilDue(dueOn, today);
  if (days === null) return null;
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  if (days <= soonWindowDays) return "soon";
  return "scheduled";
};

/** The cadence stored on a record, if it carries a usable one. */
export const cadenceOf = (record: HorseTimelineRecord): number | null => {
  const raw = (record.details as { cadenceDays?: unknown }).cadenceDays;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  const days = Math.round(raw);
  return days > 0 && days <= 3650 ? days : null;
};

/** Add a cadence to a date, as YYYY-MM-DD. */
export const nextDueOn = (occurredOn: string, cadenceDays: number): string | null => {
  const start = parseCareDate(occurredOn);
  if (start === null || !Number.isFinite(cadenceDays) || cadenceDays <= 0) return null;
  return formatCareDate(start + Math.round(cadenceDays) * MS_PER_DAY);
};

export type CareItem = {
  record: HorseTimelineRecord;
  careType: CareType;
  dueOn: string;
  daysUntil: number;
  urgency: CareUrgency;
  cadenceDays: number | null;
};

/**
 * The schedule: one entry per (horse, care type), taken from the record with
 * the furthest due date for that pair.
 *
 * Taking the latest rather than every record is what stops a horse shod nine
 * times this year from filling the screen with nine farrier lines. Logging a
 * visit supersedes the appointment it satisfies.
 */
export const buildCareSchedule = (
  records: readonly HorseTimelineRecord[],
  today: string
): CareItem[] => {
  const latest = new Map<string, CareItem>();

  for (const record of records) {
    if (record.status === "archived") continue;
    if (!isCareType(record.recordType)) continue;

    const urgency = careUrgency(record.dueOn, today);
    if (urgency === null || !record.dueOn) continue;

    const daysUntil = daysUntilDue(record.dueOn, today);
    if (daysUntil === null) continue;

    const key = `${record.horseId}:${record.recordType}`;
    const item: CareItem = {
      record,
      careType: record.recordType,
      dueOn: record.dueOn,
      daysUntil,
      urgency,
      cadenceDays: cadenceOf(record)
    };

    const held = latest.get(key);
    if (!held || item.dueOn > held.dueOn) latest.set(key, item);
  }

  return [...latest.values()].sort(
    (left, right) => left.dueOn.localeCompare(right.dueOn) || left.careType.localeCompare(right.careType)
  );
};

/** Everything needing attention now: overdue first, then today, then soon. */
export const needsAttention = (schedule: readonly CareItem[]): CareItem[] =>
  schedule.filter((item) => item.urgency !== "scheduled");

/**
 * What logging an item as done produces. The cadence carries forward, so the
 * next appointment is scheduled from the day it actually happened -- a
 * farrier visit two weeks late moves the whole cycle, which is what happens
 * to the horse.
 */
export const completionFor = (
  item: CareItem,
  completedOn: string
): { occurredOn: string; dueOn?: string; cadenceDays: number } | null => {
  if (parseCareDate(completedOn) === null) return null;
  const cadenceDays = item.cadenceDays ?? defaultCadenceDays[item.careType];
  const dueOn = nextDueOn(completedOn, cadenceDays) ?? undefined;
  return { occurredOn: completedOn, dueOn, cadenceDays };
};

/** Plain-language distance, for the one place the rider reads it. */
export const describeDue = (item: CareItem): string => {
  if (item.daysUntil < -1) return `${Math.abs(item.daysUntil)} days overdue`;
  if (item.daysUntil === -1) return "1 day overdue";
  if (item.daysUntil === 0) return "Due today";
  if (item.daysUntil === 1) return "Due tomorrow";
  return `Due in ${item.daysUntil} days`;
};
