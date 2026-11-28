import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type { RideEntry } from "../src/backend/contracts";
import { parseActiveRide, restoreRun, serializeActiveRide } from "../src/features/ride/active-ride";
import {
  defaultRidePhases,
  finishRun,
  nextRideCue,
  pauseRun,
  phaseWindows,
  readyRun,
  resumeRun,
  rideCompletedAt,
  rideElapsedMs,
  ridePhaseEntries,
  rideTrainingTypeById,
  skipPhase,
  startRun,
  syncRun,
  watchRideCues,
  type RideMark,
  type RidePhaseWindows,
  type RidePlan,
  type RideRun
} from "../src/features/ride/ride-plan";
import {
  approximatePhaseWindows,
  createRideTimelineStore,
  keepRideTimeline,
  parseRideTimelines,
  rideTimelineKey,
  rideTimelineStorageKey,
  type RideTimelineStorage
} from "../src/features/ride/ride-timeline";

// The ride's wall-clock timeline (2026-11-28). Ride time leaves the pauses
// out, so heart-rate samples, which come by the wall clock, could not be put
// in their phase. Every change of the clock is now marked as it happens, and
// the finished ride's windows stay on the phone that timed it.

const minute = 60_000;
const hour = 60 * minute;
const t0 = 1_800_000_000_000;
const dressage = rideTrainingTypeById("dressage");
assert.ok(dressage);
const phases = defaultRidePhases(dressage); // 10 + 7 + 20 + 15 = 52 minutes
const plan: RidePlan = { horseId: "horse-1", horseName: "Bella", trainingType: dressage, phases };
const lastMark = (run: RideRun) => run.marks?.[run.marks.length - 1];
const withoutMarks = (run: RideRun): RideRun => {
  const { marks: _dropped, ...rest } = run;
  return rest;
};

// --- Marks, appended by every change of the run ------------------------------------

{
  const started = startRun(readyRun(), t0);
  assert.deepEqual(started.marks, [{ kind: "start", at: t0 }], "The start opens the timeline.");
  assert.equal(readyRun().marks, undefined, "Nothing is marked before the start.");

  const paused = pauseRun(started, t0 + 4 * minute);
  assert.deepEqual(lastMark(paused), { kind: "pause", at: t0 + 4 * minute });
  assert.equal(pauseRun(paused, t0 + 5 * minute), paused, "A second pause marks nothing.");

  const resumed = resumeRun(paused, t0 + 6 * minute);
  assert.deepEqual(lastMark(resumed), { kind: "resume", at: t0 + 6 * minute });
  assert.equal(resumeRun(resumed, t0 + 7 * minute), resumed);

  // The pre warm-up's ten minutes of ride time run out at 12 on the wall
  // clock (two minutes of break). Noticed a moment late, it is marked on time.
  const advanced = syncRun(resumed, phases, t0 + 12 * minute + 300).run;
  assert.deepEqual(lastMark(advanced), { kind: "phase", at: t0 + 12 * minute, index: 1 });
  assert.equal(syncRun(advanced, phases, t0 + 12 * minute + 600).run, advanced, "Nothing new, nothing marked.");

  // Asleep through the warm-up and the training: each is marked when it began.
  const woke = syncRun(advanced, phases, t0 + 45 * minute).run;
  assert.deepEqual(woke.marks?.slice(-2), [
    { kind: "phase", at: t0 + 19 * minute, index: 2 },
    { kind: "phase", at: t0 + 39 * minute, index: 3 }
  ]);

  // A skip begins the next phase at the tap.
  const skipped = skipPhase(started, phases, t0 + 3 * minute);
  assert.deepEqual(lastMark(skipped), { kind: "phase", at: t0 + 3 * minute, index: 1 });
  // Past the last phase nothing begins, so nothing is marked.
  const atLast = skipPhase(skipPhase(skipped, phases, t0 + 4 * minute), phases, t0 + 5 * minute);
  const done = skipPhase(atLast, phases, t0 + 6 * minute);
  assert.equal(done.phasesDone, true);
  assert.deepEqual(done.marks, atLast.marks);

  // Finish: moved on to where the clock is, stopped, and the end marked.
  const finished = finishRun(started, phases, t0 + 30 * minute);
  assert.deepEqual(finished.marks, [
    { kind: "start", at: t0 },
    { kind: "phase", at: t0 + 10 * minute, index: 1 },
    { kind: "phase", at: t0 + 17 * minute, index: 2 },
    { kind: "end", at: t0 + 30 * minute }
  ]);
  assert.equal(finished.runningSince, null, "The clock stops at Finish.");
  assert.equal(rideElapsedMs(finished, t0 + 2 * hour), 30 * minute);
  assert.equal(finished.phaseIndex, 2, "A phase that ran out a moment before the tap counts.");
  assert.equal(finishRun(finished, phases, t0 + 31 * minute), finished, "Finished once.");
  const ready = readyRun();
  assert.equal(finishRun(ready, phases, t0), ready, "Nothing to finish before the start.");

  // A phone clock set back mid-ride never dates a mark before the one it follows.
  assert.deepEqual(lastMark(pauseRun(started, t0 - 5000)), { kind: "pause", at: t0 });

  // Everything is plain numbers and words: it is kept and read back as JSON.
  assert.deepEqual(JSON.parse(JSON.stringify(woke)), woke);
}

{
  // A phase that ran out just before a pause the clock's tick had not caught
  // up with: it is marked when it began, before the pause, not at the resume.
  const started = startRun(readyRun(), t0);
  const paused = pauseRun(started, t0 + 10 * minute + 200);
  assert.equal(paused.phaseIndex, 0, "Paused before the screen noticed the change.");
  const resumed = resumeRun(paused, t0 + 15 * minute);
  const caught = syncRun(resumed, phases, t0 + 15 * minute + 100).run;
  assert.deepEqual(caught.marks, [
    { kind: "start", at: t0 },
    { kind: "phase", at: t0 + 10 * minute, index: 1 },
    { kind: "pause", at: t0 + 10 * minute + 200 },
    { kind: "resume", at: t0 + 15 * minute }
  ]);
  assert.deepEqual(phaseWindows(finishRun(caught, phases, t0 + 20 * minute), phases), [
    { phaseIndex: 0, windows: [{ start: t0, end: t0 + 10 * minute }] },
    {
      phaseIndex: 1,
      windows: [
        { start: t0 + 10 * minute, end: t0 + 10 * minute + 200 },
        { start: t0 + 15 * minute, end: t0 + 20 * minute }
      ]
    }
  ]);
}

{
  // A run kept by an app from before the timeline has none, and gets none
  // later: a timeline without its start would place every phase wrong.
  const old = withoutMarks(startRun(readyRun(), t0));
  const later = finishRun(resumeRun(pauseRun(skipPhase(old, phases, t0 + 3 * minute), t0 + 4 * minute), t0 + 5 * minute), phases, t0 + 40 * minute);
  assert.equal(later.marks, undefined);
  assert.equal(phaseWindows(later, phases), null);
  assert.equal(restoreRun(old, phases, t0 + 3 * hour).marks, undefined);
  assert.equal(phaseWindows(readyRun(), phases), null, "A ride not started has no timeline.");
}

// --- Brought back after the app was closed ----------------------------------------------

{
  // Forgotten: the end is marked when the planned time ran out.
  const started = startRun(readyRun(), t0);
  const back = restoreRun(started, phases, t0 + 3 * hour);
  assert.deepEqual(back.marks, [
    { kind: "start", at: t0 },
    { kind: "phase", at: t0 + 10 * minute, index: 1 },
    { kind: "phase", at: t0 + 17 * minute, index: 2 },
    { kind: "phase", at: t0 + 37 * minute, index: 3 },
    { kind: "end", at: t0 + 52 * minute }
  ]);
  assert.equal(back.endedAt, t0 + 52 * minute);
  const tapped = finishRun(back, phases, t0 + 3 * hour + 2 * minute);
  assert.equal(tapped, back, "Finish keeps the end it had.");
  assert.equal(rideCompletedAt(tapped, t0 + 3 * hour + 2 * minute), t0 + 52 * minute);

  // Paused a moment after the time ran out, then forgotten: the pause was the
  // phone in a pocket, after the end.
  const cooling = syncRun(started, phases, t0 + 51 * minute).run;
  const pausedAt = t0 + 52 * minute + 200;
  const pausedBack = restoreRun(pauseRun(cooling, pausedAt), phases, t0 + 5 * hour, pausedAt);
  assert.equal(pausedBack.endedAt, t0 + 52 * minute);
  assert.deepEqual(lastMark(pausedBack), { kind: "end", at: t0 + 52 * minute });
  assert.equal(pausedBack.marks?.some((mark) => mark.kind === "pause"), false);

  // Ridden past the plan, a break, then forgotten: the timeline places the
  // plan's end inside the stretch it fell in, before the break.
  const over = syncRun(started, phases, t0 + 55 * minute).run;
  const breakTaken = resumeRun(pauseRun(over, t0 + 60 * minute), t0 + 70 * minute);
  const overBack = restoreRun(breakTaken, phases, t0 + 5 * hour, t0 + 70 * minute);
  assert.equal(overBack.endedAt, t0 + 52 * minute);
  assert.equal(rideElapsedMs(overBack, t0 + 6 * hour), 52 * minute);
  assert.deepEqual(phaseWindows(overBack, phases)?.map((phase) => phase.windows), [
    [{ start: t0, end: t0 + 10 * minute }],
    [{ start: t0 + 10 * minute, end: t0 + 17 * minute }],
    [{ start: t0 + 17 * minute, end: t0 + 37 * minute }],
    [{ start: t0 + 37 * minute, end: t0 + 52 * minute }]
  ]);
}

// --- Kept on the phone mid-ride: old and new shapes ---------------------------------------

{
  const started = startRun(readyRun(), t0);
  const midRide = pauseRun(skipPhase(started, phases, t0 + 3 * minute), t0 + 5 * minute);
  const stored = parseActiveRide(serializeActiveRide(plan, midRide, t0 + 5 * minute), t0 + 6 * minute);
  assert.deepEqual(stored?.run, midRide, "The timeline comes back with the ride.");

  // Written by the app before the timeline: still a ride, with no timeline.
  const oldShape = JSON.parse(serializeActiveRide(plan, midRide, t0 + 5 * minute)) as { run: Record<string, unknown> };
  delete oldShape.run.marks;
  const oldBack = parseActiveRide(JSON.stringify(oldShape), t0 + 6 * minute);
  assert.ok(oldBack, "An old ride still comes back.");
  assert.equal(oldBack.run.marks, undefined);
  assert.equal("marks" in oldBack.run, false);
  assert.equal(oldBack.run.phaseIndex, 1);

  // A timeline that cannot be trusted costs the ride its timeline, not the ride.
  const valid = JSON.parse(serializeActiveRide(plan, midRide, t0 + 5 * minute)) as { run: Record<string, unknown> };
  const marksOf = (marks: unknown) => {
    const back = parseActiveRide(JSON.stringify({ ...valid, run: { ...valid.run, marks } }), t0 + 6 * minute);
    assert.ok(back, "The ride itself still comes back.");
    return back.run.marks;
  };
  const good = midRide.marks as RideMark[];
  assert.deepEqual(marksOf(good), good);
  assert.equal(marksOf("yesterday"), undefined, "A timeline is a list.");
  assert.equal(marksOf([]), undefined, "An empty timeline has no start.");
  assert.equal(marksOf(good.slice(1)), undefined, "It begins with the start.");
  assert.equal(marksOf([{ kind: "start", at: t0 + 1 }, ...good.slice(1)]), undefined, "At the ride's start.");
  assert.equal(marksOf([...good, { kind: "start", at: t0 + 6 * minute }]), undefined, "A ride starts once.");
  assert.equal(marksOf([...good, { kind: "pause", at: t0 + minute }]), undefined, "Oldest first.");
  assert.equal(marksOf([...good, { kind: "pause", at: "soon" }]), undefined, "Times are numbers.");
  assert.equal(marksOf([...good, { kind: "nap", at: t0 + 6 * minute }]), undefined, "Only the kinds the app writes.");
  assert.equal(marksOf([...good, { kind: "phase", at: t0 + 6 * minute, index: 4 }]), undefined, "Only the plan's phases.");
  assert.equal(marksOf([...good, { kind: "phase", at: t0 + 6 * minute, index: 0 }]), undefined, "The first phase begins with the start.");
  assert.equal(marksOf([...good, { kind: "phase", at: t0 + 6 * minute, index: 1.5 }]), undefined);
  assert.equal(marksOf([...good, null]), undefined);
  assert.equal(marksOf(Array.from({ length: 1001 }, () => ({ kind: "pause", at: t0 }))), undefined, "Not without end.");
}

// --- Phase windows ----------------------------------------------------------------

{
  // Skips and a break: the warm-up was ridden in two parts.
  const started = startRun(readyRun(), t0);
  let run = skipPhase(started, phases, t0 + 3 * minute);
  run = pauseRun(run, t0 + 5 * minute);
  run = resumeRun(run, t0 + 8 * minute);
  run = skipPhase(run, phases, t0 + 9 * minute);
  const finished = finishRun(run, phases, t0 + 12 * minute);
  const windows = phaseWindows(finished, phases);
  assert.deepEqual(windows, [
    { phaseIndex: 0, windows: [{ start: t0, end: t0 + 3 * minute }] },
    { phaseIndex: 1, windows: [{ start: t0 + 3 * minute, end: t0 + 5 * minute }, { start: t0 + 8 * minute, end: t0 + 9 * minute }] },
    { phaseIndex: 2, windows: [{ start: t0 + 9 * minute, end: t0 + 12 * minute }] }
  ]);

  // The same minutes the journal keeps for each phase, the break left out.
  const seconds = (phase: RidePhaseWindows) => phase.windows.reduce((sum, window) => sum + (window.end - window.start) / 1000, 0);
  const entries = ridePhaseEntries(finished, phases, rideElapsedMs(finished, t0 + 12 * minute));
  assert.deepEqual(windows?.map(seconds), entries.filter((entry) => entry.actualSeconds !== undefined).map((entry) => entry.actualSeconds));
}

{
  // Skipped while paused: the phase begins at the skip, but is ridden from the resume.
  const started = startRun(readyRun(), t0);
  const run = resumeRun(skipPhase(pauseRun(started, t0 + 2 * minute), phases, t0 + 3 * minute), t0 + 4 * minute);
  assert.deepEqual(phaseWindows(finishRun(run, phases, t0 + 6 * minute), phases), [
    { phaseIndex: 0, windows: [{ start: t0, end: t0 + 2 * minute }] },
    { phaseIndex: 1, windows: [{ start: t0 + 4 * minute, end: t0 + 6 * minute }] }
  ]);

  // Skipped the moment it began: reached, never ridden.
  const straightOn = skipPhase(skipPhase(started, phases, t0 + 3 * minute), phases, t0 + 3 * minute);
  assert.deepEqual(phaseWindows(finishRun(straightOn, phases, t0 + 4 * minute), phases)?.map((phase) => [phase.phaseIndex, phase.windows.length]), [
    [0, 1],
    [1, 0],
    [2, 1]
  ]);
}

{
  // All phases done, the rider still cooling down: the last phase runs to the Finish.
  const started = startRun(readyRun(), t0);
  const windows = phaseWindows(finishRun(started, phases, t0 + 60 * minute), phases);
  assert.deepEqual(windows?.[3], { phaseIndex: 3, windows: [{ start: t0 + 37 * minute, end: t0 + 60 * minute }] });

  // A ride still going is read where the clock has it at `now`, the ride
  // screen's run not caught up included; without `now`, up to its last mark.
  assert.deepEqual(phaseWindows(started, phases, t0 + 12 * minute), [
    { phaseIndex: 0, windows: [{ start: t0, end: t0 + 10 * minute }] },
    { phaseIndex: 1, windows: [{ start: t0 + 10 * minute, end: t0 + 12 * minute }] }
  ]);
  assert.deepEqual(phaseWindows(started, phases), [{ phaseIndex: 0, windows: [] }]);
  const paused = pauseRun(started, t0 + 4 * minute);
  assert.deepEqual(phaseWindows(paused, phases, t0 + 30 * minute), [{ phaseIndex: 0, windows: [{ start: t0, end: t0 + 4 * minute }] }]);
}

// --- A ride with no timeline: the minutes it kept --------------------------------------------

{
  const entry = {
    startedAt: "2026-11-28T10:00:00+00:00",
    completedAt: "2026-11-28T10:41:00+00:00",
    phases: [
      { title: "Pre warm-up", plannedSeconds: 600, actualSeconds: 600 },
      { title: "Warm-up", plannedSeconds: 420, actualSeconds: 0 },
      { title: "Training", plannedSeconds: 1200, actualSeconds: 1860 },
      { title: "Cool-down", plannedSeconds: 900 }
    ]
  } satisfies Pick<RideEntry, "startedAt" | "completedAt" | "phases">;
  const start = Date.parse("2026-11-28T10:00:00Z");
  assert.deepEqual(approximatePhaseWindows(entry), [
    { phaseIndex: 0, windows: [{ start, end: start + 10 * minute }] },
    { phaseIndex: 1, windows: [] },
    { phaseIndex: 2, windows: [{ start: start + 10 * minute, end: start + 41 * minute }] }
  ], "Back to back from the start; a phase never reached is left out.");

  // Pauses are not known: after a break the phases sit too early, never past the end.
  const clipped = approximatePhaseWindows({ ...entry, completedAt: "2026-11-28T10:30:00Z" });
  assert.deepEqual(clipped[2], { phaseIndex: 2, windows: [{ start: start + 10 * minute, end: start + 30 * minute }] });

  // Logged by hand, or kept with no ridden time at all: the plan is all there is.
  const planned = approximatePhaseWindows({
    startedAt: "2026-11-28T10:00:00.000Z",
    completedAt: "2026-11-28T10:17:00.000Z",
    phases: [{ title: "Walk", plannedSeconds: 600 }, { title: "Trot", plannedSeconds: 420 }]
  });
  assert.deepEqual(planned, [
    { phaseIndex: 0, windows: [{ start, end: start + 10 * minute }] },
    { phaseIndex: 1, windows: [{ start: start + 10 * minute, end: start + 17 * minute }] }
  ]);

  // A ride from before the setup sheet has no phases to place.
  assert.deepEqual(approximatePhaseWindows({ startedAt: entry.startedAt, completedAt: entry.completedAt }), []);
  assert.deepEqual(approximatePhaseWindows({ ...entry, startedAt: "not a time" }), []);
}

// --- Kept on this phone ---------------------------------------------------------------

const memoryStorage = () => {
  const items = new Map<string, string>();
  const storage: RideTimelineStorage = {
    getItem: async (key) => items.get(key) ?? null,
    setItem: async (key, value) => {
      items.set(key, value);
    },
    removeItem: async (key) => {
      items.delete(key);
    }
  };
  return { items, storage };
};

{
  // The phone writes the start as "…00.000Z"; the journal reads it back as "+00:00".
  assert.equal(rideTimelineKey("2026-11-28T10:00:00+00:00"), "2026-11-28T10:00:00.000Z");
  assert.equal(rideTimelineKey("2026-11-28T12:00:00.250+02:00"), "2026-11-28T10:00:00.250Z");
  assert.equal(rideTimelineKey("soon"), null);
  assert.equal(rideTimelineStorageKey("rider-1"), "equina.ride-timelines.v1:rider-1");

  const { items, storage } = memoryStorage();
  const store = createRideTimelineStore(storage);
  const started = startRun(readyRun(), Date.parse("2026-11-28T10:00:00Z"));
  const windows = phaseWindows(finishRun(started, phases, Date.parse("2026-11-28T10:30:00Z")), phases);
  assert.ok(windows);
  const startedAt = new Date(started.startedAt ?? 0).toISOString();
  await store.save("rider-1", startedAt, windows);
  const fromJournal = { riderId: "rider-1", startedAt: "2026-11-28T10:00:00+00:00" };
  assert.deepEqual(await store.forRide(fromJournal), windows, "The journal entry finds the windows this phone timed.");
  assert.equal(await store.forRide({ ...fromJournal, riderId: "rider-2" }), null, "Another account on the same phone reads none.");
  assert.equal(await store.forRide({ ...fromJournal, startedAt: "2026-11-28T11:00:00Z" }), null, "Nor does another ride.");
  assert.equal(await store.forRide({ ...fromJournal, startedAt: "garbled" }), null);

  // Only when each phase was ridden: no titles, no feelings, nothing of health.
  const written = items.get(rideTimelineStorageKey("rider-1")) ?? "";
  assert.deepEqual(Object.keys(JSON.parse(written) as Record<string, unknown>), ["2026-11-28T10:00:00.000Z"]);
  assert.doesNotMatch(written, /title|detail|mood|bpm|heart/i);

  // Two rides saved together are both kept: each save waits for the last.
  const other = [{ phaseIndex: 0, windows: [{ start: 1, end: 2 }] }];
  void store.save("rider-1", "2026-11-29T08:00:00.000Z", other);
  void store.save("rider-1", "2026-11-30T08:00:00.000Z", other);
  assert.deepEqual(await store.forRide({ riderId: "rider-1", startedAt: "2026-11-29T08:00:00Z" }), other);
  assert.deepEqual(await store.forRide({ riderId: "rider-1", startedAt: "2026-11-30T08:00:00Z" }), other);
  assert.deepEqual(await store.forRide(fromJournal), windows);

  // A ride deleted from the journal takes its windows with it, in turn with a save.
  void store.save("rider-1", "2026-12-01T08:00:00.000Z", other);
  await store.forget("rider-1", "2026-11-29T08:00:00+00:00");
  assert.equal(await store.forRide({ riderId: "rider-1", startedAt: "2026-11-29T08:00:00Z" }), null);
  assert.deepEqual(await store.forRide({ riderId: "rider-1", startedAt: "2026-12-01T08:00:00Z" }), other, "The save queued before it is kept.");
  assert.deepEqual(await store.forRide(fromJournal), windows, "The other rides stay.");
  await store.forget("rider-2", fromJournal.startedAt);
  assert.deepEqual(await store.forRide(fromJournal), windows, "Another account's delete forgets nothing of this one.");
  for (const startedAt of [fromJournal.startedAt, "2026-11-30T08:00:00Z", "2026-12-01T08:00:00Z"]) await store.forget("rider-1", startedAt);
  assert.equal(items.has(rideTimelineStorageKey("rider-1")), false, "The last one forgotten, nothing is left on the phone.");
  await store.forget("rider-1", "garbled");
}

{
  // Only the newest are kept, a ride saved again replaces its own, and what
  // cannot be read is dropped without taking the rest with it.
  const one = [{ phaseIndex: 0, windows: [{ start: 1, end: 2 }] }];
  const two = [{ phaseIndex: 0, windows: [{ start: 3, end: 4 }] }];
  let kept = keepRideTimeline({}, "2026-11-01T08:00:00Z", one, 2);
  kept = keepRideTimeline(kept, "2026-11-03T08:00:00Z", one, 2);
  kept = keepRideTimeline(kept, "2026-11-02T08:00:00Z", one, 2);
  assert.deepEqual(Object.keys(kept).sort(), ["2026-11-02T08:00:00.000Z", "2026-11-03T08:00:00.000Z"], "The oldest goes.");
  kept = keepRideTimeline(kept, "2026-11-03T08:00:00+00:00", two, 2);
  assert.deepEqual(kept["2026-11-03T08:00:00.000Z"], two);
  assert.equal(keepRideTimeline(kept, "never", one), kept);

  assert.deepEqual(parseRideTimelines(null), {});
  assert.deepEqual(parseRideTimelines("not json"), {});
  assert.deepEqual(parseRideTimelines("[]"), {});
  const mixed = parseRideTimelines(JSON.stringify({
    "2026-11-03T08:00:00.000Z": two,
    "2026-11-04T08:00:00.000Z": [{ phaseIndex: 0, windows: [{ start: 5, end: 4 }] }],
    "2026-11-05T08:00:00.000Z": [{ phaseIndex: 1, windows: [] }, { phaseIndex: 1, windows: [] }],
    "2026-11-06T08:00:00.000Z": [{ phaseIndex: 12, windows: [] }],
    "2026-11-07T08:00:00.000Z": [],
    "2026-11-08T08:00:00+00:00": two,
    "tomorrow": two
  }));
  assert.deepEqual(mixed, { "2026-11-03T08:00:00.000Z": two });

  // A phone with no room, or no storage at all: saving costs nothing, reading finds none.
  const broken = createRideTimelineStore({
    getItem: async () => {
      throw new Error("no storage");
    },
    setItem: async () => {
      throw new Error("no storage");
    },
    removeItem: async () => {
      throw new Error("no storage");
    }
  });
  await broken.save("rider-1", "2026-11-03T08:00:00Z", two);
  assert.equal(await broken.forRide({ riderId: "rider-1", startedAt: "2026-11-03T08:00:00Z" }), null);
  await broken.forget("rider-1", "2026-11-03T08:00:00Z");
}

// --- The chime, wherever the rider is in the app ---------------------------------------------

// One watcher, looking at whatever run it is handed, as useRideCues does.
const watcher = (first: RideRun, at: number) => {
  let watch = watchRideCues(first, at);
  return (run: RideRun, now: number) => {
    const step = nextRideCue(watch, run, phases, now);
    watch = step.watch;
    return step.cue;
  };
};

{
  // On another tab nothing moves the run on: the clock alone does, and the
  // chime comes once for each change it makes.
  const started = startRun(readyRun(), t0);
  const look = watcher(started, t0);
  assert.equal(look(started, t0 + 5 * minute), null);
  assert.equal(look(started, t0 + 10 * minute + 100), "phase", "The warm-up begins.");
  assert.equal(look(started, t0 + 10 * minute + 350), null, "Once.");

  // Back on the ride screen, it hands over the run it moved on: no second chime.
  assert.equal(look(syncRun(started, phases, t0 + 10 * minute + 400).run, t0 + 10 * minute + 600), null);

  // Asleep through the warm-up and the training: one chime, for where the ride is now.
  assert.equal(look(started, t0 + 40 * minute), "phase");
  assert.equal(look(started, t0 + 52 * minute + 100), "done", "The end has its own chime.");
  assert.equal(look(started, t0 + 53 * minute), null);
  assert.equal(look(started, t0 + 2 * hour), null, "Nothing after the end.");
}

{
  // The ride screen moved the run on before the app looked: the app still
  // owes that chime, and rings it once.
  const started = startRun(readyRun(), t0);
  const look = watcher(started, t0 + 9 * minute);
  const handedOver = syncRun(started, phases, t0 + 10 * minute + 50).run;
  assert.equal(look(handedOver, t0 + 10 * minute + 200), "phase");
  assert.equal(look(handedOver, t0 + 10 * minute + 450), null);

  // A skip rang inside its own tap: never again here. The phase after it
  // still rings when its time comes, twenty minutes of training from the skip.
  const skipped = skipPhase(handedOver, phases, t0 + 12 * minute);
  assert.equal(look(skipped, t0 + 12 * minute + 100), null);
  assert.equal(look(skipped, t0 + 17 * minute + 100), null, "The warm-up's planned end passed with it.");
  assert.equal(look(skipped, t0 + 32 * minute + 100), "phase");

  // Paused: the clock stands still, and so does the chime.
  const paused = pauseRun(syncRun(skipped, phases, t0 + 33 * minute).run, t0 + 33 * minute);
  assert.equal(look(paused, t0 + 33 * minute + 100), null);
  assert.equal(look(paused, t0 + 2 * hour), null);
  const resumed = resumeRun(paused, t0 + 2 * hour);
  assert.equal(look(resumed, t0 + 2 * hour + 100), null);
  // The cool-down's 15 minutes from 32 of ride time: done at 47, 14 minutes after the resume.
  assert.equal(look(resumed, t0 + 2 * hour + 14 * minute + 100), "done");
}

{
  // Skipped past the last phase: the phases are done by a tap, and the end
  // the plan had for them later is not the clock's to announce.
  const started = startRun(readyRun(), t0);
  const look = watcher(started, t0);
  let run = started;
  for (const at of [1, 2, 3]) run = skipPhase(run, phases, t0 + at * minute);
  assert.equal(look(run, t0 + 3 * minute + 100), null);
  const done = skipPhase(run, phases, t0 + 4 * minute);
  assert.equal(done.phasesDone, true);
  assert.equal(look(done, t0 + 4 * minute + 100), null);
  assert.equal(look(done, t0 + 30 * minute), null);

  // Done by the clock, handed over by the ride screen before the app looked: rung once.
  const ridden = startRun(readyRun(), t0);
  const lookAgain = watcher(ridden, t0 + 52 * minute - 100);
  const ranOut = syncRun(ridden, phases, t0 + 52 * minute + 10).run;
  assert.equal(ranOut.phasesDone, true);
  assert.equal(lookAgain(ranOut, t0 + 52 * minute + 200), "done");
  assert.equal(lookAgain(ranOut, t0 + 52 * minute + 450), null);
}

{
  // A ride brought back, or a new one, starts where it is: nothing already
  // passed is announced.
  const restored = restoreRun(startRun(readyRun(), t0), phases, t0 + 30 * minute);
  const look = watcher(restored, t0 + 30 * minute);
  assert.equal(look(restored, t0 + 30 * minute + 250), null);
  assert.equal(look(startRun(readyRun(), t0 + 3 * hour), t0 + 3 * hour + 250), null);
  const forgotten = restoreRun(startRun(readyRun(), t0), phases, t0 + 3 * hour);
  const lookForgotten = watcher(forgotten, t0 + 3 * hour);
  assert.equal(lookForgotten(forgotten, t0 + 3 * hour + 250), null, "A ride brought back after its end says nothing.");

  // A pause on a phase's first moment, before anything looked: the change
  // came before the tap, so it is rung, once, and not again on resume.
  const started = startRun(readyRun(), t0);
  const lookLate = watcher(started, t0 + 10 * minute - 100);
  const late = pauseRun(started, t0 + 10 * minute + 100);
  assert.equal(lookLate(late, t0 + 10 * minute + 200), "phase");
  const resumed = resumeRun(late, t0 + 11 * minute);
  assert.equal(lookLate(resumed, t0 + 11 * minute + 250), null);
  assert.equal(lookLate(resumed, t0 + 18 * minute), "phase", "The warm-up's seven minutes, the break left out.");
}

// --- Who owns the cues --------------------------------------------------------------------

{
  const root = process.cwd();
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
    });

  // The ride screen no longer cancels the alerts, nor lets go of the sound,
  // when another tab unmounts it.
  const rideScreen = read("src/features/ride/RideExperience.tsx");
  assert.doesNotMatch(rideScreen, /cancelRideAlerts|cancelStaleRideAlerts|scheduleRideAlerts|upcomingRideAlerts/);
  assert.doesNotMatch(rideScreen, /releaseRideCues|prepareRideCues|holdScreenAwake/);
  assert.match(rideScreen, /cuePhaseChange\("phase", true\);/, "A skip still rings inside its own tap.");
  assert.match(rideScreen, /const finished = finishRun\(run, phases, tick\);/);
  assert.match(rideScreen, /\}, finished\);/, "Finish hands over the finished run with the ride.");

  // App.tsx owns them, for as long as the ride lasts.
  const app = read("src/App.tsx");
  assert.match(app, /useRideCues\(rideActive, ridePlan, rideRun\);/);
  assert.match(app, /const finishRide = \(session: RideCompletion, finishedRun: RideRun\) =>/);
  assert.match(app, /phaseWindows\(finishedRun, ridePlan\.phases\)/);
  // Only on an iPhone, where Apple Health reads it: a shared browser keeps nothing.
  assert.match(app, /if \(timeline && riderId && Platform\.OS === "ios"\) void saveRideTimeline\(riderId, session\.startedAt, timeline\);/);
  assert.equal(app.split("saveRideTimeline(").length - 1, 1);
  // A deleted ride's windows go with it, once the journal has let it go.
  assert.match(app, /await rideJournal\.deleteRide\(id\);\s+\/\/ Its windows on this phone go with it\.\s+if \(deleted\) void forgetRideTimeline\(deleted\.riderId, deleted\.startedAt\);/);

  const cues = read("src/features/ride/useRideCues.ts");
  assert.match(cues, /upcomingRideAlerts\(syncRun\(run, plan\.phases, now\)\.run, plan\.phases, now\)/, "Scheduled from where the clock has the ride, not from its phase index.");
  assert.match(cues, /queueAlerts\(cancelStaleRideAlerts\);/, "An earlier launch's alerts go first.");
  assert.match(cues, /return \(\) => \{\s+releaseScreen\(\);\s+releaseRideCues\(\);[\s\S]{0,320}await cancelRideAlerts\(ids\);/, "Cancelled once, at the ride's end.");
  assert.match(cues, /\}, \[live\]\);/, "The ride's life, not the screen's.");
  assert.match(cues, /\}, \[live, scheduleKey, phases\]\);/);
  assert.match(cues, /nextRideCue\(/);

  // One place schedules the phase alerts, and only the ride's own sounds.
  const schedulers = sourceFiles(join(root, "src")).filter((path) => read(path.slice(root.length + 1)).includes("scheduleRideAlerts("));
  assert.deepEqual(schedulers.sort(), [join(root, "src/features/ride/ride-cues.ts"), join(root, "src/features/ride/useRideCues.ts")]);
  const rideCues = read("src/features/ride/ride-cues.ts");
  assert.match(rideCues, /phase: \{ file: "ride_phase\.wav"/);
  assert.match(rideCues, /done: \{ file: "ride_done\.wav"/);
  assert.match(rideCues, /interruptionMode: "duckOthers"/);
  // The ride's audio mode again before every chime on a phone: a lesson video
  // or Ralf's mic changes the app's one audio session mid-ride, and playing a
  // chime never sets it back. In a browser the chime rings inside the tap.
  assert.match(rideCues, /if \(Platform\.OS === "web"\) \{\s+ring\(kind, tapped\);\s+giveMusicBackLater\(\);\s+return;\s+\}/);
  assert.match(rideCues, /void applyRideAudioMode\(\)\s+\.catch\(\(\) => undefined\)\s+\.finally\(\(\) => \{\s+ring\(kind, tapped\);\s+giveMusicBackLater\(\);/);
  assert.match(rideCues, /if \(Platform\.OS !== "web"\) registerRideAudioMode\(rideAudioMode\);/);
  assert.match(rideCues, /export function releaseRideCues\(\) \{\s+registerRideAudioMode\(null\);/);
  // Ralf's mic holds it while it listens, and hands it back to the ride.
  const voice = read("src/features/coach/useVoiceInput.ts");
  assert.match(voice, /setRideMicListening\(true\);\s+module\.start\(\{/);
  assert.match(voice, /setRideMicListening\(false\);\s+if \(Platform\.OS === "ios"\) \{\s+try \{\s+\/\/ Hand the audio back[\s\S]*?void applyRideAudioMode\(\)\.catch\(\(\) => undefined\);/);
  // Ralf's screen closed with the finger still on the mic: no "end" comes to
  // a listener that is gone, so the mic lets go there, and a session still
  // starting never starts.
  assert.match(
    voice,
    /return \(\) => \{\s+(?:\/\/[^\n]*\n\s+)*released\.current = true;\s+for \(const subscription of subscriptions\) subscription\.remove\(\);\s+try \{\s+module\.abort\(\);\s+\} catch \{\s+\/\/[^\n]*\n\s+\}\s+if \(busy\.current\) finish\(\);\s+\};\s+\}, \[supported, say\]\);/
  );
  assert.match(voice, /const finish = \(\) => \{\s+busy\.current = false;\s+setListening\(false\);\s+setRideMicListening\(false\);/);
  assert.doesNotMatch(voice, /from "\.\.\/ride\/ride-cues"/, "Only the small shared module, not the ride's alerts.");
  assert.match(rideCues, /data: \{ route: alertRoute \}/);

  // The timeline never leaves the phone: nothing that writes to the server knows it.
  const backend = sourceFiles(join(root, "src/backend")).map((path) => read(path.slice(root.length + 1))).join("\n");
  assert.doesNotMatch(backend, /phaseWindows|RidePhaseWindows|rideTimeline|marks/);
  const timeline = read("src/features/ride/ride-timeline.ts");
  assert.match(timeline, /^import type \{ RideEntry \} from "\.\.\/\.\.\/backend";$/m, "The journal's shape, as a type only.");
  assert.doesNotMatch(timeline, /^import \{[^}]*\} from "\.\.\/\.\.\/backend/m);
  assert.doesNotMatch(timeline, /supabase|fetch\(/i);
  assert.match(timeline, /createRideTimelineStore\(AsyncStorage\)/, "On the phone.");
}

// The app's one audio session, between a ride and Ralf's mic.
{
  const session = await import("../src/features/ride/ride-audio-session");
  const applied: string[] = [];
  const ride = async () => {
    applied.push("ride");
  };
  await session.applyRideAudioMode();
  assert.deepEqual(applied, [], "No ride: nothing to put back.");
  session.registerRideAudioMode(ride);
  await session.applyRideAudioMode();
  assert.deepEqual(applied, ["ride"]);
  session.setRideMicListening(true);
  await session.applyRideAudioMode();
  assert.deepEqual(applied, ["ride"], "Never while the mic listens: it would cut the question short.");
  session.setRideMicListening(false);
  await session.applyRideAudioMode();
  assert.deepEqual(applied, ["ride", "ride"]);
  session.registerRideAudioMode(null);
  await session.applyRideAudioMode();
  assert.deepEqual(applied, ["ride", "ride"], "The ride over: the session is the app's again.");
}

console.log("Ride timeline passed.");
