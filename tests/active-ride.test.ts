import assert from "node:assert/strict";
import { activeRideMaxAgeMs, parseActiveRide, restoreRun, serializeActiveRide } from "../src/features/ride/active-ride";
import {
  defaultRidePhases,
  pauseRun,
  rideElapsedMs,
  ridePhaseEntries,
  rideTrainingTypeById,
  readyRun,
  skipPhase,
  startRun,
  syncRun,
  type RidePlan
} from "../src/features/ride/ride-plan";

// A ride in progress survives the app being closed: kept on the phone at every
// change, and brought back at the phase and the time the clock says.

const minute = 60_000;
const hour = 60 * minute;
const t0 = 1_800_000_000_000;
const dressage = rideTrainingTypeById("dressage");
assert.ok(dressage);
const plan: RidePlan = { horseId: "horse-1", horseName: "Bella", trainingType: dressage, phases: defaultRidePhases(dressage) };
const phases = plan.phases; // 10 + 7 + 20 + 15 = 52 minutes
const started = startRun(readyRun(), t0);

{
  // What is written reads back as it was.
  const raw = serializeActiveRide(plan, started, t0);
  assert.deepEqual(parseActiveRide(raw, t0 + minute), { v: 1, plan, run: started, savedAt: t0 });

  // A paused ride, part way through, comes back paused where it was.
  const paused = pauseRun(skipPhase(started, phases, t0 + 3 * minute), t0 + 5 * minute);
  assert.deepEqual(parseActiveRide(serializeActiveRide(plan, paused, t0 + 5 * minute), t0 + hour)?.run, paused);

  // A training with no discipline of its own, and a horse from the demo with no id.
  const lunging = rideTrainingTypeById("lunging");
  assert.ok(lunging);
  const demo: RidePlan = { horseName: "Bella", trainingType: lunging, phases };
  assert.deepEqual(parseActiveRide(serializeActiveRide(demo, started, t0), t0)?.plan, demo);
}

{
  // Nothing comes back that cannot be trusted.
  const valid = JSON.parse(serializeActiveRide(plan, started, t0)) as Record<string, unknown>;
  const broken = (patch: Record<string, unknown>, why: string) =>
    assert.equal(parseActiveRide(JSON.stringify({ ...valid, ...patch }), t0), null, why);
  const run = valid.run as Record<string, unknown>;
  const storedPlan = valid.plan as Record<string, unknown>;

  assert.equal(parseActiveRide(null, t0), null);
  assert.equal(parseActiveRide("", t0), null);
  assert.equal(parseActiveRide("not json", t0), null);
  assert.equal(parseActiveRide("null", t0), null);
  broken({ v: 2 }, "Another version's shape is dropped.");
  broken({ savedAt: "yesterday" }, "The time of the write is a number.");
  broken({ run: readyRun() }, "A ride that never started has nothing to come back to.");
  broken({ run: { ...run, bankedMs: -1 } }, "Banked time is never negative.");
  broken({ run: { ...run, runningSince: "now" } }, "The clock's start is a number or null.");
  broken({ run: { ...run, phaseIndex: 4 } }, "The phase is one of the plan's.");
  broken({ run: { ...run, phaseIndex: 0.5 } }, "The phase is a whole index.");
  broken({ run: { ...run, phaseStarts: [] } }, "The phase the ride is in has a start.");
  broken({ run: { ...run, phaseStarts: [0, "x"] } }, "Phase starts are numbers.");
  broken({ run: { ...run, phasesDone: "no" } }, "Done or not.");
  broken({ plan: { ...storedPlan, phases: [] } }, "A plan has phases.");
  broken({ plan: { ...storedPlan, phases: [{ id: "a", title: "Walk" }] } }, "Each phase is whole.");
  broken({ plan: { ...storedPlan, trainingType: { label: "Dressage" } } }, "The training has its id.");
  broken({ plan: { ...storedPlan, horseName: 4 } }, "The horse's name is words.");

  // A discipline the app does not know is left out, not trusted.
  const odd = parseActiveRide(
    JSON.stringify({ ...valid, plan: { ...storedPlan, trainingType: { id: "dressage", label: "Dressage", discipline: "Polo" } } }),
    t0
  );
  assert.deepEqual(odd?.plan.trainingType, { id: "dressage", label: "Dressage" });
}

{
  // A ride left open yesterday is not today's.
  const raw = serializeActiveRide(plan, started, t0);
  assert.equal(activeRideMaxAgeMs, 12 * hour);
  assert.ok(parseActiveRide(raw, t0 + activeRideMaxAgeMs), "Up to the limit it comes back.");
  assert.equal(parseActiveRide(raw, t0 + activeRideMaxAgeMs + 1), null, "Past it, it is dropped.");
}

{
  // The app was closed 30 minutes in: the ride opens in the training, with
  // the time the clock says, each phase starting where the last was planned to end.
  const back = restoreRun(started, phases, t0 + 30 * minute);
  assert.equal(back.phaseIndex, 2);
  assert.deepEqual(back.phaseStarts, [0, 10 * minute, 17 * minute]);
  assert.equal(rideElapsedMs(back, t0 + 30 * minute), 30 * minute);
  assert.equal(back.runningSince, t0, "Still running: nothing was lost.");
  assert.equal(syncRun(back, phases, t0 + 30 * minute).entered, null, "Nothing left to announce on opening.");

  // A paused ride stays paused, whatever the time.
  const paused = pauseRun(started, t0 + 4 * minute);
  assert.deepEqual(restoreRun(paused, phases, t0 + 3 * hour), paused);
}

{
  // Forgotten: the phone spent three hours in a pocket after a 52-minute
  // plan. The clock stops at the plan's end; the ride is saved as 52 minutes.
  const back = restoreRun(started, phases, t0 + 3 * hour);
  assert.equal(back.phasesDone, true);
  assert.equal(back.runningSince, null, "The clock stands still at the plan's end.");
  assert.equal(rideElapsedMs(back, t0 + 5 * hour), 52 * minute);
  assert.equal(back.phaseIndex, 3);
  const entries = ridePhaseEntries(back, phases, rideElapsedMs(back, t0 + 5 * hour));
  assert.deepEqual(entries.map((entry) => entry.actualSeconds), [600, 420, 1200, 900]);

  // Right at the end, nothing is cut.
  const onTime = restoreRun(started, phases, t0 + 52 * minute);
  assert.equal(rideElapsedMs(onTime, t0 + 52 * minute), 52 * minute);
  assert.equal(onTime.runningSince, t0, "Still running: the rider may still be cooling down.");

  // Skipped ahead, then forgotten: still no more than the plan.
  const skipped = skipPhase(skipPhase(started, phases, t0 + 2 * minute), phases, t0 + 4 * minute);
  assert.equal(rideElapsedMs(restoreRun(skipped, phases, t0 + 4 * hour), t0 + 4 * hour), 52 * minute);
}

console.log("Active ride passed.");
