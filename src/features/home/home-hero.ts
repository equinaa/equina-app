import type { Discipline } from "../../domain/types";

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
