import assert from "node:assert/strict";
import {
  addMonths,
  canPickRangeDay,
  daysInMonth,
  fullDayLabel,
  lastPickableDay,
  monthGrid,
  monthLabel,
  monthOf,
  pickRangeDay,
  rangePosition,
  weekdayInitials,
  type RangePick
} from "../src/domain/calendar-month";
import { addDays } from "../src/domain/training-streak";
import { timeOffLimits, timeOffProblem } from "../src/features/records/time-off";

// The month grid behind the time off calendar, and the first and last day
// picked from it.

// Months and their names.
{
  assert.equal(monthOf("2026-11-24"), "2026-11");
  assert.equal(monthLabel("2026-11"), "November 2026");
  assert.equal(fullDayLabel("2026-11-24"), "Tuesday 24 November 2026");
  assert.equal(fullDayLabel("2028-02-29"), "Tuesday 29 February 2028");
  assert.equal(weekdayInitials.length, 7);
  assert.equal(weekdayInitials[0], "M", "The week starts on Monday.");
}

// Moving between months, across the year.
{
  assert.equal(addMonths("2026-11", 1), "2026-12");
  assert.equal(addMonths("2026-12", 1), "2027-01", "December rolls into January of the next year.");
  assert.equal(addMonths("2027-01", -1), "2026-12", "And back.");
  assert.equal(addMonths("2026-11", 14), "2028-01");
  assert.equal(addMonths("2026-03", -15), "2024-12");
  assert.equal(addMonths("2026-11", 0), "2026-11");
}

// How long a month is.
{
  assert.equal(daysInMonth("2026-11"), 30);
  assert.equal(daysInMonth("2026-12"), 31);
  assert.equal(daysInMonth("2027-02"), 28);
  assert.equal(daysInMonth("2028-02"), 29, "2028 is a leap year.");
  assert.equal(daysInMonth("2100-02"), 28, "A century that is not a leap year.");
  assert.equal(daysInMonth("2000-02"), 29, "A century that is.");
}

// November 2026 starts on a Sunday: six empty cells, then the 1st.
{
  const grid = monthGrid("2026-11");
  assert.equal(grid.length, 6, "A 30-day month that starts on a Sunday takes six weeks.");
  assert.deepEqual(grid[0], [null, null, null, null, null, null, "2026-11-01"]);
  assert.deepEqual(grid[1], ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07", "2026-11-08"]);
  assert.deepEqual(grid[5], ["2026-11-30", null, null, null, null, null, null]);
  assert.equal(grid.every((row) => row.length === 7), true, "Every row is a whole week.");
  assert.equal(grid.flat().filter(Boolean).length, 30);
}

// February 2027 starts on a Monday and is four full rows.
{
  const grid = monthGrid("2027-02");
  assert.equal(grid.length, 4);
  assert.equal(grid.flat().includes(null), false, "No empty cell.");
  assert.equal(grid[0]?.[0], "2027-02-01");
  assert.equal(grid[3]?.[6], "2027-02-28");
}

// A leap February: the 29th is there, on its own row.
{
  const grid = monthGrid("2028-02");
  assert.equal(grid.length, 5);
  assert.deepEqual(grid[0], [null, "2028-02-01", "2028-02-02", "2028-02-03", "2028-02-04", "2028-02-05", "2028-02-06"]);
  assert.deepEqual(grid[4], ["2028-02-28", "2028-02-29", null, null, null, null, null]);
}

// The grid of a January picks up where December's left off.
{
  const december = monthGrid("2026-12").flat().filter(Boolean);
  const january = monthGrid(addMonths("2026-12", 1)).flat().filter(Boolean);
  assert.equal(december.at(-1), "2026-12-31");
  assert.equal(january[0], "2027-01-01");
  assert.deepEqual(monthGrid("2027-01")[0], [null, null, null, null, "2027-01-01", "2027-01-02", "2027-01-03"], "1 January 2027 is a Friday.");
}

// Picking a first and a last day.
{
  const open: RangePick = { startsOn: "2026-11-24", endsOn: "2026-11-24", picking: "start" };

  const first = pickRangeDay(open, "2026-11-12");
  assert.deepEqual(first, { startsOn: "2026-11-12", endsOn: "2026-11-12", picking: "end" }, "The first tap sets the first day; until the next tap it is a one-day period.");

  const second = pickRangeDay(first, "2026-11-18");
  assert.deepEqual(second, { startsOn: "2026-11-12", endsOn: "2026-11-18", picking: "start" }, "The second tap sets the last day.");

  assert.deepEqual(
    pickRangeDay(first, "2026-11-09"),
    { startsOn: "2026-11-09", endsOn: "2026-11-09", picking: "end" },
    "A tap before the first day starts again from that day."
  );
  assert.deepEqual(
    pickRangeDay(first, "2026-11-12"),
    { startsOn: "2026-11-12", endsOn: "2026-11-12", picking: "start" },
    "A tap on the first day again makes a one-day period."
  );
  assert.deepEqual(
    pickRangeDay(second, "2026-11-15"),
    { startsOn: "2026-11-15", endsOn: "2026-11-15", picking: "end" },
    "With both days set, the next tap starts a new range, even inside the old one."
  );
  assert.deepEqual(
    pickRangeDay(first, "2027-02-03"),
    { startsOn: "2026-11-12", endsOn: "2027-02-03", picking: "start" },
    "A range can run into another month and year."
  );
}

// Days the limits do not allow are not offered, and a tap on one changes nothing.
{
  const limits = { min: "2026-11-17", maxStart: "2027-11-25", maxSpanDays: 366 };
  const open: RangePick = { startsOn: "2026-11-24", endsOn: "2026-11-24", picking: "start" };

  assert.equal(canPickRangeDay(open, "2026-11-16", limits), false, "Before the earliest day.");
  assert.equal(canPickRangeDay(open, "2026-11-17", limits), true, "The earliest day itself.");
  assert.equal(canPickRangeDay(open, "2027-11-25", limits), true, "The latest first day.");
  assert.equal(canPickRangeDay(open, "2027-11-26", limits), false, "A first day past the latest one.");
  assert.equal(pickRangeDay(open, "2026-11-16", limits), open, "A tap on a day that is not allowed changes nothing.");
  assert.equal(lastPickableDay(open, limits), "2027-11-25");

  const ending: RangePick = { startsOn: "2026-11-20", endsOn: "2026-11-20", picking: "end" };
  assert.equal(lastPickableDay(ending, limits), "2027-11-21", "The last day reaches 366 days past the first.");
  assert.equal(canPickRangeDay(ending, "2027-11-21", limits), true);
  assert.equal(canPickRangeDay(ending, "2027-11-22", limits), false, "A last day more than the longest span after the first.");
  assert.equal(pickRangeDay(ending, "2027-11-22", limits), ending);
  assert.equal(canPickRangeDay(ending, "2026-11-18", limits), true, "Before the first day, within the limits: it starts again.");
  assert.equal(canPickRangeDay(ending, "2026-11-16", limits), false, "Before the first day and before the earliest: not offered.");

  const late: RangePick = { startsOn: "2027-11-25", endsOn: "2027-11-25", picking: "end" };
  assert.equal(canPickRangeDay(late, "2028-11-25", limits), true, "A last day can lie past the latest first day.");

  const free: RangePick = { startsOn: "2026-11-20", endsOn: "2026-11-20", picking: "end" };
  assert.equal(canPickRangeDay(free, "2040-01-01", {}), true, "With no limits every day is offered.");
  assert.equal(canPickRangeDay({ ...free, picking: "start" }, "1990-01-01", {}), true);
  assert.equal(lastPickableDay(free, {}), null);
}

// Where a day sits in the range, for the shading.
{
  const range = { startsOn: "2026-11-12", endsOn: "2026-11-18" };
  assert.equal(rangePosition(range, "2026-11-11"), null);
  assert.equal(rangePosition(range, "2026-11-12"), "start");
  assert.equal(rangePosition(range, "2026-11-15"), "inside");
  assert.equal(rangePosition(range, "2026-11-18"), "end");
  assert.equal(rangePosition(range, "2026-11-19"), null);
  assert.equal(rangePosition({ startsOn: "2026-11-12", endsOn: "2026-11-12" }, "2026-11-12"), "single");
}

// The time off calendar offers exactly the days a time off can be saved with.
{
  const today = "2026-11-24";
  const limits = timeOffLimits(today);
  assert.deepEqual(limits, { min: "2026-11-17", maxStart: "2027-11-25", maxSpanDays: 366 });

  const problemFor = (startsOn: string, endsOn: string) => timeOffProblem({ kind: "rest", startsOn, endsOn }, today);
  const starting: RangePick = { startsOn: today, endsOn: today, picking: "start" };

  // Around each edge of the window: a day is offered exactly when it saves.
  const firstDays = ["2026-11-10", "2026-11-16", "2026-11-17", "2026-11-18", today];
  assert.deepEqual(
    firstDays.map((day) => canPickRangeDay(starting, day, limits)),
    firstDays.map((day) => problemFor(day, day) === null),
    "A first day in the past is offered exactly when a period can start on it."
  );

  const first = pickRangeDay(starting, "2026-11-17", limits);
  const lastDays = ["2026-11-17", "2026-11-18", "2027-11-17", "2027-11-18", "2027-11-19", "2028-01-01"];
  assert.deepEqual(
    lastDays.map((day) => canPickRangeDay(first, day, limits)),
    lastDays.map((day) => problemFor(first.startsOn, day) === null),
    "A last day is offered exactly when the period can end on it."
  );

  // Whatever is tapped, in whatever order, what is on screen can be saved.
  const taps = ["2026-11-10", "2026-11-30", "2026-11-20", "2027-12-15", "2026-11-16", "2026-11-19", "2026-11-19", "2028-06-01", "2027-11-25", "2028-11-25", "2028-11-26"];
  const seen: RangePick[] = [];
  let range = starting;
  for (const day of taps) {
    range = pickRangeDay(range, day, limits);
    seen.push(range);
  }
  assert.deepEqual(seen.map((entry) => problemFor(entry.startsOn, entry.endsOn)), taps.map(() => null));
  assert.equal(seen.every((entry) => entry.startsOn <= entry.endsOn), true, "The last day never comes before the first.");
  assert.deepEqual(
    { startsOn: range.startsOn, endsOn: range.endsOn },
    { startsOn: "2027-11-25", endsOn: "2028-11-25" },
    "The furthest period there is: it starts a year out and lasts a year."
  );
  assert.equal(addDays(range.startsOn, limits.maxSpanDays ?? 0), "2028-11-25");
}

console.log("Calendar month passed.");
