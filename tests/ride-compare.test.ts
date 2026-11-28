import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RideEnd, RideEntry, RidePhaseEntry } from "../src/backend/contracts";
import { mentionsHealthConcern } from "../supabase/functions/_shared/coach-safety";
import type { PlanVersion } from "../src/domain/training-streak";
import {
  baselineOf,
  compareRide,
  comparisonForRalf,
  everyPhaseLine,
  feelingLine,
  lastRidesPhrase,
  nextSameWeekday,
  peerPosition,
  planAgainDays,
  repeatPlanOf,
  ridePeers,
  rideTrend,
  scheduledOn,
  scopeLabel,
  streakAround,
  weekAround,
  weekdayHabit
} from "../src/features/ride/ride-compare";
import { RIDE_REVIEW_PROMPT_LIMIT, rideComparePrompt, rideReviewFactsFromEntry } from "../src/features/ride/ride-review-prompt";

// The past-activity screen shows a ride among its siblings: the same
// training on the same horse, before and after it. These are the numbers
// and the sentences it shows, and the plan it hands back to ride again.

// Days are the rider's local calendar; the fixtures are written in UTC.
const machineZone = process.env.TZ;
process.env.TZ = "UTC";

const TODAY = "2026-11-28";
const phase = (title: string, detail: string, minutes: number, actual?: number | null): RidePhaseEntry => ({
  title,
  detail,
  plannedSeconds: minutes * 60,
  ...(actual === null ? {} : { actualSeconds: (actual ?? minutes) * 60 })
});
/** The yard's four phases, with the minutes each ran; null for one never reached. */
const usual = (pre: number, warm: number, work: number | null, cool: number | null, training = "Jumping") => [
  phase("Pre warm-up", "Walk", 10, pre),
  phase("Warm-up", "Trot", 7, warm),
  phase("Training", training, 20, work),
  phase("Cool-down", "Trot & walk", 15, cool)
];

const ride = (id: string, day: string, minutes: number, patch: Partial<RideEntry> = {}): RideEntry => {
  const startedAt = `${day}T${patch.startedAt ?? "20:00:00"}Z`;
  const completedAt = new Date(Date.parse(startedAt) + minutes * 60_000).toISOString();
  return {
    id,
    riderId: "rider-a",
    horseId: "daimon",
    discipline: "jumping",
    trainingType: "jumping",
    focus: "Jumping",
    plannedDuration: "52 min",
    elapsedSeconds: minutes * 60,
    completedPhases: 4,
    totalPhases: 4,
    source: "live",
    createdAt: completedAt,
    updatedAt: completedAt,
    ...patch,
    startedAt,
    completedAt
  };
};

// Nine Jumping rides with Daimon, eight of them on a Tuesday. 3 November was
// added by hand afterwards, with no feeling.
const jumping = [
  ride("j1", "2026-10-06", 40, { phases: usual(10, 7, 13, 10), mood: "tender" }),
  ride("j2", "2026-10-13", 44, { phases: usual(10, 7, 16, 11), mood: "focused" }),
  ride("j3", "2026-10-17", 38, { phases: usual(10, 7, 21, null), completedPhases: 3, mood: "fresh" }),
  ride("j4", "2026-10-20", 47, { phases: usual(10, 7, 18, 12), mood: "focused" }),
  ride("j5", "2026-10-27", 49, { phases: usual(10, 7, 17, 15), mood: "focused" }),
  ride("j6", "2026-11-03", 52, { phases: usual(10, 7, 20, 15), source: "manual" }),
  ride("j7", "2026-11-10", 50, { phases: usual(10, 7, 18, 15), mood: "fresh" }),
  ride("j8", "2026-11-17", 46, { phases: usual(10, 7, 20, null), completedPhases: 3, mood: "focused" }),
  ride("j9", "2026-11-24", 51, { phases: usual(10, 7, 19, 15), mood: "focused" })
];
const thisRide = jumping[5]!;
// The same week on Daimon, another horse's Jumping, and a ride from before the setup sheet.
const others = [
  ride("flat", "2026-11-02", 40, { trainingType: "flatwork", discipline: "dressage", startedAt: "08:00:00" }),
  ride("poles", "2026-11-05", 35, { trainingType: "pole-work" }),
  ride("hack", "2026-11-07", 60, { trainingType: "hack", discipline: "trail" }),
  ride("luna", "2026-11-04", 45, { horseId: "luna" }),
  ride("old", "2026-11-01", 30, { trainingType: undefined })
];
// The journal, newest first.
const journal = [...jumping, ...others].sort((left, right) => Date.parse(right.completedAt) - Date.parse(left.completedAt));
const words = { training: "Jumping", horse: "Daimon" };

// --- Peers ------------------------------------------------------------------------------
{
  const peers = ridePeers(journal, thisRide);
  assert.deepEqual(peers.map((peer) => peer.id), ["j1", "j2", "j3", "j4", "j5", "j6", "j7", "j8", "j9"], "Same horse and training, oldest first.");
  const position = peerPosition(peers, thisRide);
  assert.equal(position.index, 5);
  assert.equal(position.count, 9);
  assert.equal(position.previous?.id, "j5");
  assert.equal(position.next?.id, "j7");
  assert.equal(peerPosition(peers, jumping[0]!).previous, undefined, "The first ride has none before it.");
  assert.equal(peerPosition(peers, jumping[8]!).next, undefined, "and the newest none after it.");

  assert.deepEqual(
    ridePeers(journal, thisRide, "training").map((peer) => peer.id),
    ["j1", "j2", "j3", "j4", "j5", "j6", "luna", "j7", "j8", "j9"],
    "Jumping on any horse."
  );
  const daimon = ridePeers(journal, thisRide, "horse").map((peer) => peer.id);
  assert.ok(daimon.includes("flat") && daimon.includes("hack") && !daimon.includes("luna"), "Every training with Daimon.");
  assert.ok(!daimon.includes("old"), "A ride from before the setup sheet has no training to compare.");
  assert.deepEqual(ridePeers(journal, others[4]!), [], "and is compared with nothing.");
  // A ride with no horse reads every horse's, as the streak does for a rider with none.
  const unhorsed = { ...thisRide, horseId: undefined };
  assert.ok(ridePeers([...journal.filter((entry) => entry.id !== thisRide.id), unhorsed], unhorsed).some((peer) => peer.id === "luna"));
  // The ride itself is always among them, even before the journal holds it again.
  assert.deepEqual(ridePeers([], thisRide).map((peer) => peer.id), ["j6"]);

  assert.equal(scopeLabel("horse+training", words), "Jumping with Daimon");
  assert.equal(scopeLabel("training", words), "Jumping, any horse");
  assert.equal(scopeLabel("horse", words), "All rides with Daimon");
  assert.equal(scopeLabel("horse+training", { training: "Jumping" }), "Jumping");
  assert.equal(lastRidesPhrase("horse+training", words, 5), "your last 5 Jumping rides with Daimon");
  assert.equal(lastRidesPhrase("horse", words, 1), "your last ride with Daimon");
  assert.equal(lastRidesPhrase("training", words, 3), "your last 3 Jumping rides");
}

// --- Comparing -------------------------------------------------------------------------
const peers = ridePeers(journal, thisRide);
{
  const average = compareRide(thisRide, peers, "average", { words });
  assert.deepEqual(average.baseline.map((entry) => entry.id), ["j1", "j2", "j3", "j4", "j5"], "The last five before it.");
  assert.equal(average.minutes, 52);
  assert.equal(average.logged, true);
  assert.equal(average.averageMinutes, 44, "40, 44, 38, 47 and 49.");
  assert.equal(average.deltaMinutes, 8);
  assert.equal(average.sentence, "8 min longer than your usual Jumping with Daimon (44 min)");
  assert.equal(average.longest, true);
  assert.equal(average.loggedInBaseline, 0);
  assert.deepEqual(average.phases, { reached: 4, total: 4, timed: 5, everyPhase: 4 });
  assert.equal(everyPhaseLine(average), "every phase in 4 of 5");
  assert.deepEqual(average.feelings.tally[0], { mood: "focused", rides: 3 });
  assert.equal(feelingLine(average), "focused in 3 of 5");

  // The usual time in each phase is what the clock measured, matched by title.
  const rows = Object.fromEntries(average.phaseRows.map((row) => [row.title, row]));
  assert.equal(rows["Pre warm-up"]?.usualSeconds, 600);
  assert.equal(rows["Training"]?.usualSeconds, 17 * 60, "13, 16, 21, 18 and 17.");
  assert.equal(rows["Cool-down"]?.usualSeconds, 12 * 60, "Over the four rides that reached it.");
  assert.equal(rows["Cool-down"]?.matched, 4);
  assert.equal(rows["Training"]?.seconds, 20 * 60);
  assert.deepEqual(average.explains, [{ title: "Training", minutes: 3 }, { title: "Cool-down", minutes: 3 }]);
  assert.equal(average.phaseSummary, "The extra 8 min went to Training (+3) and Cool-down (+3).");

  const previous = compareRide(thisRide, peers, "previous", { words });
  assert.equal(previous.reference?.entry?.id, "j5");
  assert.equal(previous.deltaMinutes, 3);
  assert.equal(previous.sentence, "3 min longer than your last Jumping ride with Daimon (49 min on Tue 27 Oct)");
  assert.equal(previous.phaseSummary, average.phaseSummary, "The phases card always reads against the usual.");

  const best = compareRide(thisRide, peers, "best", { words });
  assert.equal(best.reference?.minutes, 49);
  assert.equal(best.sentence, "Longer than any of your last 5 Jumping rides with Daimon (longest 49 min)");

  // A shorter ride, against each.
  const shorter = compareRide(jumping[7]!, peers, "best", { words });
  assert.equal(shorter.reference?.entry?.id, "j6", "The longest of the five before 17 Nov.");
  assert.equal(shorter.sentence, "6 min shorter than the longest of your last 5 Jumping rides with Daimon (52 min on Tue 3 Nov)");
  assert.equal(shorter.loggedInBaseline, 1);
  assert.equal(everyPhaseLine(shorter), "every phase in 3 of 4 timed", "The ride added by hand recorded every phase: it is not counted.");
  const level = compareRide({ ...jumping[7]!, elapsedSeconds: 47 * 60 }, peers, "average", { words });
  assert.equal(level.averageMinutes, 47, "38, 47, 49, 52 and 50.");
  assert.equal(level.sentence, "The same as your usual Jumping with Daimon (47 min)");
  const less = compareRide(jumping[7]!, peers, "average", { words });
  assert.equal(less.deltaMinutes, -1);
  assert.equal(less.sentence, "1 min shorter than your usual Jumping with Daimon (47 min)");
  // Its phases: the usual comes from the timed rides only, 3 Nov's typed minutes left out.
  assert.equal(less.phaseRides, 4);
  assert.equal(less.phaseRows.find((row) => row.title === "Cool-down")?.seconds, undefined, "Not reached on 17 Nov.");
}

{
  // The first ride: nothing to compare against, and nothing invented.
  const first = compareRide(jumping[0]!, peers, "average", { words });
  assert.equal(first.baseline.length, 0);
  assert.equal(first.averageMinutes, null);
  assert.equal(first.reference, null);
  assert.equal(first.deltaMinutes, null);
  assert.equal(first.sentence, null);
  assert.equal(first.longest, false);
  assert.equal(first.phaseSummary, null);
  assert.ok(first.phaseRows.every((row) => row.usualSeconds === undefined));
  assert.deepEqual(comparisonForRalf(first, "horse+training", words), []);

  // One ride before: the usual, the longest and the last are that ride.
  for (const kind of ["average", "best", "previous"] as const) {
    assert.equal(
      compareRide(jumping[1]!, peers, kind, { words }).sentence,
      "4 min longer than your last Jumping ride with Daimon (40 min on Tue 6 Oct)",
      kind
    );
  }
  assert.equal(everyPhaseLine(compareRide(jumping[1]!, peers)), "every phase in 1 of 1");
  assert.equal(feelingLine(compareRide(jumping[1]!, peers)), "tender in 1 of 1");
}

{
  // Rides added by hand: their minutes count as minutes, never as the clock's
  // time in a phase, and "every phase" is only counted where one could be missed.
  const allLogged = jumping.slice(0, 5).map((entry) => ({
    ...entry,
    source: "manual" as const,
    mood: undefined,
    phases: entry.phases?.map(({ actualSeconds: _actual, ...rest }) => rest)
  }));
  const comparison = compareRide(thisRide, [...allLogged, thisRide], "average", { words });
  assert.equal(comparison.averageMinutes, 44);
  assert.equal(comparison.loggedInBaseline, 5);
  assert.equal(comparison.phaseRides, 0);
  assert.equal(comparison.phaseSummary, null, "No timed ride, no phase to compare with.");
  assert.ok(comparison.phaseRows.every((row) => row.usualSeconds === undefined && row.matched === 0));
  assert.equal(everyPhaseLine(comparison), null);
  assert.equal(feelingLine(comparison), "no feelings saved", "A feeling nobody saved is never filled in.");

  // A phase this ride added is new; the same title twice lines up by order.
  const extra = {
    ...jumping[8]!,
    phases: [...usual(10, 7, 12, 15), phase("Canter", "Canter", 5), phase("Training", "Grid", 7)]
  };
  const rows = compareRide(extra, peers, "average", { words }).phaseRows;
  assert.equal(rows.length, 6);
  assert.equal(rows[4]?.title, "Canter");
  assert.equal(rows[4]?.usualSeconds, undefined, "New this time.");
  assert.equal(rows[4]?.matched, 0);
  assert.ok(rows[2]?.usualSeconds !== undefined, "The first Training matches the others' Training.");
  assert.equal(rows[5]?.usualSeconds, undefined, "The second Training has no second one to match.");
  // A ride with fewer phases still lines up with the ones it has.
  const short = compareRide({ ...jumping[8]!, phases: usual(10, 7, 20, 15).slice(0, 2), totalPhases: 2, completedPhases: 2 }, peers);
  assert.equal(short.phaseRows.length, 2);
  assert.ok(short.phaseRows.every((row) => row.usualSeconds !== undefined));
}

// --- The trend ---------------------------------------------------------------------------
{
  const trend = rideTrend(thisRide, peers);
  assert.equal(trend.points.length, 9);
  assert.equal(trend.newest, true);
  assert.equal(trend.points.findIndex((point) => point.current), 5);
  assert.deepEqual(trend.points.map((point) => point.minutes), [40, 44, 38, 47, 49, 52, 50, 46, 51]);
  assert.equal(trend.points[5]?.logged, true);
  assert.equal(trend.points[5]?.mood, undefined);
  assert.equal(trend.points[2]?.reached, 3);

  // An old ride among many: the bars around it, never a window without it.
  const many = Array.from({ length: 20 }, (_, index) => ride(`m${index}`, `2026-09-${String(index + 1).padStart(2, "0")}`, 30 + index));
  const old = rideTrend(many[3]!, many);
  assert.deepEqual(old.points.map((point) => point.entry.id), ["m0", "m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"]);
  assert.equal(old.newest, false);
  const middle = rideTrend(many[10]!, many);
  assert.equal(middle.points[4]?.entry.id, "m10", "Centred on it.");
  const recent = rideTrend(many[14]!, many);
  assert.equal(recent.newest, true, "The newest nine when they hold it.");
  assert.equal(rideTrend(many[14]!, many, 7).points.length, 7, "As many as the screen has room for.");

  assert.equal(weekdayHabit(peers, "horse+training", words), "8 of your 9 Jumping rides with Daimon were on a Tuesday.");
  assert.equal(weekdayHabit(peers.slice(0, 3), "horse+training", words), null, "Three rides are not a habit.");
  assert.equal(weekdayHabit([peers[0]!, peers[1]!, peers[3]!, peers[4]!], "horse+training", words), "All of your 4 Jumping rides with Daimon were on a Tuesday.");
  assert.equal(weekdayHabit(many.slice(0, 7), "horse+training", words), null, "A ride a day is no weekday habit.");
}

// --- The week and the streak ----------------------------------------------------------------
// Monday Flatwork, Tuesday Jumping, Thursday Pole work and Saturday Hack, from 2 November.
const plan: PlanVersion = {
  effectiveFrom: "2026-11-02",
  days: [
    { weekday: 1, trainingType: "flatwork", horseId: "daimon" },
    { weekday: 2, trainingType: "jumping", horseId: "daimon" },
    { weekday: 4, trainingType: "pole-work", horseId: "daimon" },
    { weekday: 6, trainingType: "hack", horseId: "daimon" },
    { weekday: 3, trainingType: "jumping", horseId: "luna" }
  ]
};
{
  const week = weekAround(thisRide, journal, { today: TODAY, plan: [plan] });
  assert.ok(week);
  assert.equal(week.day, "2026-11-03");
  assert.equal(week.planned, true);
  assert.deepEqual(week.days.map((day) => day.state), ["ridden", "ridden", "rest", "ridden", "rest", "ridden", "rest"]);
  assert.equal(week.rides, 4, "Luna's Wednesday is not Daimon's.");
  assert.ok(week.days.every((day) => !day.isToday), "A week gone has no today in it.");

  // Without a plan, only the days trained show.
  const unplanned = weekAround(thisRide, journal, { today: TODAY });
  assert.equal(unplanned?.planned, false);
  assert.deepEqual(unplanned?.days.map((day) => day.state), ["ridden", "ridden", "rest", "ridden", "rest", "ridden", "rest"]);
  const before = weekAround(jumping[4]!, journal, { today: TODAY, plan: [plan] });
  assert.equal(before?.planned, false, "27 October came before the plan.");

  // This week: the days gone without a ride are missed, today is still planned.
  const current = weekAround(jumping[8]!, journal, { today: TODAY, plan: [plan] });
  assert.deepEqual(current?.days.map((day) => day.state), ["missed", "ridden", "rest", "missed", "rest", "planned", "rest"]);
  assert.equal(current?.days[5]?.isToday, true);
  // Time off: a planned day the horse was off is neither missed nor planned.
  const off = weekAround(jumping[8]!, journal, {
    today: TODAY,
    plan: [plan],
    timeOff: [{ horseId: "daimon", kind: "rest", startsOn: "2026-11-26", endsOn: "2026-11-26" }]
  });
  assert.equal(off?.days[3]?.state, "off");

  const completions: RideEnd[] = journal.map((entry) => ({ completedAt: entry.completedAt, ...(entry.horseId ? { horseId: entry.horseId } : {}) }));

  // The journal page starts mid-week: the days before it come from every
  // ride end the app knows, so they read as ridden, not missed.
  const pageStart = journal.filter((entry) => entry.completedAt >= thisRide.completedAt);
  const partial = weekAround(thisRide, pageStart, { today: TODAY, plan: [plan], completions });
  assert.deepEqual(partial?.days.map((day) => day.state), ["ridden", "ridden", "rest", "ridden", "rest", "ridden", "rest"]);
  assert.equal(partial?.rides, 4, "Counted from every end that week, not only the loaded page.");
  const withoutEnds = weekAround(thisRide, pageStart, { today: TODAY, plan: [plan] });
  assert.equal(withoutEnds?.days[0]?.state, "missed", "Without the full ends, Monday looked missed: the reason completions are passed.");

  // A ride from 23:40 to 00:25 belongs to the day it started, as in the calendar.
  const late = ride("late", "2026-10-25", 45, { startedAt: "23:40:00" });
  const lateWeek = weekAround(late, [late], { today: TODAY });
  assert.equal(lateWeek?.day, "2026-10-25");
  assert.equal(lateWeek?.days[6]?.day, "2026-10-25", "Sunday is in the card's week.");
  assert.equal(lateWeek?.days[6]?.state, "ridden");
  assert.equal(lateWeek?.rides, 1);
  assert.deepEqual(
    streakAround(thisRide, { versions: [plan], completions }, TODAY),
    { day: 2, now: 0, best: 4 },
    "Monday and Tuesday of its week; the week went on to Thursday and Saturday, then Monday was missed."
  );
  assert.equal(streakAround(jumping[4]!, { versions: [plan], completions }, TODAY), null, "Before the plan there was no streak.");
  assert.equal(streakAround(others[3]!, { versions: [plan], completions: [] }, TODAY), null, "A ride the streak has not counted is no day of it.");
}

// --- Doing it again -------------------------------------------------------------------------
{
  assert.equal(nextSameWeekday("2026-11-03", TODAY), "2026-12-01", "The next Tuesday after a Saturday.");
  assert.equal(nextSameWeekday("2026-11-03", "2026-12-01"), "2026-12-08", "Today is not next: a week on.");
  assert.equal(nextSameWeekday("2026-11-07", "2026-11-27"), "2026-11-28");
  assert.deepEqual(planAgainDays(thisRide, peers, TODAY), ["2026-12-01"], "One Saturday is no second habit.");
  const thursdays = [...peers, ride("t1", "2026-10-22", 40), ride("t2", "2026-10-29", 40)];
  assert.deepEqual(planAgainDays(thisRide, thursdays, TODAY), ["2026-12-01", "2026-12-03"], "Tuesday, and the Thursday it is also ridden on.");
  assert.deepEqual(planAgainDays(thisRide, thursdays, "2026-12-01"), ["2026-12-03", "2026-12-08"], "Soonest first.");

  const planned = [
    { day: "2026-12-01", horseId: "daimon", status: "planned" as const },
    { day: "2026-12-03", horseId: "luna", status: "planned" as const },
    { day: "2026-12-08", horseId: "daimon", status: "skipped" as const }
  ];
  assert.equal(scheduledOn(planned, "2026-12-01", "daimon"), true);
  assert.equal(scheduledOn(planned, "2026-12-03", "daimon"), false, "Luna's plan leaves Daimon's day open.");
  assert.equal(scheduledOn(planned, "2026-12-08", "daimon"), false, "A plan let go is no plan.");
  assert.equal(scheduledOn(planned, "2026-12-03", undefined), false, "No horse to plan for: another horse's plan leaves the day open.");
  assert.equal(scheduledOn([...planned, { day: "2026-12-03", status: "planned" as const }], "2026-12-03", undefined), true, "Only an activity without a horse blocks it.");

  const repeat = repeatPlanOf(thisRide);
  assert.equal(repeat.trainingType?.id, "jumping");
  assert.deepEqual(repeat.phases?.map((item) => [item.title, item.detail, item.minutes]), [
    ["Pre warm-up", "Walk", 10], ["Warm-up", "Trot", 7], ["Training", "Jumping", 20], ["Cool-down", "Trot & walk", 15]
  ]);
  assert.equal(repeat.startMinutes, 20 * 60);
  assert.equal(new Set(repeat.phases?.map((item) => item.id)).size, 4, "Every phase keeps an id of its own.");
  assert.equal(repeatPlanOf(ride("late", "2026-11-03", 20, { startedAt: "23:55:00" })).startMinutes, 23 * 60 + 45, "Never past the last quarter hour.");
  assert.equal(repeatPlanOf(ride("odd", "2026-11-03", 20, { startedAt: "07:53:00" })).startMinutes, 8 * 60);
  const odd = repeatPlanOf(ride("x", "2026-11-03", 20, {
    trainingType: "show-jumping",
    phases: Array.from({ length: 12 }, (_, index) => ({ title: `P${index}`, plannedSeconds: index === 0 ? 0 : 200 * 60 }))
  }));
  assert.equal(odd.trainingType?.label, "Show jumping", "A training the app no longer lists still reads as words.");
  assert.equal(odd.phases?.length, 8);
  assert.equal(odd.phases?.[0]?.minutes, 1);
  assert.equal(odd.phases?.[1]?.minutes, 90);
  assert.equal(odd.phases?.[1]?.detail, "");
  const bare = repeatPlanOf(ride("bare", "2026-11-03", 20, { trainingType: undefined }));
  assert.equal(bare.trainingType, undefined, "The setup sheet's own training then.");
  assert.equal(bare.phases, undefined);
}

// --- Asking Ralf ------------------------------------------------------------------------------
{
  const comparison = compareRide(thisRide, peers, "average", { words });
  const lines = comparisonForRalf(comparison, "horse+training", words);
  assert.deepEqual(lines, [
    "Compared with my last 5 Jumping rides with Daimon (Tue 6 Oct to Tue 27 Oct): they averaged 44 min; I reached every phase in 4 of 5; Daimon felt focused in 3 of 5.",
    "This one was 8 min longer: Training +3, Cool-down +3."
  ]);
  const question = "What changed, and what should my next Jumping ride with Daimon look like?";
  const prompt = rideComparePrompt(rideReviewFactsFromEntry(thisRide, "Daimon"), lines, question);
  assert.ok(prompt.startsWith("Compare my session on Tue 3 Nov: Jumping with Daimon.\n\n"), "The day first, for Ralf's history title.");
  assert.ok(prompt.includes("I added it by hand afterwards, so the app did not time it. It lasted 52 min."));
  assert.ok(prompt.includes("Training (Jumping): 20 min."));
  assert.ok(prompt.endsWith(`${lines.join("\n")}\n\n${question}`));
  assert.ok(prompt.length < RIDE_REVIEW_PROMPT_LIMIT);
  assert.ok(!mentionsHealthConcern(prompt), prompt);
  assert.ok(!prompt.includes("—"));

  // One ride before, logged; every feeling; no horse.
  const one = comparisonForRalf(compareRide(jumping[1]!, peers, "average", { words }), "horse+training", words);
  assert.deepEqual(one, [
    "Compared with my last Jumping ride with Daimon (Tue 6 Oct): it lasted 40 min; I reached every phase; Daimon felt tender.",
    "This one was 4 min longer: Training +3, Cool-down +1."
  ]);
  const loggedBefore = [{ ...jumping[0]!, source: "manual" as const, mood: undefined }, jumping[1]!];
  assert.deepEqual(comparisonForRalf(compareRide(jumping[1]!, loggedBefore), "horse+training", { training: "Jumping" }), [
    "Compared with my last Jumping ride (Tue 6 Oct): it lasted 40 min; I added it by hand; no feeling was saved for it.",
    "This one was 4 min longer."
  ]);
  // Across horses, the tally is never pinned on this ride's horse.
  const mixed = [
    ride("l1", "2026-11-02", 40, { horseId: "luna", mood: "tender" }),
    ride("l2", "2026-11-04", 40, { horseId: "luna", mood: "tender" }),
    ride("l3", "2026-11-05", 40, { horseId: "luna", mood: "tender" }),
    ride("d1", "2026-11-07", 44, { mood: "fresh" })
  ];
  const later = ride("d2", "2026-11-10", 52);
  const acrossHorses = comparisonForRalf(compareRide(later, [...mixed, later], "average", { words }), "training", words).join(" ");
  assert.ok(!acrossHorses.includes("Daimon felt"), acrossHorses);
  assert.ok(acrossHorses.includes("the horses felt tender in 3 of 4"), acrossHorses);
  for (const mood of ["fresh", "focused", "tender"] as const) {
    const moody = peers.map((entry) => ({ ...entry, mood }));
    const text = rideComparePrompt(
      rideReviewFactsFromEntry({ ...thisRide, mood }, "Daimon"),
      comparisonForRalf(compareRide({ ...thisRide, mood }, moody), "horse+training", words),
      "Why was this one longer?"
    );
    assert.ok(!mentionsHealthConcern(text), text);
  }

  // The question is never cut, the comparison is kept, and the whole fits.
  const fullest = rideComparePrompt(rideReviewFactsFromEntry({
    ...thisRide,
    riderNote: "n".repeat(2000),
    phases: Array.from({ length: 12 }, () => ({ title: "t".repeat(60), detail: "d".repeat(60), plannedSeconds: 5400, actualSeconds: 5400 }))
  }, "h".repeat(80)), ["c".repeat(2000)], question);
  assert.ok(fullest.length <= RIDE_REVIEW_PROMPT_LIMIT, `${fullest.length}`);
  assert.ok(fullest.endsWith(`...\n\n${question}`));
}

assert.equal(baselineOf(thisRide, peers).length, 5);

if (machineZone === undefined) delete process.env.TZ;
else process.env.TZ = machineZone;

// --- Wiring --------------------------------------------------------------------------------
{
  const source = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
  const app = source("src/App.tsx");
  const sheet = source("src/features/ride/RideJournalSheet.tsx");
  const cards = source("src/features/ride/RideContextCards.tsx");
  const setup = source("src/features/ride/RideSetupSheet.tsx");

  // The feeling and the note are saved in place, through the journal.
  assert.match(app, /onUpdate=\{rideJournal\.updateRide\}/);
  assert.match(sheet, /await onUpdate\(entry\.id, \{ mood: moodName\[mood\] \}\);/);
  assert.match(sheet, /await onUpdate\(entry\.id, \{ riderNote: next \}\);/);
  assert.match(sheet, /if \(!onUpdate \|\| pendingMood \|\| mood === entry\.mood\) return;/, "A feeling is set, never cleared.");

  // Repeat this ride opens the setup sheet through the override the
  // notification branch also uses, and every way the sheet closes clears it.
  assert.match(app, /const rideSetupSheetDraft = rideSetupOverride\s+\? \{[\s\S]{0,200}phases: rideSetupOverride\.phases \?\? phasesFor/, "The sheet takes the repeated ride's own phases.");
  const repeat = app.slice(app.indexOf("const repeatJournalRide = "), app.indexOf("const planJournalRideAgain = "));
  assert.match(repeat, /setRideJournalOpen\(false\);[\s\S]*setRideSetupOverride\(\{[\s\S]*setRideSetupOpen\(true\);/, "The journal closes, then the sheet opens filled in.");
  assert.match(repeat, /if \(rideActive\) return;/);
  assert.match(app, /const confirmRideSetup = \(plan: RidePlan\) => \{\s+setRideSetupOpen\(false\);\s+closeRideSetupExtras\(\);/);
  assert.match(app, /const closeRideSetupExtras = \(\) => \{\s+setRideSetupOverride\(null\);/);
  assert.match(app, /onDismiss=\{\(\) => \{\s+setRideSetupOpen\(false\);\s+closeRideSetupExtras\(\);\s+\}\}/);
  assert.match(app, /setRideSetupOpen\(false\);\s+setRideSetupOverride\(null\);\s+setAddActivityOpen\(false\);/, "Signing out drops it too.");

  // Plan it again goes through Add activity's own day and schedule mode,
  // at the hour the ride was ridden.
  const plan = app.slice(app.indexOf("const planJournalRideAgain = "));
  assert.match(plan, /setRideJournalOpen\(false\);[\s\S]*setActivityOverride\(\{[\s\S]*setAddActivityDay\(day\);\s+setAddActivityOpen\(true\);/);
  assert.match(app, /const activityDraft = activityOverride \?\? \{/);
  assert.match(app, /startMinutes=\{activityOverride\?\.startMinutes\}/);
  assert.match(app, /setAddActivityOpen\(false\);\s+setActivityOverride\(null\);\s+refresh\("Scheduled\. It's on your calendar\."\);/);
  assert.match(setup, /requestedDay && requestedDay > openingToday \? requestedStart \?\? 9 \* 60 : opening\.startMinutes/);

  // Ralf gets the comparison in the message, and the journal closes first.
  assert.match(sheet, /rideComparePrompt\(rideReviewFactsFromEntry\(entry, horse\), comparisonForRalf\(compared, shownScope, words\), question\)/);
  assert.match(app, /prompt \?\? rideReviewPrompt\(rideReviewFactsFromEntry\(entry, horseId \? horseNames\[horseId\] : undefined\)\)/);
  assert.match(app, /onAskRalf=\{ralfAvailable \? reviewJournalRideWithRalf : undefined\}/, "No Ralf, no card.");
  assert.match(app, /onOpenDay=\{\(day\) => \{\s+setRideJournalOpen\(false\);\s+rideJournal\.clearError\(\);\s+setCalendarDay\(day\);/);

  // The streak of a past ride reads the plan's own completions.
  assert.match(source("src/features/ride/useTrainingPlan.ts"), /return \{\s+versions,\s+timeOff,[\s\S]*?completions,/);
  assert.match(app, /completions: trainingPlan\.completions/);

  // Large text, screen readers and Reduce Motion.
  assert.match(cards, /const STACK_ABOVE_FONT_SCALE = 1\.4;/);
  assert.match(cards, /style=\{\[styles\.tiles, stacked && styles\.tilesStacked\]\}/, "The tiles stack at large text sizes.");
  assert.match(cards, /AccessibilityInfo\.announceForAccessibility\(`\$\{trainingWordOf\(target\)\}, \$\{rideDayLabel\(target\)\}`\);/, "Stepping says which ride is on screen.");
  assert.match(cards, /if \(reducedMotion\) \{\s+grow\.setValue\(1\);\s+return;\s+\}/, "Bars appear at once with Reduce Motion.");
  assert.match(cards, /Math\.floor\(width \/ TAP_TARGET\)/, "No bar is narrower than a tap target.");
  for (const [name, text] of [["sheet", sheet], ["cards", cards]] as const) {
    assert.doesNotMatch(text, /react-native-gesture-handler|react-native-reanimated|PanResponder/, `${name}: chevrons, not gestures.`);
    assert.doesNotMatch(text, /!"|![\s]*<\/Text>/, `${name}: no exclamation marks.`);
  }
}

console.log("Ride compare passed.");

{
  // The weekday habit counts every ride in scope, not just the bars that fit on screen.
  const cards = readFileSync(join(process.cwd(), "src/features/ride/RideContextCards.tsx"), "utf8");
  assert.match(cards, /const habit = weekdayHabit\(peers, scope, words\);/);
  // The plan chips check the horse Plan it again schedules for.
  const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(app, /planHorseFor=\{\(entry\) => rideHorseFor\(entry\) \?\? activityDraft\.horseId\}/);
  const sheet = readFileSync(join(process.cwd(), "src/features/ride/RideJournalSheet.tsx"), "utf8");
  assert.match(sheet, /scheduledOn\(planned, day, planHorseFor \? planHorseFor\(entry\) : entry\.horseId\)/);
  assert.match(sheet, /completions: training\.completions/);
}
