import assert from "node:assert/strict";
import { openBackendDatabase } from "./backend-database";
import {
  addPhase,
  cleanPhases,
  defaultRidePhases,
  defaultTrainingType,
  editPhase,
  movePhaseUp,
  parseRideSetupMemory,
  pauseRun,
  phaseAnnouncement,
  phaseProgress,
  phaseRemainingMs,
  phasesFor,
  plannedMinutes,
  reachedPhases,
  readyRun,
  rememberSetup,
  removePhase,
  resumeRun,
  rideElapsedMs,
  ridePhaseEntries,
  rideScheduleKey,
  ridePhaseLimits,
  ridePlanProblem,
  rideTrainingLabel,
  rideTrainingTypeById,
  rideTrainingTypes,
  setPhaseMinutes,
  skipPhase,
  startRun,
  syncRun,
  upcomingRideAlerts,
  type RidePhasePlan
} from "../src/features/ride/ride-plan";

// Setting up a ride before getting on, and the clock that runs it (202610070001).

const minute = 60_000;
const t0 = 1_800_000_000_000;
const need = <T>(value: T | undefined | null, what: string): T => {
  assert.ok(value !== undefined && value !== null, `expected ${what}`);
  return value as T;
};

// --- The setup ------------------------------------------------------------------------

const dressage = need(rideTrainingTypeById("dressage"), "dressage");
const phases = defaultRidePhases(dressage);
{
  // The yard's shape: walk in, trot, the work, then bring the horse down.
  assert.deepEqual(
    phases.map((phase) => [phase.title, phase.detail, phase.minutes]),
    [["Pre warm-up", "Walk", 10], ["Warm-up", "Trot", 7], ["Training", "Dressage", 20], ["Cool-down", "Trot & walk", 15]]
  );
  assert.equal(plannedMinutes(phases), 52);
  assert.equal(defaultRidePhases(need(rideTrainingTypeById("hack"), "hack"))[2]?.detail, "Hack", "The training phase names the training.");

  // The rider's discipline suggests a training; it never limits the choice.
  assert.equal(defaultTrainingType("Jumping").id, "jumping");
  assert.equal(defaultTrainingType("Trail").id, "hack");
  assert.ok(rideTrainingTypes.length > 4 && rideTrainingTypes.every((type) => /^[a-z][a-z0-9-]{1,39}$/.test(type.id)), "Every id fits the database's check.");
  assert.equal(new Set(rideTrainingTypes.map((type) => type.id)).size, rideTrainingTypes.length);
  assert.equal(rideTrainingLabel("pole-work"), "Pole work");
  assert.equal(rideTrainingLabel("show-jumping"), "Show jumping", "A type a later app added still reads as words.");
  assert.equal(rideTrainingLabel(undefined), undefined);

  // Minutes stay whole and inside the limits.
  assert.equal(setPhaseMinutes(phases, "warm-up", 0)[1]?.minutes, ridePhaseLimits.minMinutes);
  assert.equal(setPhaseMinutes(phases, "warm-up", 500)[1]?.minutes, ridePhaseLimits.maxMinutes);
  assert.equal(setPhaseMinutes(phases, "warm-up", 8.6)[1]?.minutes, 9);
  assert.equal(setPhaseMinutes(phases, "warm-up", 12)[0]?.minutes, 10, "Only the phase asked for changes.");

  // Phases are added at the end, moved up, renamed and removed -- never all of them.
  const added = addPhase(phases, "canter");
  assert.equal(added.length, 5);
  assert.deepEqual(added[4], { id: "canter", title: "", detail: "", minutes: 5 });
  assert.equal(ridePlanProblem(added), "Give every phase a name.", "A new phase is named before the ride starts.");
  const moved = movePhaseUp(added, "canter");
  assert.deepEqual(moved.map((phase) => phase.id), ["pre-warm-up", "warm-up", "training", "canter", "cool-down"]);
  assert.equal(movePhaseUp(moved, "pre-warm-up"), moved, "The first phase has nowhere to go.");
  const renamed = editPhase(moved, "canter", { title: "Canter work", detail: "Both reins" });
  assert.equal(renamed[3]?.title, "Canter work");
  assert.equal(renamed[3]?.detail, "Both reins");
  assert.equal(editPhase(phases, "warm-up", { title: "x".repeat(80) })[1]?.title.length, ridePhaseLimits.titleLength);
  let full: RidePhasePlan[] = phases;
  for (let index = 0; index < 20; index += 1) full = addPhase(full, `extra-${index}`);
  assert.equal(full.length, ridePhaseLimits.maxPhases);
  let one: RidePhasePlan[] = phases;
  for (const phase of phases) one = removePhase(one, phase.id);
  assert.equal(one.length, 1, "A ride keeps at least one phase.");

  assert.equal(ridePlanProblem(phases), null);
  assert.equal(ridePlanProblem(editPhase(phases, "warm-up", { title: "  " })), "Give every phase a name.");
  assert.equal(ridePlanProblem([]), "Add at least one phase.");
  assert.deepEqual(cleanPhases([{ id: "a", title: " Walk ", detail: "  ", minutes: 4.4 }]), [{ id: "a", title: "Walk", detail: "", minutes: 4 }]);
}

// --- The clock ------------------------------------------------------------------------

{
  // Nothing runs until the rider starts the first phase.
  const ready = readyRun();
  assert.equal(rideElapsedMs(ready, t0 + 5 * minute), 0);
  assert.equal(phaseRemainingMs(ready, phases, t0), 10 * minute, "Before the start, the first phase's full time.");
  assert.deepEqual(syncRun(ready, phases, t0 + 60 * minute), { run: ready, entered: null, finished: false });
  assert.equal(reachedPhases(ready), 0);
  assert.equal(pauseRun(ready, t0), ready);
  assert.equal(resumeRun(ready, t0), ready, "Resume cannot start a ride.");

  let run = startRun(ready, t0);
  assert.equal(run.startedAt, t0);
  assert.equal(startRun(run, t0 + minute), run, "Starting twice changes nothing.");
  assert.equal(reachedPhases(run), 1);
  assert.equal(phaseRemainingMs(run, phases, t0 + 4 * minute), 6 * minute);

  // Inside a phase, nothing to announce.
  assert.equal(syncRun(run, phases, t0 + 9 * minute).entered, null);

  // The pre warm-up runs out: the warm-up begins, once.
  let step = syncRun(run, phases, t0 + 10 * minute);
  assert.equal(step.entered, 1);
  run = step.run;
  assert.equal(run.phaseIndex, 1);
  assert.equal(run.phaseStarts[1], 10 * minute);
  assert.equal(syncRun(run, phases, t0 + 10 * minute + 500).entered, null, "The same change is not announced twice.");

  // Paused, the clock and the phase stand still however long the break.
  run = pauseRun(run, t0 + 12 * minute);
  assert.equal(rideElapsedMs(run, t0 + 40 * minute), 12 * minute);
  assert.equal(syncRun(run, phases, t0 + 40 * minute).entered, null);
  assert.deepEqual(upcomingRideAlerts(run, phases, t0 + 40 * minute), [], "Nothing to alert while paused.");
  run = resumeRun(run, t0 + 40 * minute);
  assert.equal(rideElapsedMs(run, t0 + 41 * minute), 13 * minute);
  assert.equal(phaseRemainingMs(run, phases, t0 + 41 * minute), 4 * minute, "13 minutes in, the warm-up has 4 of its 7 left.");

  // While the phone was locked the warm-up and the training both ran out: the
  // ride lands in the cool-down and announces only where it is now. Each phase
  // began where the last was planned to end, not when the phone woke.
  // Ride time then: 12 banked + 38 since resuming = 50 minutes, past the
  // training's end at 10 + 7 + 20 = 37.
  step = syncRun(run, phases, t0 + 78 * minute);
  assert.equal(step.entered, 3);
  assert.equal(step.finished, false);
  assert.deepEqual(step.run.phaseStarts, [0, 10 * minute, 17 * minute, 37 * minute]);
  run = step.run;

  // The last phase runs out: the phases are done, and the clock keeps going
  // until the rider finishes.
  const doneAt = t0 + 80 * minute; // 52 minutes of ride time
  step = syncRun(run, phases, doneAt);
  assert.equal(step.finished, true);
  assert.equal(step.entered, null);
  run = step.run;
  assert.equal(run.phasesDone, true);
  assert.equal(syncRun(run, phases, doneAt + minute).finished, false, "Done is announced once.");
  assert.equal(rideElapsedMs(run, doneAt + 3 * minute), 55 * minute, "Ride time keeps running after the phases.");
  assert.deepEqual(phaseProgress(run, phases, doneAt), [1, 1, 1, 1]);
  assert.equal(reachedPhases(run), 4);

  // What is saved: every phase planned and ridden; the last one ran into the finish.
  const entries = ridePhaseEntries(run, phases, rideElapsedMs(run, doneAt + 3 * minute));
  assert.deepEqual(entries.map((entry) => [entry.plannedSeconds, entry.actualSeconds]), [[600, 600], [420, 420], [1200, 1200], [900, 1080]]);
  assert.deepEqual(entries[0], { title: "Pre warm-up", detail: "Walk", plannedSeconds: 600, actualSeconds: 600 });
}

{
  // Moving on early: the next phase begins now, and the plan after it shifts.
  let run = startRun(readyRun(), t0);
  run = skipPhase(run, phases, t0 + 6 * minute);
  assert.equal(run.phaseIndex, 1);
  assert.equal(run.phaseStarts[1], 6 * minute);
  assert.equal(phaseRemainingMs(run, phases, t0 + 6 * minute), 7 * minute);
  assert.deepEqual(phaseProgress(run, phases, t0 + 9 * minute + 30_000).map((value) => Math.round(value * 100)), [100, 50, 0, 0]);

  // The notifications for a locked phone: every change still ahead, from now.
  const alerts = upcomingRideAlerts(run, phases, t0 + 7 * minute);
  assert.deepEqual(alerts.map((alert) => [alert.phaseIndex, alert.inSeconds]), [[2, 6 * 60], [3, 26 * 60], [null, 41 * 60]]);
  assert.equal(alerts[0]?.title, "Training · 20 min");
  assert.equal(alerts[0]?.body, "Dressage");
  assert.equal(alerts[2]?.title, "All phases done");

  // Ending early saves only the phases reached.
  const entries = ridePhaseEntries(run, phases, 8 * minute);
  assert.deepEqual(entries.map((entry) => entry.actualSeconds), [360, 120, undefined, undefined]);
  assert.equal("actualSeconds" in (entries[2] ?? {}), false, "A phase never reached has no time at all.");
  assert.equal(reachedPhases(run), 2);

  // Moving on from the last phase ends the phases.
  run = skipPhase(skipPhase(run, phases, t0 + 8 * minute), phases, t0 + 9 * minute);
  assert.equal(run.phaseIndex, 3);
  run = skipPhase(run, phases, t0 + 10 * minute);
  assert.equal(run.phasesDone, true);
  assert.equal(skipPhase(run, phases, t0 + 11 * minute), run);
  const waiting = readyRun();
  assert.equal(skipPhase(waiting, phases, t0), waiting, "Nothing to move on from before the start.");
}

{
  // The alerts for a locked phone are rebuilt only when the times ahead move.
  // A phase that runs out on time leaves them alone: rebuilding would cancel
  // the alert that is just about to fire.
  const started = startRun(readyRun(), t0);
  const key = rideScheduleKey(started, phases);
  const advanced = syncRun(started, phases, t0 + 10 * minute + 1).run;
  assert.equal(advanced.phaseIndex, 1);
  assert.equal(rideScheduleKey(advanced, phases), key, "On time: nothing ahead moved.");
  assert.notEqual(rideScheduleKey(skipPhase(started, phases, t0 + 2 * minute), phases), key, "A skip moves every change after it.");
  const paused = pauseRun(started, t0 + minute);
  assert.equal(rideScheduleKey(paused, phases), "stopped");
  assert.notEqual(rideScheduleKey(resumeRun(paused, t0 + 5 * minute), phases), key, "After a break the changes come later.");
  assert.equal(rideScheduleKey(readyRun(), phases), "stopped", "Nothing is scheduled before the start.");
}

{
  // What the phone says as each phase begins.
  assert.equal(phaseAnnouncement(phases[1]!), "Warm-up. Trot. 7 minutes.");
  assert.equal(phaseAnnouncement({ id: "x", title: "Stretch", detail: "", minutes: 1 }), "Stretch. 1 minute.");
}

// --- Remembering the last setup ---------------------------------------------------------

{
  assert.equal(parseRideSetupMemory(null), null);
  assert.equal(parseRideSetupMemory("not json"), null);
  assert.equal(parseRideSetupMemory(JSON.stringify({ phasesByType: {} })), null, "A setup without a training is not a setup.");

  const jumping = need(rideTrainingTypeById("jumping"), "jumping");
  const mine = setPhaseMinutes(defaultRidePhases(jumping), "warm-up", 12);
  const memory = rememberSetup(null, { horseId: "horse-1", horseName: "Bella", trainingType: jumping, phases: mine });
  const stored = parseRideSetupMemory(JSON.stringify(memory));
  assert.deepEqual(stored, memory);
  assert.equal(phasesFor(stored, jumping)[1]?.minutes, 12, "The next jumping ride starts from the rider's own minutes.");
  assert.deepEqual(phasesFor(stored, dressage), defaultRidePhases(dressage), "Another training starts from the yard's default.");

  // A stored setup with a broken phase list loses that list, not the whole setup.
  const damaged = parseRideSetupMemory(JSON.stringify({
    trainingTypeId: "jumping",
    phasesByType: { jumping: [{ id: "a", title: "Walk" }], hack: mine }
  }));
  assert.equal(damaged?.phasesByType.jumping, undefined);
  assert.equal(damaged?.phasesByType.hack?.length, 4);
}

// --- The database ---------------------------------------------------------------------

const db = await openBackendDatabase();
const rider = "30000000-0000-4000-8000-000000000001";
await db.exec(`insert into auth.users(id, email, email_confirmed_at) values ('${rider}', 'rider@example.com', now());`);
await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${rider}', false);`);

const insertRide = (trainingType: string | null, phasesJson: unknown, totalPhases: number) =>
  db.query<{ id: string; training_type: string | null; phases: unknown }>(`
    insert into public.ride_entries(
      rider_id, discipline, training_type, focus, started_at, completed_at,
      elapsed_seconds, completed_phases, total_phases, phases
    ) values ($1, 'dressage', $2, 'Dressage', now() - interval '1 hour', now(), 3300, least($3::int, 4), $3, $4::jsonb)
    returning id, training_type, phases
  `, [rider, trainingType, totalPhases, phasesJson === undefined ? null : JSON.stringify(phasesJson)]);

const ridden = [
  { title: "Pre warm-up", detail: "Walk", planned_seconds: 600, actual_seconds: 600 },
  { title: "Warm-up", detail: "Trot", planned_seconds: 420, actual_seconds: 455 },
  { title: "Training", detail: "Dressage", planned_seconds: 1200, actual_seconds: 1190 },
  { title: "Cool-down", detail: null, planned_seconds: 900, actual_seconds: null }
];

{
  const saved = await insertRide("dressage", ridden, 4);
  assert.equal(saved.rows[0]?.training_type, "dressage");
  assert.deepEqual(saved.rows[0]?.phases, ridden, "A rider saves the training and the phases with the ride.");

  // A ride from before the setup sheet has neither, and stays valid.
  const older = await insertRide(null, undefined, 3);
  assert.equal(older.rows[0]?.phases, null);

  const refused = (trainingType: string | null, phasesJson: unknown, totalPhases: number, pattern: RegExp, why: string) =>
    assert.rejects(insertRide(trainingType, phasesJson, totalPhases), pattern, why);
  await refused("Dressage", ridden, 4, /ride_entries_training_type_shape/, "A training type is an id, not a label.");
  await refused("x", ridden, 4, /ride_entries_training_type_shape/, "An id has at least two characters.");
  await refused("dressage", ridden, 3, /ride_entries_phases_valid/, "The phases and the phase count describe the same ride.");
  await refused("dressage", [], 0, /ride_entries_phases_valid/, "A ride with phases has at least one.");
  await refused("dressage", { title: "Walk" }, 1, /ride_entries_phases_valid/, "Phases are a list.");
  await refused("dressage", ["Walk"], 1, /ride_entries_phases_valid/, "Each phase is an object.");
  await refused("dressage", [{ planned_seconds: 600 }], 1, /ride_entries_phases_valid/, "Each phase has a title.");
  await refused("dressage", [{ title: " ", planned_seconds: 600 }], 1, /ride_entries_phases_valid/, "A blank title is no title.");
  await refused("dressage", [{ title: "x".repeat(61), planned_seconds: 600 }], 1, /ride_entries_phases_valid/, "Titles stay short.");
  await refused("dressage", [{ title: "Walk", detail: 5, planned_seconds: 600 }], 1, /ride_entries_phases_valid/, "A detail is words.");
  await refused("dressage", [{ title: "Walk", planned_seconds: "600" }], 1, /ride_entries_phases_valid/, "Planned time is a number, and a string is refused, not cast.");
  await refused("dressage", [{ title: "Walk", planned_seconds: 30 }], 1, /ride_entries_phases_valid/, "A phase is at least a minute.");
  await refused("dressage", [{ title: "Walk", planned_seconds: 5401 }], 1, /ride_entries_phases_valid/, "A phase is at most ninety minutes.");
  await refused("dressage", [{ title: "Walk", planned_seconds: 600.5 }], 1, /ride_entries_phases_valid/, "Seconds are whole.");
  await refused("dressage", [{ title: "Walk", planned_seconds: 600, actual_seconds: -1 }], 1, /ride_entries_phases_valid/, "Ridden time is never negative.");
  await refused("dressage", [{ title: "Walk", planned_seconds: 600, actual_seconds: "lots" }], 1, /ride_entries_phases_valid/, "Ridden time is a number.");
  await refused("dressage", [{ title: "Walk", planned_seconds: 600, heart_rate: 80 }], 1, /ride_entries_phases_valid/, "Nothing rides along that the app did not write.");
  await refused(
    "dressage",
    Array.from({ length: 13 }, () => ({ title: "Walk", planned_seconds: 60 })),
    13,
    /ride_entries_phases_valid/,
    "A ride has at most twelve phases."
  );

  // Written once, with the ride: a rider corrects the note or the time, not the plan.
  const id = need(saved.rows[0]?.id, "saved ride");
  await assert.rejects(
    db.query("update public.ride_entries set phases = null where id = $1", [id]),
    /permission denied/,
    "The phases are not edited after the ride."
  );
  await assert.rejects(
    db.query("update public.ride_entries set training_type = 'hack' where id = $1", [id]),
    /permission denied/,
    "Nor is the training."
  );
}

await db.exec("reset role");
const executable = await db.query<{ anon: boolean; authenticated: boolean }>(`
  select has_function_privilege('anon', 'private.ride_phases_valid(jsonb)', 'execute') as anon,
         has_function_privilege('authenticated', 'private.ride_phases_valid(jsonb)', 'execute') as authenticated
`);
assert.deepEqual(executable.rows[0], { anon: false, authenticated: true }, "The check runs as the rider who writes; anon writes no rides.");

console.log("Ride setup passed.");
