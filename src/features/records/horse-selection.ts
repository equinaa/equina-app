import type { HorseRecord } from "../../backend";

/**
 * Which horse is "the" horse. Home shows the last one the rider picked, and a
 * pick is kept: it is saved as the primary horse, so the next launch, Ralf and
 * the account all open on it.
 */

/** The horses a rider can switch to: their own, still in the stable. Shared horses are someone else's to pick. */
export const switchableHorses = (horses: readonly HorseRecord[], userId?: string) =>
  horses.filter((horse) => !horse.archivedAt && (!userId || horse.ownerId === userId));

/** After a fresh list: the horse already picked if it is still there, else the primary, else the first. */
export const selectionAfterLoad = (horses: readonly HorseRecord[], current: string) =>
  horses.some((horse) => horse.id === current)
    ? current
    : horses.find((horse) => horse.isPrimary)?.id ?? horses[0]?.id ?? "";

/**
 * The horse that becomes primary when the primary is archived: the one on
 * screen if it stays, else the first one left. Archiving the primary used to
 * leave none, and Home said "no horse" to a rider who still had one.
 */
export const horseToPromote = (horses: readonly HorseRecord[], archivedId: string, selectedId: string) => {
  const archived = horses.find((horse) => horse.id === archivedId);
  if (!archived?.isPrimary) return null;
  // Only the owner's own horses: a shared horse is someone else's to make primary.
  const left = horses.filter((horse) =>
    horse.id !== archivedId && !horse.archivedAt && horse.ownerId === archived.ownerId
  );
  return left.find((horse) => horse.id === selectedId)?.id ?? left[0]?.id ?? null;
};

/**
 * The list with one horse as its owner's only primary, the way the database's
 * trigger leaves it. Horses shared by someone else keep their own flags.
 */
export const withPrimary = (horses: readonly HorseRecord[], horseId: string): HorseRecord[] => {
  const owner = horses.find((horse) => horse.id === horseId)?.ownerId;
  return horses.map((horse) =>
    horse.ownerId !== owner || horse.isPrimary === (horse.id === horseId)
      ? horse
      : { ...horse, isPrimary: horse.id === horseId }
  );
};

/** The rider's own primary horse in a list, or "" when none is marked. */
export const ownPrimary = (horses: readonly HorseRecord[], userId?: string) =>
  horses.find((horse) => horse.isPrimary && !horse.archivedAt && (!userId || horse.ownerId === userId))?.id ?? "";
