import assert from "node:assert/strict";
import type { HorseRecord } from "../src/backend/contracts";
import { horseToPromote, ownPrimary, selectionAfterLoad, switchableHorses, withPrimary } from "../src/features/records/horse-selection";

// Which horse is the horse: Home shows the last one picked, and the pick is
// kept as the primary horse.

const horse = (id: string, patch: Partial<HorseRecord> = {}): HorseRecord => ({
  id,
  ownerId: "rider-a",
  name: id.charAt(0).toUpperCase() + id.slice(1),
  isPrimary: false,
  createdAt: "2026-10-01T00:00:00Z",
  updatedAt: "2026-10-01T00:00:00Z",
  ...patch
} as HorseRecord);

const daimon = horse("daimon", { isPrimary: true });
const luna = horse("luna");
const shared = horse("shared", { ownerId: "rider-b" });
const retired = horse("retired", { archivedAt: "2026-10-20T00:00:00Z" });

{
  assert.deepEqual(
    switchableHorses([daimon, luna, shared, retired], "rider-a").map((entry) => entry.id),
    ["daimon", "luna"],
    "Only the rider's own horses still in the stable can be picked as the main horse."
  );
  assert.equal(switchableHorses([daimon, shared]).length, 2, "Before the account is known, nothing is filtered out by owner.");
}

{
  assert.equal(selectionAfterLoad([daimon, luna], "luna"), "luna", "A refresh keeps the horse the rider picked.");
  assert.equal(selectionAfterLoad([daimon, luna], ""), "daimon", "A first load opens on the primary horse.");
  assert.equal(selectionAfterLoad([luna, daimon], "gone"), "daimon", "A picked horse that left falls back to the primary.");
  assert.equal(selectionAfterLoad([luna], ""), "luna", "No primary: the first horse.");
  assert.equal(selectionAfterLoad([], "luna"), "", "No horses: nothing picked.");
}

{
  assert.equal(horseToPromote([daimon, luna], "daimon", "daimon"), "luna", "Archiving the primary makes the other horse primary.");
  assert.equal(
    horseToPromote([daimon, luna, horse("nova")], "daimon", "nova"),
    "nova",
    "The horse on screen is the one promoted, when it stays."
  );
  assert.equal(horseToPromote([daimon, luna], "luna", "luna"), null, "Archiving another horse leaves the primary alone.");
  assert.equal(horseToPromote([daimon], "daimon", "daimon"), null, "The last horse leaves no one to promote.");
  assert.equal(horseToPromote([daimon, retired], "daimon", "daimon"), null, "An archived horse is never promoted.");
  // listHorses puts primaries first, then the oldest: a shared horse can sort
  // ahead of the rider's own second horse.
  const sharedPrimary = horse("bella", { ownerId: "rider-b", isPrimary: true });
  assert.equal(
    horseToPromote([daimon, sharedPrimary, luna], "daimon", "daimon"),
    "luna",
    "Only the rider's own horse is promoted, never a horse someone shared."
  );
  assert.equal(horseToPromote([daimon, sharedPrimary], "daimon", "daimon"), null, "With only a shared horse left, none is promoted.");
}

{
  const after = withPrimary([daimon, luna], "luna");
  assert.deepEqual(after.map((entry) => [entry.id, entry.isPrimary]), [["daimon", false], ["luna", true]]);
  assert.equal(withPrimary([daimon, luna], "daimon")[0], daimon, "Unchanged horses keep their identity, so nothing re-renders for them.");
  const sharedPrimary = horse("bella", { ownerId: "rider-b", isPrimary: true });
  assert.equal(
    withPrimary([daimon, luna, sharedPrimary], "luna")[2]?.isPrimary,
    true,
    "Another owner's primary horse keeps its flag."
  );
}

{
  const sharedPrimary = horse("bella", { ownerId: "rider-b", isPrimary: true });
  assert.equal(ownPrimary([sharedPrimary, luna, daimon], "rider-a"), "daimon", "The rider's own primary, not a shared one.");
  assert.equal(ownPrimary([luna], "rider-a"), "", "No primary marked.");
  assert.equal(ownPrimary([{ ...daimon, archivedAt: "2026-10-20T00:00:00Z" }], "rider-a"), "", "An archived horse is nobody's primary.");
}

console.log("Horse selection passed.");
