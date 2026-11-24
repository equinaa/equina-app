import type { HorseRecord } from "../backend/contracts";
import type { Discipline } from "./types";

/**
 * The words a rider reads for values the database stores.
 *
 * Only the label changes here, never the value. 'trail' is a value of the
 * shared `discipline` enum and 'unknown' is allowed by a check constraint on
 * `horses.sex`; every installed build keeps sending both, so renaming either
 * in the database would make those builds fail to save. The app's own key
 * "Trail" (pictures, Club group, default training) stays for the same reason:
 * it is lower-cased into the stored value.
 */
const disciplineLabels: Record<Discipline, string> = {
  dressage: "Dressage",
  jumping: "Jumping",
  eventing: "Eventing",
  western: "Western",
  endurance: "Endurance",
  trail: "Leisure"
};

const capitalised = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

/** A discipline as the rider reads it. Takes the stored value ("trail") or the app's key ("Trail"). */
export function disciplineLabel(value: string): string;
export function disciplineLabel(value?: string): string | undefined;
export function disciplineLabel(value?: string): string | undefined {
  if (!value) return undefined;
  return disciplineLabels[value.toLowerCase() as Discipline] ?? capitalised(value);
}

type HorseSex = NonNullable<HorseRecord["sex"]>;

/** The choices of the horse editor. 'unknown' is what a new horse starts on. */
export const horseSexOptionLabels: Record<HorseSex, string> = {
  mare: "Mare",
  gelding: "Gelding",
  stallion: "Stallion",
  unknown: "Not Sure"
};

/** A horse's sex for a header line. A horse whose sex is not known shows none. */
export const horseSexLabel = (sex?: HorseRecord["sex"]): string =>
  !sex || sex === "unknown" ? "" : horseSexOptionLabels[sex];
