import assert from "node:assert/strict";
import {
  addDays,
  dueOn,
  isoWeekday,
  planOn,
  plannedOn,
  trainingStreak,
  trainingWeek,
  rideDays,
  upcomingPlannedDays,
  type PlanVersion
} from "../src/domain/training-streak";

// The training streak counts training days in a row against the rider's plan:
// planned days need a ride, days off never break it, an extra ride adds one.

// Rides are placed by the rider's local day, so the file runs in one zone.
const machineZone = process.env.TZ;
process.env.TZ = "Europe/Bucharest";

// Sunday 25 October 2026.
const TODAY = "2026-10-25";
const ride = (day: string, time = "09:00:00") => new Date(`${day}T${time}`).toISOString();

// Monday, Wednesday and Saturday, from Monday 5 October.
const plan: PlanVersion = {
  effectiveFrom: "2026-10-05",
  days: [
    { weekday: 1, trainingType: "dressage", horseId: "daimon" },
    { weekday: 3, trainingType: "jumping", horseId: "daimon" },
    { weekday: 6, trainingType: "hack" }
  ]
};

{
  assert.equal(isoWeekday("2026-10-26"), 1, "26 October 2026 is a Monday.");
  assert.equal(isoWeekday(TODAY), 7, "and the 25th a Sunday.");
  assert.equal(addDays("2026-10-31", 1), "2026-11-01");
  assert.equal(addDays("2026-03-29", -1), "2026-03-28", "Day arithmetic ignores the clock change.");
  assert.equal(plannedOn([plan], "2026-10-21")[0]?.trainingType, "jumping");
  assert.deepEqual(plannedOn([plan], "2026-10-22"), [], "Thursday is a day off.");
  assert.deepEqual(plannedOn([plan], "2026-10-04"), [], "Before the plan nothing is planned.");
}

// Every planned day ridden for three weeks: 9 training days.
const faithful = [
  "2026-10-05", "2026-10-07", "2026-10-10",
  "2026-10-12", "2026-10-14", "2026-10-17",
  "2026-10-19", "2026-10-21", "2026-10-24"
].map((day) => ride(day));

{
  const streak = trainingStreak([plan], faithful, TODAY);
  assert.equal(streak.current, 9);
  assert.equal(streak.best, 9);
  assert.equal(streak.startedOn, "2026-10-05");
  assert.equal(streak.hasPlan, true);
  assert.deepEqual(streak.todayPlanned, [], "Sunday is a day off.");
  assert.equal(streak.nextMilestone, 10);
  assert.equal(streak.previousMilestone, 5);
}

{
  const extra = [...faithful, ride("2026-10-22")];
  assert.equal(trainingStreak([plan], extra, TODAY).current, 10, "A ride on a day off adds a day.");
  const twice = [...faithful, ride("2026-10-24", "17:30:00")];
  assert.equal(trainingStreak([plan], twice, TODAY).current, 9, "Two rides on one day are one training day.");
}

{
  const missedWednesday = faithful.filter((value) => !value.startsWith("2026-10-21"));
  const streak = trainingStreak([plan], missedWednesday, TODAY);
  assert.equal(streak.current, 1, "Missing a planned day starts over: only Saturday counts now.");
  assert.equal(streak.startedOn, "2026-10-24");
  assert.equal(streak.best, 7, "The best streak remembers the run before.");
}

{
  // Monday 26: planned, not ridden yet. The day is still going.
  const monday = trainingStreak([plan], faithful, "2026-10-26");
  assert.equal(monday.current, 9, "Today's planned ride, not done yet, breaks nothing.");
  assert.equal(monday.todayPlanned[0]?.trainingType, "dressage");
  assert.equal(monday.todayRidden, false);
  // Tuesday 27: Monday is gone without a ride.
  assert.equal(trainingStreak([plan], faithful, "2026-10-27").current, 0, "The day after, a missed plan breaks it.");
}

{
  // Rides before the plan existed do not make a streak.
  const early = [ride("2026-09-28"), ride("2026-09-30"), ...faithful];
  assert.equal(trainingStreak([plan], early, TODAY).current, 9);
  assert.equal(trainingStreak([], faithful, TODAY).current, 0, "No plan, no streak.");
  assert.equal(trainingStreak([], faithful, TODAY).hasPlan, false);
}

{
  // From Monday 19 the rider moves Wednesday to Thursday. The weeks before
  // keep Wednesday; the week after asks for Thursday.
  const moved: PlanVersion = {
    effectiveFrom: "2026-10-19",
    days: [
      { weekday: 1, trainingType: "dressage" },
      { weekday: 4, trainingType: "jumping" },
      { weekday: 6, trainingType: "hack" }
    ]
  };
  const versions = [plan, moved];
  assert.equal(planOn(versions, "2026-10-14"), plan, "A past week keeps the plan it had.");
  assert.equal(planOn(versions, "2026-10-20"), moved);
  const rides = faithful.filter((value) => !value.startsWith("2026-10-21")).concat(ride("2026-10-22"));
  assert.equal(trainingStreak(versions, rides, TODAY).current, 9, "The change counts from its day on, and breaks nothing before.");
  assert.equal(
    trainingStreak(versions, faithful, TODAY).current,
    1,
    "Riding the old Wednesday instead of the new Thursday misses the Thursday: only Saturday counts after it."
  );
}

{
  const ridden = rideDays(faithful);
  const week = trainingWeek([plan], ridden, "2026-10-22");
  assert.deepEqual(
    week.map((day) => [day.day, day.state]),
    [
      ["2026-10-19", "ridden"],
      ["2026-10-20", "rest"],
      ["2026-10-21", "ridden"],
      ["2026-10-22", "rest"],
      ["2026-10-23", "rest"],
      ["2026-10-24", "ridden"],
      ["2026-10-25", "rest"]
    ],
    "Monday to Sunday, a ride shows on its day."
  );
  const lazy = trainingWeek([plan], rideDays([ride("2026-10-19")]), "2026-10-23");
  assert.deepEqual(
    lazy.filter((day) => day.planned.length > 0).map((day) => [day.day, day.state, day.isToday]),
    [["2026-10-19", "ridden", false], ["2026-10-21", "missed", false], ["2026-10-24", "planned", false]],
    "A planned day gone by without a ride is missed; the ones to come are still planned."
  );
}

// Two horses on Monday, Luna added on top of Daimon. The day needs a ride,
// and one ride on either horse keeps the streak: it counts training days.
{
  const twoHorses: PlanVersion = {
    effectiveFrom: "2026-10-05",
    days: [...plan.days, { weekday: 1, trainingType: "jumping", horseId: "luna" }]
  };
  assert.equal(plannedOn([twoHorses], "2026-10-19").length, 2);
  assert.equal(trainingStreak([twoHorses], faithful, TODAY).current, 9);
  assert.deepEqual(
    trainingStreak([twoHorses], faithful, "2026-10-26").todayPlanned.map((entry) => entry.horseId),
    ["daimon", "luna"],
    "Today lists every horse still to ride."
  );
}

// Daimon on stall rest from Monday 19 to Wednesday 21: his Monday and
// Wednesday are not due, so skipping them breaks nothing.
{
  const stallRest = [{ horseId: "daimon", kind: "stall-rest", startsOn: "2026-10-19", endsOn: "2026-10-21" }];
  const rested = faithful.filter((value) => !value.startsWith("2026-10-19") && !value.startsWith("2026-10-21"));
  assert.equal(trainingStreak([plan], rested, TODAY).current, 1, "Without the time off, the missed days break it.");
  const streak = trainingStreak([plan], rested, TODAY, stallRest);
  assert.equal(streak.current, 7, "With the horse off, the streak carries on over those days.");
  const week = trainingWeek([plan], rideDays(rested), TODAY, stallRest);
  assert.deepEqual(
    week.slice(0, 3).map((day) => day.state),
    ["off", "rest", "off"],
    "The days the horse is off show as off, not missed."
  );
  // Saturday's hack has no horse, so time off on Daimon does not touch it.
  assert.equal(dueOn([plan], stallRest, "2026-10-24").length, 1);
  // The other horse on the same day is still due.
  const twoHorses: PlanVersion = { effectiveFrom: "2026-10-05", days: [...plan.days, { weekday: 1, trainingType: "jumping", horseId: "luna" }] };
  assert.deepEqual(dueOn([twoHorses], stallRest, "2026-10-19").map((entry) => entry.horseId), ["luna"]);
  assert.deepEqual(
    upcomingPlannedDays([plan], [], "2026-10-19", 7, stallRest).map((entry) => entry.day),
    ["2026-10-24"],
    "No reminder for a horse that is off."
  );
}

{
  // A ride at 01:30 on Monday in Bucharest is Monday's ride, not Sunday's.
  assert.equal(rideDays(["2026-10-25T22:30:00Z"]).has("2026-10-26"), true);
}

{
  const upcoming = upcomingPlannedDays([plan], [ride(TODAY)], "2026-10-24", 10);
  assert.deepEqual(
    upcoming.map((entry) => entry.day),
    ["2026-10-24", "2026-10-26", "2026-10-28", "2026-10-31", "2026-11-02"],
    "The planned days ahead, for the morning reminders."
  );
  assert.deepEqual(
    upcomingPlannedDays([plan], [ride("2026-10-24")], "2026-10-24", 3).map((entry) => entry.day),
    ["2026-10-26"],
    "A planned day already ridden gets no reminder."
  );
}

{
  // Milestones past the last one keep counting.
  const days = Array.from({ length: 1001 }, (_, index) => addDays("2024-01-01", index));
  const daily: PlanVersion = { effectiveFrom: "2024-01-01", days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, trainingType: "hack" })) };
  const long = trainingStreak([daily], days.map((day) => ride(day)), days[days.length - 1] ?? "");
  assert.equal(long.current, 1001);
  assert.equal(long.previousMilestone, 1000);
  assert.equal(long.nextMilestone, 1002);
}

if (machineZone === undefined) delete process.env.TZ;
else process.env.TZ = machineZone;

console.log("Training streak passed.");
