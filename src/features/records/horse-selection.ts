import type { HorseRecord } from "../../backend";

/**
 * Which horse is "the" horse. Home shows the last one the rider picked, and a
 * pick is kept: it is saved as the primary horse, so the next launch, Ralf and
 * the account all open on it.
 */

/** The horses a rider can switch to: their own, still in the stable. Shared horses are someone else's to pick. */
export const switchableHorses = (horses: readonly HorseRecord[], userId?: string) =>
  horses.filter((horse) => !horse.archivedAt && (!userId || horse.ownerId === userId));

/**
 * Whose training week Home reads. Each horse has its own week and streak,
 * so it is Home's horse (`horseId`). `inPlan` is false for a horse that is
 * not one of the rider's own in the stable (shared with them, or archived):
 * it is not in their plan, so Home shows no plan or streak for it. A rider
 * with no horse at all, or only archived ones of their own, has a week that
 * was never per horse: no id, and the week is read whole. A rider whose only
 * horses are shared with them sees one of those on Home, with no plan.
 */
export const trainingScopeFor = (
  horses: readonly HorseRecord[],
  selectedHorseId: string,
  userId?: string
): { horseId?: string; inPlan: boolean } => {
  const own = switchableHorses(horses, userId);
  const selected = horses.find((horse) => horse.id === selectedHorseId);
  const shared = Boolean(selected && userId && selected.ownerId !== userId);
  if (selected && (shared || own.length)) return { horseId: selected.id, inPlan: own.includes(selected) };
  // Only archived horses of their own left: as good as none.
  return own.length ? { horseId: own[0]!.id, inPlan: true } : { inPlan: true };
};

/**
 * Which horses the morning reminders are for, by the same rule as Home's
 * plan card: the rider's own horses in the stable, each with its week. A
 * rider with none reads the week whole (`[]`) while Home shows it; a Home
 * that only ever shows horses shared with them has no plan on it to keep or
 * to switch the reminders off, so they remind of nothing (`null`).
 */
export const reminderHorsesFor = (horses: readonly HorseRecord[], selectedHorseId: string, userId?: string): string[] | null => {
  const own = switchableHorses(horses, userId);
  if (own.length) return own.map((horse) => horse.id);
  return trainingScopeFor(horses, selectedHorseId, userId).inPlan ? [] : null;
};

/**
 * The rider's own horses in the stable as the server has them now, for a
 * save that drops the days of a horse no longer theirs. The list read at
 * launch does not know a horse added since on another device, and would drop
 * its week. A read that fails drops nothing (undefined).
 */
export const ownHorseIdsNow = async (listHorses: () => Promise<readonly HorseRecord[]>, userId?: string) => {
  try {
    return switchableHorses(await listHorses(), userId).map((horse) => horse.id);
  } catch {
    return undefined;
  }
};

/**
 * After a fresh list: the horse already picked if it is still there, else
 * the rider's own primary, else their first own horse, else the first
 * primary, else the first. A horse shared with the rider is primary for its
 * owner, and the list puts primaries first: it could sort ahead of the
 * rider's own and open every launch on someone else's horse.
 */
export const selectionAfterLoad = (horses: readonly HorseRecord[], current: string, userId?: string) =>
  horses.some((horse) => horse.id === current)
    ? current
    : ownPrimary(horses, userId)
      || switchableHorses(horses, userId)[0]?.id
      || (horses.find((horse) => horse.isPrimary)?.id ?? horses[0]?.id ?? "");

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
