import assert from "node:assert/strict";
import type { RidePhaseEntry } from "../src/backend/contracts";
import { mentionsHealthConcern } from "../supabase/functions/_shared/coach-safety";
import { effortChartLayout, MIN_LABELLED_BAND, ribbonFits } from "../src/features/health/effort-chart";
import {
  clockLabel,
  DENSE_GAP_MS,
  effortChartSteps,
  effortFootnotes,
  effortForRalf,
  effortInsight,
  effortPhaseName,
  effortStatsSpoken,
  KCAL_NOTE,
  MAX_SERIES_POINTS,
  mergeWindows,
  noEffortMessage,
  RALF_EFFORT_CONSENT,
  RALF_EFFORT_LIMIT,
  RALF_EFFORT_SWITCH_DETAIL,
  riddenWindows,
  rideEffortState,
  SPARSE_NOTE,
  summarizeRideEffort,
  WATCH_WAIT_MS,
  WORKOUT_TIP,
  type HeartRateReading,
  type RideEffortReading
} from "../src/features/health/ride-effort";
import { defaultRidePhases, rideTrainingTypes, type RidePhaseWindows } from "../src/features/ride/ride-plan";
import {
  RIDE_REVIEW_PROMPT_LIMIT,
  rideComparePrompt,
  rideReviewPrompt,
  type RideReviewFacts
} from "../src/features/ride/ride-review-prompt";

// The rider's effort on a ride, from Apple Health (2026-11-28). Heart rate and
// calories stay on the phone; the numbers below are worked out there, when
// a ride opens, and never stored.

const second = 1000;
const minute = 60 * second;
const t0 = Date.UTC(2026, 10, 3, 20, 0, 0);
const ride = { start: t0, end: t0 + 52 * minute };

// The usual shape: walk 10, trot 7, the training 20, trot and walk 15.
const phases: RidePhaseEntry[] = [
  { title: "Pre warm-up", detail: "Walk", plannedSeconds: 600, actualSeconds: 600 },
  { title: "Warm-up", detail: "Trot", plannedSeconds: 420, actualSeconds: 420 },
  { title: "Training", detail: "Jumping", plannedSeconds: 1200, actualSeconds: 1200 },
  { title: "Cool-down", detail: "Trot & walk", plannedSeconds: 900, actualSeconds: 900 }
];
const backToBack = (minutes: number[], from = t0): RidePhaseWindows[] => {
  let cursor = from;
  return minutes.map((length, phaseIndex) => {
    const window = { start: cursor, end: cursor + length * minute };
    cursor = window.end;
    return { phaseIndex, windows: [window] };
  });
};
const windows = backToBack([10, 7, 20, 15]);
const levels = [98, 121, 146, 112];

/** A reading every `every` ms over [from, to), at the phase's level. */
const readingsOver = (from: number, to: number, every: number, bpmAt: (at: number) => number): HeartRateReading[] => {
  const readings: HeartRateReading[] = [];
  for (let at = from; at < to; at += every) readings.push({ at, bpm: bpmAt(at) });
  return readings;
};
const levelAt = (at: number) => {
  const index = windows.findIndex((phase) => phase.windows.some((window) => at >= window.start && at < window.end));
  return levels[index] ?? 80;
};
const workout = (heartRate: HeartRateReading[], extra: Partial<RideEffortReading> = {}): RideEffortReading => ({
  capture: "watch-workout",
  sourceLabel: "Apple Watch",
  heartRate,
  ...extra
});

// --- A watch workout: a reading every five seconds -----------------------------------

const peakAt = t0 + 31 * minute;
const dense = readingsOver(t0, ride.end, 5 * second, levelAt).map((reading) => (reading.at === peakAt ? { ...reading, bpm: 171 } : reading));
const denseEffort = summarizeRideEffort(workout(dense, { activeKcal: 412.4 }), ride, windows);
{
  assert.equal(rideEffortState(denseEffort), "dense");
  assert.equal(denseEffort.dense, true);
  assert.equal(denseEffort.typicalGapMs, 5 * second);
  assert.ok(denseEffort.coverage > 0.999, "Every minute of the ride has a reading.");
  assert.deepEqual(denseEffort.phases.map((phase) => phase.avgBpm), [98, 121, 146, 112], "Each phase's average is its own readings'.");
  assert.equal(denseEffort.maxBpm, 171, "The one high reading is the highest.");
  assert.equal(denseEffort.maxAt, peakAt);
  assert.equal(denseEffort.minBpm, 98);
  assert.equal(denseEffort.activeKcal, 412);
  // Weighted by time: (98·10 + 121·7 + 146·20 + 112·15) / 52 = 123.6.
  assert.equal(denseEffort.avgBpm, 124, "The ride's average agrees with its phases', each by its minutes.");
  assert.equal(denseEffort.series.length, 1, "No gap, one line.");
  assert.ok(denseEffort.series[0]!.length <= MAX_SERIES_POINTS, "Thinned for a phone-wide chart.");
  assert.ok(denseEffort.series[0]!.length >= 200, "A point every 15 s: 208 for 52 minutes.");
  assert.equal(effortInsight(denseEffort, windows, phases), "Your heart rate peaked at 171 during Jumping.");
  assert.deepEqual(effortFootnotes(denseEffort, { placement: "timed", phases }), [KCAL_NOTE], "Nothing else to say about a full workout.");
}

// The ride's average is the phases' averages weighted by the time each was measured, whatever the readings.
{
  let seed = 7;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const irregular = readingsOver(t0, ride.end, 4 * second, () => 0)
    .filter(() => random() > 0.3)
    .map((reading) => ({ ...reading, bpm: 70 + Math.round(random() * 110) }));
  const effort = summarizeRideEffort(workout(irregular), ride, windows);
  const covered = effort.phases.reduce((sum, phase) => sum + phase.coveredMs, 0);
  const fromPhases = effort.phases.reduce((sum, phase) => sum + (phase.avgBpm ?? 0) * phase.coveredMs, 0) / covered;
  assert.ok(Math.abs(fromPhases - (effort.avgBpm ?? 0)) <= 1, "Rounding aside, the two agree.");
}

// --- Pauses, gaps and the edges ------------------------------------------------------

// A pause is not ridden: what the watch read during it counts for nothing.
{
  const paused: RidePhaseWindows[] = [
    { phaseIndex: 0, windows: [{ start: t0, end: t0 + 10 * minute }] },
    { phaseIndex: 1, windows: [{ start: t0 + 15 * minute, end: t0 + 22 * minute }] }
  ];
  const window = { start: t0, end: t0 + 22 * minute };
  // Read while standing, strictly inside the break.
  const readings = readingsOver(t0, window.end, 5 * second, (at) =>
    at > t0 + 10 * minute && at < t0 + 15 * minute ? 200 : at <= t0 + 10 * minute ? 100 : 130
  );
  const effort = summarizeRideEffort(workout(readings), window, paused);
  assert.equal(effort.maxBpm, 130, "The break's readings are left out, the highest too.");
  assert.deepEqual(effort.phases.map((phase) => phase.avgBpm), [100, 130]);
  assert.deepEqual(effort.phases.map((phase) => phase.riddenMs), [10 * minute, 7 * minute]);
  assert.ok(effort.coverage > 0.999, "Coverage is of the time ridden.");
  assert.equal(effort.series.length, 2, "The line breaks over the break.");
  assert.deepEqual(riddenWindows(window, paused), paused.flatMap((phase) => phase.windows));
}

// Six minutes without a reading in the middle of the training: the line breaks and the card says where.
{
  const gapFrom = t0 + 25 * minute;
  const gapTo = t0 + 31 * minute;
  const readings = dense.filter((reading) => reading.at < gapFrom || reading.at >= gapTo);
  const effort = summarizeRideEffort(workout(readings), ride, windows);
  assert.equal(effort.series.length, 2);
  assert.equal(effort.longestGap?.phaseIndex, 2);
  assert.ok(Math.abs((effort.longestGap?.ms ?? 0) - 6 * minute) <= 5 * second);
  assert.ok(effort.coverage < 0.97 && effort.coverage > 0.9, "Four of the six minutes have no reading within a minute.");
  assert.deepEqual(effortFootnotes(effort, { placement: "timed", phases }), ["No reading for 6 min during Jumping."]);
}

// The watch started ten minutes late: the start is the gap.
{
  const late = dense.filter((reading) => reading.at >= t0 + 10 * minute);
  const effort = summarizeRideEffort(workout(late), ride, windows);
  assert.equal(effort.phases[0]!.avgBpm, null, "No reading in the walk: the trot's first is not the walk's.");
  assert.equal(effort.phases[0]!.readings, 0);
  // It does stand for the minute before it, which is the walk's last.
  assert.equal(effort.phases[0]!.coveredMs, minute, "One minute of the walk is covered, from its edge.");
  assert.ok(effort.coverage < 0.83 && effort.coverage > 0.82, "Nine minutes of 52 have no reading within a minute.");
  assert.equal(effort.longestGap?.phaseIndex, 0);
  assert.ok(effortFootnotes(effort, { placement: "timed", phases }).includes("No reading for 10 min during Walk."));
}

// What a sensor cannot have read is not a heart rate; two readings at once are averaged.
{
  const effort = summarizeRideEffort(
    workout([
      { at: t0 + minute, bpm: 0 },
      { at: t0 + 2 * minute, bpm: 300 },
      { at: t0 + 3 * minute, bpm: Number.NaN },
      { at: t0 + 4 * minute, bpm: 110 },
      { at: t0 + 4 * minute, bpm: 120 }
    ]),
    ride,
    windows
  );
  assert.equal(effort.readings, 1);
  assert.equal(effort.maxBpm, 115);
}

// Readings just outside the ride count for the minute they reach into it, no more.
{
  const effort = summarizeRideEffort(workout([{ at: t0 - 30 * second, bpm: 90 }, { at: ride.end + 5 * minute, bpm: 180 }]), ride, windows);
  assert.equal(effort.readings, 1, "Five minutes after the end is not the ride.");
  assert.equal(effort.maxBpm, 90);
  assert.ok(Math.abs(effort.coverage - (30 * second) / (52 * minute)) < 1e-9);
}

assert.deepEqual(
  mergeWindows([{ start: 5, end: 9 }, { start: 0, end: 5 }, { start: 12, end: 12 }, { start: 8, end: 10 }]),
  [{ start: 0, end: 10 }],
  "Touching windows join; an empty one goes."
);
assert.deepEqual(riddenWindows(ride, []), [ride], "A ride from before ride setup was ridden from start to end.");

// --- Readings minutes apart: no workout on the watch --------------------------------

const sparse = readingsOver(t0 + 2 * minute, ride.end, 5 * minute, levelAt);
const sparseEffort = summarizeRideEffort({ capture: "samples", sourceLabel: "Apple Watch", heartRate: sparse }, ride, windows);
{
  assert.equal(sparse.length, 10);
  assert.equal(rideEffortState(sparseEffort), "sparse");
  assert.equal(sparseEffort.dense, false);
  assert.equal(sparseEffort.typicalGapMs, 5 * minute);
  assert.ok(Math.abs(sparseEffort.coverage - 0.38) < 0.02, "Two minutes of every five have a reading within a minute.");
  assert.equal(sparseEffort.series.length, 1, "Dots joined while none is missing.");
  assert.equal(sparseEffort.series[0]!.length, 10, "Drawn as they are.");
  assert.deepEqual(effortFootnotes(sparseEffort, { placement: "timed", phases }), [SPARSE_NOTE, WORKOUT_TIP]);
  // A reading minutes from the next phase is still only its own phase's.
  assert.deepEqual(sparseEffort.phases.map((phase) => phase.avgBpm), [98, 121, 146, 112]);
  assert.equal(effortInsight(sparseEffort, windows, phases), "Your heart rate peaked at 146 during Jumping.", "Read at the moment the jumping began: the jumping's.");
  // Joined up to three times the usual gap (fifteen minutes); further apart, the line breaks.
  const twoMissing = sparse.filter((_, index) => index !== 4 && index !== 5);
  assert.equal(summarizeRideEffort({ capture: "samples", heartRate: twoMissing }, ride, windows).series.length, 1);
  const threeMissing = sparse.filter((_, index) => index < 4 || index > 6);
  assert.equal(summarizeRideEffort({ capture: "samples", heartRate: threeMissing }, ride, windows).series.length, 2);
}

// A handful of readings: the numbers, no chart.
{
  const few = summarizeRideEffort({ capture: "samples", heartRate: sparse.slice(0, 3) }, ride, windows);
  assert.equal(rideEffortState(few), "few");
  assert.deepEqual(effortFootnotes(few, { placement: "timed", phases }), [WORKOUT_TIP]);
  const line = effortForRalf(few, { phases, placement: "timed" });
  assert.ok(line && !line.includes("By phase"), "Three readings say nothing about each phase.");
  assert.match(line ?? "", /Measured every few minutes, not during a workout\.$/);
}

// Calories alone, prorated by the time they share with the ride when there is no total.
{
  const effort = summarizeRideEffort(
    {
      capture: "samples",
      heartRate: [],
      energy: [
        { start: t0 - 10 * minute, end: t0 + 10 * minute, kcal: 100 },
        { start: t0 + 20 * minute, end: t0 + 21 * minute, kcal: 30 },
        { start: ride.end + minute, end: ride.end + 2 * minute, kcal: 50 }
      ]
    },
    ride,
    windows
  );
  assert.equal(effort.activeKcal, 80);
  assert.equal(rideEffortState(effort), "few");
  assert.equal(effortForRalf(effort, { phases, placement: "timed" }), "My active energy from Apple Health (mine, not my horse's): 80 kcal.");
  assert.deepEqual(effortStatsSpoken(effort), {
    avg: "Average heart rate, no reading",
    max: "Highest heart rate, no reading",
    kcal: "Active calories, 80 kilocalories"
  });
}

// Nothing at all.
{
  const nothing = summarizeRideEffort({ capture: "samples", heartRate: [] }, ride, windows);
  assert.equal(rideEffortState(nothing), "none");
  assert.equal(effortForRalf(nothing, { phases, placement: "timed" }), null, "Ralf gets no line about nothing.");
  assert.equal(effortInsight(nothing, windows, phases), null);
  const span = `${clockLabel(ride.start)} to ${clockLabel(ride.end)}`;
  // Equina cannot tell "not allowed" from "nothing there", and a watch syncs late.
  assert.deepEqual(noEffortMessage({ window: ride, manual: false, now: ride.end + 10 * minute }), {
    title: "Waiting for your Apple Watch",
    body: "Heart rate usually arrives a few minutes after the ride.",
    waiting: true
  });
  assert.deepEqual(noEffortMessage({ window: ride, manual: false, now: ride.end + WATCH_WAIT_MS }), {
    title: "No heart rate for this ride",
    body: `Apple Health has nothing from ${span}. If you wore your watch, check that Equina may read Heart Rate in the Apple Health app.`,
    waiting: false
  });
  assert.equal(
    noEffortMessage({ window: ride, manual: true, now: ride.end + minute }).body,
    `Added by hand, and Apple Health has nothing from ${span}.`,
    "A ride added by hand is not waiting for a watch."
  );
}

// --- Phases placed by minutes, not by the clock -------------------------------------

{
  assert.deepEqual(effortFootnotes(denseEffort, { placement: "typed", phases })[0], "Phase lines follow the minutes you typed, so they may be a little off.");
  assert.deepEqual(effortFootnotes(denseEffort, { placement: "estimated", phases })[0], "Phase lines follow each phase's minutes, so after a break they may be a little off.");
  const noPhases = summarizeRideEffort(workout(dense), ride, []);
  assert.ok(!effortFootnotes(noPhases, { placement: "typed" }).some((note) => note.startsWith("Phase lines")), "No phases, no phase lines.");
  assert.equal(noPhases.phases.length, 0);
  assert.equal(effortInsight(noPhases, [], undefined), "Your heart rate peaked at 171.");
}

assert.equal(effortPhaseName(phases[0], 0), "Walk", "The pre warm-up is the walk.");
assert.equal(effortPhaseName({ title: "Grid work", detail: "" }, 1), "Grid work");
assert.equal(effortPhaseName(undefined, 2), "Phase 3");

// --- VoiceOver -----------------------------------------------------------------------

assert.deepEqual(effortStatsSpoken(denseEffort), {
  avg: "Average heart rate, 124 beats per minute",
  max: "Highest heart rate, 171 beats per minute",
  kcal: "Active calories, 412 kilocalories"
});
assert.deepEqual(effortChartSteps(denseEffort, windows, phases), [
  "Whole ride, 52 minutes: average 124, highest 171 beats per minute, in Jumping at minute 31.",
  "Walk, minutes 0 to 10: average 98.",
  "Trot, minutes 10 to 17: average 121.",
  "Jumping, minutes 17 to 37: average 146, highest 171.",
  "Trot & walk, minutes 37 to 52: average 112."
]);

// --- The chart's geometry ------------------------------------------------------------

{
  const layout = effortChartLayout(denseEffort, windows, phases, { width: 311, height: 112 });
  assert.deepEqual(layout.bands.map((band) => band.name), ["Walk", "Trot", "Jumping", "Trot & walk"]);
  assert.deepEqual(layout.bands.map((band) => band.tinted), [false, true, false, true], "Alternate bands, named, so colour is not the only signal.");
  assert.ok(Math.abs(layout.bands.reduce((sum, band) => sum + band.width, 0) - 311) < 0.5, "The bands fill the width.");
  assert.equal(layout.boundaries.length, 3);
  assert.equal(layout.lines.length, 1);
  assert.equal(layout.areas.length, 1);
  assert.equal(layout.yMin, 80, "About ten below the lowest.");
  assert.equal(layout.yMax, 190, "About ten above the highest.");
  assert.ok(layout.gridlines.length >= 1 && layout.gridlines.length <= 2);
  for (const point of layout.points) assert.ok(point.x >= 0 && point.x <= 311 && point.y >= 0 && point.y <= 112);
  assert.equal(layout.max?.label, "171");
  assert.equal(layout.endLabel, "52 min");
  assert.ok(layout.bands.every((band) => band.avg?.label), "Every band is wide enough for its number.");
  assert.equal(ribbonFits(layout.bands, 1), true);
  assert.equal(ribbonFits(layout.bands, 2), false, "Large text: numbers, and the names listed below.");

  // The peak's number and its band's average never print on top of each other.
  const flat = summarizeRideEffort({ capture: "samples", heartRate: sparse }, ride, windows);
  const flatLayout = effortChartLayout(flat, windows, phases, { width: 311, height: 112 });
  const jumping = flatLayout.bands[2]!;
  assert.equal(flatLayout.max?.label, "146");
  assert.ok(jumping.avg && jumping.avg.label === null, "The jumping's 146 is the peak's label already.");
  assert.equal(flatLayout.bands[0]!.avg?.label, "98");

  const narrow = effortChartLayout(denseEffort, windows, phases, { width: 150, height: 112 });
  const trot = narrow.bands[1]!;
  assert.ok(trot.width < MIN_LABELLED_BAND && trot.avg && trot.avg.label === null, "A band too narrow keeps its line and drops its number.");
  assert.equal(ribbonFits(narrow.bands, 1), false);
}

// --- Ralf ----------------------------------------------------------------------------

const denseLine = effortForRalf(denseEffort, { phases, placement: "timed" });
assert.equal(
  denseLine,
  "My heart rate from Apple Health (mine, not my horse's): average 124 bpm, highest 171 bpm, active energy 412 kcal. By phase: Walk 98, Trot 121, Jumping 146, Trot & walk 112 bpm."
);
assert.ok(!/\n/.test(denseLine ?? ""), "One line.");
assert.ok(!/\d{1,2}:\d{2}|Watch|Oura/.test(denseLine ?? ""), "No time of day and no device.");
assert.match(
  effortForRalf(denseEffort, { phases, placement: "typed" }) ?? "",
  /The phase heart rates follow minutes I typed afterwards\.$/
);
{
  const long: RidePhaseEntry[] = phases.map((phase, index) => ({ ...phase, detail: `${"Very long phase name ".repeat(4)}${index}` }));
  assert.ok((effortForRalf(denseEffort, { phases: long, placement: "timed" }) ?? "").length <= RALF_EFFORT_LIMIT);
}

// In the question, after the phases it is split by; the question stays whole.
{
  const facts: RideReviewFacts = {
    training: "Jumping",
    horseName: "Daimon",
    startedAt: new Date(t0).toISOString(),
    elapsedSeconds: 52 * 60,
    plannedDuration: "52 min",
    completedPhases: 4,
    totalPhases: 4,
    phases,
    mood: "focused",
    note: "Good rhythm over the grid. ".repeat(30),
    logged: false
  };
  const without = rideReviewPrompt(facts);
  const withEffort = rideReviewPrompt({ ...facts, effort: denseLine ?? undefined });
  assert.ok(!without.includes("heart rate"), "Nothing about the heart rate unless it was allowed.");
  assert.ok(withEffort.indexOf(denseLine ?? "") > withEffort.indexOf("Trot & walk"), "After the phase lines.");
  assert.ok(withEffort.indexOf(denseLine ?? "") < withEffort.indexOf("Daimon felt focused"), "Before the feeling and the note.");
  assert.ok(withEffort.length <= RIDE_REVIEW_PROMPT_LIMIT);
  const question = "What changed, and what should my next Jumping ride with Daimon look like?";
  const compared = rideComparePrompt({ ...facts, effort: denseLine ?? undefined }, ["Usually 45 min over your last 5 Jumping rides with Daimon."], question);
  assert.ok(compared.endsWith(question) && compared.length <= RIDE_REVIEW_PROMPT_LIMIT);
  assert.equal(rideReviewPrompt({ ...facts, effort: "  " }), without, "A blank line adds nothing.");
  // The coach's health filter answers a health worry with a fixed reply. A
  // heart rate is training effort, and must never read as one.
  assert.equal(mentionsHealthConcern(withEffort), false);
  assert.equal(mentionsHealthConcern(compared), false);
}

// Every training's phases, every state: the line never trips the filter.
for (const training of rideTrainingTypes) {
  const entries: RidePhaseEntry[] = defaultRidePhases(training).map((phase) => ({
    title: phase.title,
    detail: phase.detail,
    plannedSeconds: phase.minutes * 60,
    actualSeconds: phase.minutes * 60
  }));
  for (const effort of [denseEffort, sparseEffort]) {
    for (const placement of ["timed", "estimated", "typed"] as const) {
      const line = effortForRalf(effort, { phases: entries, placement });
      assert.ok(line);
      assert.equal(mentionsHealthConcern(line), false, `${training.label}: ${line}`);
    }
  }
}

// The question asked before anything is sent names who would receive it.
{
  assert.equal(RALF_EFFORT_CONSENT.title, "Let Ralf use your heart rate?");
  assert.match(RALF_EFFORT_CONSENT.message, /heart rate and calories/);
  assert.match(RALF_EFFORT_CONSENT.message, /sent to Anthropic with your question to write the answer/);
  assert.equal(RALF_EFFORT_SWITCH_DETAIL, "From Apple Health, only in the rides you ask about. Sent to Anthropic, who writes Ralf's replies.");
  assert.match(RALF_EFFORT_CONSENT.message, /never the full line/);
  assert.match(RALF_EFFORT_CONSENT.message, /Account, Privacy and Ralf/);
  assert.deepEqual([RALF_EFFORT_CONSENT.allow, RALF_EFFORT_CONSENT.notNow], ["Allow", "Not now"]);
}

// The card's words: sentence case, no exclamation marks, Apple Health by its name.
{
  const words = [
    SPARSE_NOTE,
    WORKOUT_TIP,
    KCAL_NOTE,
    RALF_EFFORT_CONSENT.title,
    RALF_EFFORT_CONSENT.message,
    ...effortFootnotes(denseEffort, { placement: "typed", phases }),
    noEffortMessage({ window: ride, manual: false, now: ride.end + 10 * minute }).title,
    noEffortMessage({ window: ride, manual: false, now: ride.end + WATCH_WAIT_MS }).body
  ];
  for (const text of words) {
    assert.ok(!text.includes("!"), text);
    assert.ok(!/healthkit/i.test(text), text);
    assert.match(text, /^[A-Z]/, text);
  }
}

assert.ok(DENSE_GAP_MS === 60_000, "A line through readings a minute apart at most.");

console.log("Ride effort passed.");
