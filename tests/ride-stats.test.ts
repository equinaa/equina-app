import assert from "node:assert/strict";
import type { RideEntry } from "../src/backend/contracts";
import {
  describeMood,
  describeTracked,
  describeTrend,
  periodBounds,
  previousBounds,
  rideDay,
  ridesWithin,
  summarise,
  withRide
} from "../src/domain/ride-stats";
import { localDayOf, localToday, startOfPreviousMonth } from "../src/domain/local-day";

// A Sunday, chosen on purpose: the week must still start on the Monday before.
const TODAY = "2026-09-27";

let sequence = 0;
const ride = (patch: Partial<RideEntry> = {}): RideEntry => ({
  id: `ride-${(sequence += 1)}`,
  riderId: "rider-a",
  discipline: "jumping",
  focus: "Poles and rhythm",
  startedAt: "2026-09-27T09:00:00Z",
  completedAt: "2026-09-27T09:30:00Z",
  elapsedSeconds: 1800,
  completedPhases: 3,
  totalPhases: 3,
  createdAt: "2026-09-27T09:30:00Z",
  updatedAt: "2026-09-27T09:30:00Z",
  ...patch
});

const need = <T>(value: T | null, what: string): T => {
  assert.ok(value !== null, `expected ${what}`);
  return value as T;
};

// Days are the rider's local calendar. The fixtures below are written in UTC,
// so the file runs in UTC and puts the machine's zone back at the end; the
// checks about other zones set their own.
const machineZone = process.env.TZ;
process.env.TZ = "UTC";

const withTimeZone = <T>(zone: string, run: () => T): T => {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    return run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
};

// Weeks start on Monday -- the convention every yard and competition calendar
// already runs on. A Sunday belongs to the week that began six days earlier.
{
  const week = need(periodBounds("week", TODAY), "a week");
  assert.deepEqual(week, { start: "2026-09-21", endExclusive: "2026-09-28" });

  const monday = need(periodBounds("week", "2026-09-21"), "a week");
  assert.deepEqual(monday, week, "Monday and the Sunday after it are the same week.");

  assert.deepEqual(
    need(previousBounds("week", week), "a previous week"),
    { start: "2026-09-14", endExclusive: "2026-09-21" }
  );
}

// Months are calendar months, and the previous month crosses a year boundary
// without special-casing.
{
  const month = need(periodBounds("month", TODAY), "a month");
  assert.deepEqual(month, { start: "2026-09-01", endExclusive: "2026-10-01" });

  const january = need(periodBounds("month", "2026-01-15"), "a month");
  assert.deepEqual(
    need(previousBounds("month", january), "a previous month"),
    { start: "2025-12-01", endExclusive: "2026-01-01" },
    "December of the previous year."
  );

  const february = need(periodBounds("month", "2028-02-10"), "a month");
  assert.deepEqual(february, { start: "2028-02-01", endExclusive: "2028-03-01" },
    "A leap February still ends when March begins.");
}

// A bad date produces nothing rather than a wrong window.
{
  assert.equal(periodBounds("week", "not-a-date"), null);
  assert.equal(periodBounds("month", "2026-13-01"), null);
}

// The boundary is inclusive at the start and exclusive at the end, so a ride
// at the first instant of the next week belongs to that week, not this one.
withTimeZone("UTC", () => {
  const week = need(periodBounds("week", TODAY), "a week");
  const rides = ridesWithin(
    [
      ride({ completedAt: "2026-09-20T23:59:59Z" }),
      ride({ completedAt: "2026-09-21T00:00:00Z" }),
      ride({ completedAt: "2026-09-27T23:59:59Z" }),
      ride({ completedAt: "2026-09-28T00:00:00Z" })
    ],
    week
  );
  assert.equal(rides.length, 2);
  assert.deepEqual(rides.map((entry) => rideDay(entry)), ["2026-09-21", "2026-09-27"]);
});

// A ride belongs to the day the rider was living in when it ended, not the
// UTC day. The same instant is Monday in Bucharest and still Sunday in Sao
// Paulo, so it lands in different weeks for the two riders.
{
  const lateSunday = ride({ completedAt: "2026-09-20T22:30:00Z" });
  const week = need(periodBounds("week", TODAY), "a week");

  withTimeZone("Europe/Bucharest", () => {
    assert.equal(rideDay(lateSunday), "2026-09-21", "01:30 on Monday in Bucharest is Monday.");
    assert.equal(ridesWithin([lateSunday], week).length, 1, "and it counts in that Monday's week.");
  });
  withTimeZone("America/Sao_Paulo", () => {
    assert.equal(rideDay(lateSunday), "2026-09-20", "19:30 on Sunday in Sao Paulo is Sunday.");
    assert.equal(ridesWithin([lateSunday], week).length, 0, "and it belongs to the week before.");
  });
}

// "Today" is local too: at 22:00 in Sao Paulo it is still today there, even
// though UTC has moved on to tomorrow.
withTimeZone("America/Sao_Paulo", () => {
  assert.equal(localToday(Date.parse("2026-10-25T01:00:00Z")), "2026-10-24");
  assert.equal(localDayOf("not a date"), null);
});

// The journal loads back to local midnight on the first of last month, which
// is where the month summary's comparison starts.
withTimeZone("Europe/Bucharest", () => {
  const since = startOfPreviousMonth(Date.parse("2026-10-25T09:00:00Z"));
  assert.equal(localDayOf(since), "2026-09-01");
  assert.equal(since.getHours(), 0);
  assert.equal(localDayOf(startOfPreviousMonth(Date.parse("2026-01-10T09:00:00Z"))), "2025-12-01", "January looks back into last year.");
});

// A ride logged after the fact goes where it belongs in the journal, not on
// top, so it never becomes "your last ride".
{
  const today = ride({ id: "today", completedAt: "2026-09-27T09:30:00Z" });
  const monday = ride({ id: "monday", completedAt: "2026-09-21T09:30:00Z" });
  const wednesday = ride({ id: "wednesday", completedAt: "2026-09-23T18:00:00+00:00" });
  const journal = withRide([today, monday], wednesday);
  assert.deepEqual(journal.map((entry) => entry.id), ["today", "wednesday", "monday"]);
  assert.deepEqual(
    withRide(journal, { ...wednesday, mood: "fresh" }).map((entry) => entry.id),
    ["today", "wednesday", "monday"],
    "Saving the same ride again replaces it rather than adding a second."
  );
  assert.equal(withRide([], today)[0]?.id, "today");
}

// The summary counts rides, days ridden, trainings and moods from the real
// entries, and nothing else.
{
  const summary = need(summarise(
    [
      ride({ completedAt: "2026-09-22T09:00:00Z", discipline: "dressage", mood: "fresh", focus: "Transitions" }),
      ride({ completedAt: "2026-09-22T17:00:00Z", discipline: "dressage", mood: "fresh", focus: "Transitions" }),
      ride({ completedAt: "2026-09-25T09:00:00Z", discipline: "jumping", mood: "tender", focus: "Poles" }),
      ride({ completedAt: "2026-09-14T09:00:00Z", discipline: "jumping" })
    ],
    "week",
    TODAY
  ), "a summary");

  assert.equal(summary.rides, 3, "Only this week's rides count.");
  assert.equal(summary.previousRides, 1, "The ride on the 14th lands in the previous week.");
  assert.equal(summary.daysRidden, 2, "Two rides on one day is one day ridden.");
  assert.deepEqual(summary.trainings, [
    { value: "dressage", rides: 2 },
    { value: "jumping", rides: 1 }
  ]);
  assert.deepEqual(summary.moods, [
    { value: "fresh", rides: 2 },
    { value: "tender", rides: 1 }
  ]);
  assert.deepEqual(summary.focuses, ["Poles", "Transitions"], "Most recent focus first, no repeats.");
  assert.equal(summary.phasesCompleted, 9);
  assert.equal(summary.phasesPlanned, 9);
}

// Rider discipline is not training type. A jumping rider's week is mostly
// flat work: each ride counts as what it was set up as, and a ride from before
// the setup sheet still counts under its discipline.
{
  const summary = need(summarise(
    [
      ride({ completedAt: "2026-09-21T09:00:00Z", discipline: "jumping", trainingType: "dressage", focus: "Dressage" }),
      ride({ completedAt: "2026-09-22T09:00:00Z", discipline: "jumping", trainingType: "flatwork", focus: "Flatwork" }),
      ride({ completedAt: "2026-09-24T09:00:00Z", discipline: "jumping", trainingType: "jumping", focus: "Jumping" }),
      ride({ completedAt: "2026-09-25T09:00:00Z", discipline: "jumping", trainingType: "dressage", focus: "Dressage" }),
      ride({ completedAt: "2026-09-26T09:00:00Z", discipline: "jumping", focus: "Poles and rhythm" })
    ],
    "week",
    TODAY
  ), "a summary");
  assert.deepEqual(summary.trainings, [
    { value: "dressage", rides: 2 },
    { value: "jumping", rides: 2 },
    { value: "flatwork", rides: 1 }
  ]);
}

// A ride with no mood recorded contributes nothing to the mood tally rather
// than being counted as some default feeling.
{
  const summary = need(summarise(
    [ride({ mood: "fresh" }), ride({}), ride({})],
    "week",
    TODAY
  ), "a summary");
  assert.equal(summary.rides, 3);
  assert.deepEqual(summary.moods, [{ value: "fresh", rides: 1 }]);
  assert.equal(describeMood(summary), "Felt fresh in 1 of 1 logged",
    "Three rides and one check-in must never read as \"felt fresh\" -- that would claim two feelings nobody entered.");
}

// An empty period is empty. No encouragement, no invented streak.
{
  const summary = need(summarise([], "week", TODAY), "a summary");
  assert.equal(summary.rides, 0);
  assert.equal(summary.daysRidden, 0);
  assert.deepEqual(summary.trainings, []);
  assert.equal(describeTrend(summary), null);
  assert.equal(describeMood(summary), null);
}

// Comparison only happens when there is something real to compare against.
// "Up 3 from nothing" is the invented encouragement this app removed once.
{
  const firstEver = need(summarise([ride(), ride(), ride()], "week", TODAY), "a summary");
  assert.equal(firstEver.previousRides, 0);
  assert.equal(describeTrend(firstEver), null, "A first week has no previous week to beat.");

  const compare = (current: number, before: number) => {
    const entries = [
      ...Array.from({ length: current }, () => ride({ completedAt: "2026-09-22T09:00:00Z" })),
      ...Array.from({ length: before }, () => ride({ completedAt: "2026-09-15T09:00:00Z" }))
    ];
    return describeTrend(need(summarise(entries, "week", TODAY), "a summary"));
  };
  assert.equal(compare(3, 2), "One more than last week");
  assert.equal(compare(2, 3), "One fewer than last week");
  assert.equal(compare(3, 3), "Same as last week");
  assert.equal(compare(5, 2), "3 more than last week");
  assert.equal(compare(1, 4), "3 fewer than last week");
}

// Tracked time is reported only when the timer recorded something a person
// would call time. The four production rides run 2 to 9 seconds each, because
// the timer counts while the app is open -- reporting "17 seconds this week"
// as training time would be worse than reporting nothing.
{
  assert.equal(describeTracked(0), null);
  assert.equal(describeTracked(17), null, "Seconds of clock time are not a training summary.");
  assert.equal(describeTracked(59), null);
  assert.equal(describeTracked(60), "1 min tracked");
  assert.equal(describeTracked(1800), "30 min tracked");
  assert.equal(describeTracked(3600), "1 h tracked");
  assert.equal(describeTracked(5400), "1 h 30 min tracked");
  assert.equal(describeTracked(7200), "2 h tracked");
}

// The phrase for how the horse felt.
{
  const moodOf = (moods: Array<string | undefined>) =>
    describeMood(need(summarise(moods.map((mood) => ride({ mood: mood as RideEntry["mood"] })), "week", TODAY), "a summary"));
  assert.equal(moodOf(["fresh"]), "Felt fresh");
  assert.equal(moodOf(["fresh", "fresh"]), "Felt fresh every time");
  assert.equal(moodOf(["fresh", "fresh", "tender"]), "Felt fresh in 2 of 3 logged");
  assert.equal(moodOf([undefined, undefined]), null);
}

// Negative or corrupt numbers never drag a total below zero.
{
  const summary = need(summarise(
    [ride({ elapsedSeconds: -500, completedPhases: -2, totalPhases: 3 })],
    "week",
    TODAY
  ), "a summary");
  assert.equal(summary.trackedSeconds, 0);
  assert.equal(summary.phasesCompleted, 0);
  assert.equal(summary.phasesPlanned, 3);
}

if (machineZone === undefined) delete process.env.TZ;
else process.env.TZ = machineZone;

console.log("Ride journal summaries passed.");
