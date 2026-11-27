import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { RideRepository } from "../src/backend/ride-repository";
import {
  activitiesByDay,
  activityLogWindowDays,
  firstLoggableDay,
  journalCoversMonth,
  logStateOn,
  monthSpan,
  dayHeading,
  shortWeekdayDate,
  weekOf
} from "../src/domain/activity-calendar";

// The week on Home and the calendar behind it (2026-11-27): a day opens the
// calendar, which shows its activities and adds one for it, a month back at most.

// Which days take a new activity.
{
  const today = "2026-11-27";
  assert.equal(activityLogWindowDays, 30);
  assert.equal(firstLoggableDay(today), "2026-10-29", "Today and the 29 days before it.");
  assert.equal(logStateOn(today, today), "open");
  assert.equal(logStateOn("2026-10-29", today), "open", "The oldest day of the window.");
  assert.equal(logStateOn("2026-10-28", today), "tooOld");
  assert.equal(logStateOn("2026-11-28", today), "future");
  assert.equal(firstLoggableDay("2026-03-01"), "2026-01-31", "Back across February.");
  // The server takes an activity that ended up to 744 hours (31 days) ago.
  // The oldest day's first minute, even with the clocks gone back in
  // between (Lisbon, 25 Oct 2026) and a save at 23:59, stays inside it.
  const zone = process.env.TZ;
  process.env.TZ = "Europe/Lisbon";
  const oldest = new Date(2026, 9, 29, 0, 0).getTime();
  const nowLate = new Date(2026, 10, 27, 23, 59).getTime();
  assert.equal(firstLoggableDay("2026-11-27"), "2026-10-29");
  assert.ok(nowLate - oldest < 744 * 60 * 60 * 1000, "A day the app offers is never one the server refuses, across a clock change.");
  if (zone === undefined) delete process.env.TZ;
  else process.env.TZ = zone;
}

// Monday to Sunday of a day's week.
{
  assert.deepEqual(weekOf("2026-11-27"), [
    "2026-11-23", "2026-11-24", "2026-11-25", "2026-11-26", "2026-11-27", "2026-11-28", "2026-11-29"
  ]);
  assert.deepEqual(weekOf("2026-11-23")[0], "2026-11-23", "A Monday starts its own week.");
  assert.deepEqual(weekOf("2026-11-29")[0], "2026-11-23", "A Sunday ends it.");
  assert.deepEqual(weekOf("2027-01-01"), [
    "2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02", "2027-01-03"
  ], "Across the new year.");
}

// Activities by the local day they started, in order.
{
  const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0).toISOString();
  const rides = [
    { id: "b", startedAt: at(25, 16), completedAt: at(25, 17) },
    { id: "a", startedAt: at(25, 8), completedAt: at(25, 9) },
    // Started late on the 26th, finished after midnight: it stays on the 26th.
    { id: "c", startedAt: new Date(2026, 10, 26, 23, 30).toISOString(), completedAt: at(27, 0) }
  ];
  const days = activitiesByDay(rides);
  assert.deepEqual(days.get("2026-11-25")?.map((ride) => ride.id), ["a", "b"]);
  assert.deepEqual(days.get("2026-11-26")?.map((ride) => ride.id), ["c"]);
  assert.equal(days.has("2026-11-27"), false);
}

// A month as instants, and whether the journal already holds it.
{
  const span = monthSpan("2026-10");
  assert.equal(span.from, new Date(2026, 9, 1).toISOString());
  assert.equal(span.to, new Date(2026, 10, 1).toISOString());
  assert.equal(monthSpan("2026-12").to, new Date(2027, 0, 1).toISOString(), "December ends at the new year.");
  const journalSince = new Date(2026, 9, 1);
  assert.equal(journalCoversMonth("2026-11", journalSince), true);
  assert.equal(journalCoversMonth("2026-10", journalSince), true, "The journal reads back to the start of last month.");
  assert.equal(journalCoversMonth("2026-09", journalSince), false, "An older month is read on its own.");
}

// Labels.
{
  assert.equal(dayHeading("2026-11-27"), "Friday 27 November");
  assert.equal(shortWeekdayDate("2026-11-25"), "Wed 25");
}

// An older month is read by when its rides started, oldest first.
{
  const calls: Array<{ op: string; column?: string; value?: unknown }> = [];
  const builder = {
    select: () => builder,
    gte: (column: string, value: string) => (calls.push({ op: "gte", column, value }), builder),
    lt: (column: string, value: string) => (calls.push({ op: "lt", column, value }), builder),
    order: (column: string, options: { ascending: boolean }) => (calls.push({ op: "order", column, value: options.ascending }), builder),
    limit: async () => ({ data: [], error: null })
  };
  const client = { from: () => builder } as unknown as ConstructorParameters<typeof RideRepository>[0];
  void new RideRepository(client).listStartedBetween("2026-09-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z").then((rides) => {
    assert.deepEqual(rides, []);
    assert.deepEqual(calls, [
      { op: "gte", column: "started_at", value: "2026-09-01T00:00:00.000Z" },
      { op: "lt", column: "started_at", value: "2026-10-01T00:00:00.000Z" },
      { op: "order", column: "started_at", value: true }
    ]);
  });
}

// Add activity picks its day from a week: the week of the day it opens on,
// with arrows within the month window; the last-week chips are gone.
{
  const sheet = readFileSync(join(process.cwd(), "src/features/ride/RideSetupSheet.tsx"), "utf8");
  assert.match(sheet, /<WeekDayPicker value=\{day\} today=\{localDayOf\(now\) as string\} ahead=\{Boolean\(onSchedule\)\} onChange=\{setDay\} \/>/, "Days ahead are pickable where scheduling is on.");
  assert.doesNotMatch(sheet, /add-activity-day-/);
  const picker = readFileSync(join(process.cwd(), "src/features/calendar/WeekDayPicker.tsx"), "utf8");
  assert.match(picker, /const canGoBack = wholeMonth \? month > monthOf\(oldest\) : addDays\(monday, -1\) >= oldest;/, "Back while the week or month before has a day to pick.");
  assert.match(picker, /const latest = ahead \? lastSchedulableDay\(today\) : today;/);
  assert.match(picker, /const canGoForward = wholeMonth \? month < monthOf\(latest\) : addDays\(monday, 7\) <= latest;/, "Forward up to today, or three months ahead when scheduling.");
  // The calendar button opens the whole month; a day picked there goes back to its week.
  assert.match(picker, /accessibilityLabel=\{wholeMonth \? "Show the week" : "Show the whole month"\}/);
  assert.match(picker, /onChange\(day\);\s+\/\/ A day picked from the month goes back to its week\.\s+if \(wholeMonth\) setWholeMonth\(false\);/);
  assert.match(picker, /monthGrid\(month\)\.map/);
  assert.match(picker, /const open = ahead \? pickableDay\(day, today\) : logStateOn\(day, today\) === "open";/);
  assert.match(picker, /disabled=\{!open\}/, "A day outside the window cannot be picked.");
  // The sheet's day is empty until it opens: the picker shows today's week, never a date out of bounds.
  assert.match(picker, /const shown = \/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$\/\.test\(value\) \? value : today;/);
}

// Wiring: the week sits under Home's hero, a day opens the calendar, and the
// calendar's Add activity opens the sheet on that day.
{
  const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
  const hero = app.indexOf("<Animated.View style={[styles.homeStage,");
  const week = app.indexOf("<HomeWeekStrip ");
  const addActivity = app.indexOf('testID="add-activity"');
  assert.ok(hero > 0 && week > hero && addActivity > week, "Under the hero, above Add activity.");
  assert.match(app, /onOpenCalendar=\{ridePersistence \? \(day\) => setCalendarDay\(day\) : undefined\}/);
  assert.match(app, /setAddActivityDay\(day\);\s+setAddActivityOpen\(true\);/);
  assert.match(app, /day=\{addActivityDay\}/);
  assert.match(app, /setAddActivityDay\(undefined\);\s+setAddActivityOpen\(true\);/, "Home's own button opens on the latest time, as before.");
}


// The month hook: a journal change drops a month read on its way and reads it
// again (no spinner left waiting on a dropped answer); a month the journal
// covers says "nothing logged" only once the journal has been read.
{
  const hook = readFileSync(join(process.cwd(), "src/features/calendar/useMonthActivities.ts"), "utf8");
  assert.match(hook, /setRead\(\{\}\);\s+setLoading\(false\);\s+setVersion\(\(current\) => current \+ 1\);/);
  assert.match(hook, /\}, \[known, load, version\]\);/);
  assert.match(hook, /loading: journalLoading, error: journalLoading \? "" : journalError/);
  const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(app, /journalLoading=\{ridePersistence && !rideJournal\.loaded\}/);
}

console.log("Activity calendar passed.");
