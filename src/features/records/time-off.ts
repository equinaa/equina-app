import type { HorseTimeOff } from "../../backend";
import { addDays } from "../../domain/training-streak";
import { shortDayLabel } from "../../domain/local-day";

/**
 * Why a horse is off work. The ids are what the database keeps
 * (horse_time_off.kind, shape-checked, so a new kind needs no migration).
 */
export const timeOffKinds = [
  { id: "rest", label: "Rest" },
  { id: "break", label: "Break" },
  { id: "stall-rest", label: "Stall rest" },
  { id: "injury", label: "Injury" },
  { id: "vet", label: "Vet treatment" },
  { id: "other", label: "Other" }
] as const;

export const timeOffLabel = (kind: string) =>
  timeOffKinds.find((entry) => entry.id === kind)?.label
  ?? `${kind.charAt(0).toUpperCase()}${kind.slice(1).replace(/-/g, " ")}`;

/** How far back a period can start, today included; the database allows 8 days for time zones. */
export const timeOffBackDays = 7;
/** The longest period, in days after the first. */
export const timeOffMaxSpan = 366;

/** "25 Oct – 8 Nov", or "25 Oct" for one day. */
export const timeOffRange = (period: Pick<HorseTimeOff, "startsOn" | "endsOn">) => {
  const start = shortDayLabel(period.startsOn) ?? period.startsOn;
  return period.startsOn === period.endsOn ? start : `${start} – ${shortDayLabel(period.endsOn) ?? period.endsOn}`;
};

/** Over before yesterday: it decided past days and stays as it was. */
export const timeOffIsOver = (period: Pick<HorseTimeOff, "endsOn">, today: string) => period.endsOn < addDays(today, -1);

const enteredWithinADay = (period: Pick<HorseTimeOff, "createdAt">, now: number) =>
  Boolean(period.createdAt) && now - Date.parse(period.createdAt as string) < 86_400_000;

/**
 * What can still be done to a period, as the database allows it:
 * - "remove": not started yet, or entered within the last day (a period put
 *   on the wrong horse is taken back whole);
 * - "end": under way -- the horse is back in work, so it ends yesterday and
 *   the days it covered stay covered;
 * - "none": over, or nothing left to end.
 */
export const timeOffAction = (
  period: Pick<HorseTimeOff, "startsOn" | "endsOn" | "createdAt">,
  today: string,
  now = Date.now()
): "remove" | "end" | "none" => {
  const yesterday = addDays(today, -1);
  if (period.startsOn >= yesterday || enteredWithinADay(period, now)) return "remove";
  if (period.endsOn < yesterday) return "none";
  return period.endsOn > yesterday ? "end" : "none";
};

/** What stops a period from being saved, in the rider's words. Null when it can be. */
export const timeOffProblem = (input: { kind: string; startsOn: string; endsOn: string; note?: string }, today: string) => {
  if (!input.kind) return "Pick why the horse is off.";
  if (input.startsOn < addDays(today, -timeOffBackDays)) return `Time off can start up to ${timeOffBackDays} days back.`;
  if (input.endsOn < input.startsOn) return "The last day comes after the first.";
  if (input.endsOn > addDays(input.startsOn, timeOffMaxSpan)) return "Time off can last up to a year.";
  if (input.kind === "other" && !input.note?.trim()) return "Add a note to say why.";
  if ((input.note?.length ?? 0) > 500) return "Keep the note under 500 characters.";
  return null;
};

/**
 * The periods worth showing: to come, under way, and those that ended in the
 * last week -- a period entered for days already gone shows up too, so a
 * mistake can be seen and taken back. Soonest first.
 */
export const currentTimeOff = (periods: readonly HorseTimeOff[], horseId: string, today: string) =>
  periods
    .filter((period) => period.horseId === horseId && period.endsOn >= addDays(today, -timeOffBackDays))
    .sort((left, right) => left.startsOn.localeCompare(right.startsOn));
