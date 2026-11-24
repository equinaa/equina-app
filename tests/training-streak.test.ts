import assert from "node:assert/strict";
import type { RideEnd } from "../src/backend/contracts";
import {
  addDays,
  dueOn,
  isoWeekday,
  mergeHorseWeek,
  planForHorse,
  planOn,
  plannedOn,
  ridesForHorse,
  trainingStreak,
  trainingStreakFor,
  trainingWeek,
  rideDays,
  upcomingPlannedDays,
  type PlanVersion,
  type TimeOffPeriod
} from "../src/domain/training-streak";

// The training streak counts training days in a row against a horse's plan:
// planned days need a ride, days off never break it, an extra ride adds one.
// Each horse has its own; the blocks without a horse are the unscoped week
// of a rider with none.

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

// Two horses on Monday, Luna added on top of Daimon. Each horse has its own
// streak: Daimon's rides keep Daimon's, and do nothing for Luna's Monday.
{
  const twoHorses: PlanVersion = {
    effectiveFrom: "2026-10-05",
    days: [...plan.days, { weekday: 1, trainingType: "jumping", horseId: "luna" }]
  };
  assert.equal(plannedOn([twoHorses], "2026-10-19").length, 2, "The stored week still holds both horses.");
  const onDaimon = faithful.map((completedAt) => ({ completedAt, horseId: "daimon" }));
  const daimon = trainingStreak(planForHorse([twoHorses], "daimon"), ridesForHorse(onDaimon, "daimon"), TODAY);
  assert.equal(daimon.current, 9, "Every ride on Daimon counts; the Saturdays, not his planned days, as rides on a day off.");
  assert.equal(daimon.week.find((day) => day.day === "2026-10-24")?.planned.length, 0, "Saturday's hack has no horse: it is not Daimon's.");
  const luna = trainingStreak(planForHorse([twoHorses], "luna"), ridesForHorse(onDaimon, "luna"), TODAY);
  assert.equal(luna.current, 0, "A ride on Daimon does not cover Luna's planned Monday.");
  assert.equal(luna.hasPlan, true);
  const lunaMonday = trainingStreak(planForHorse([twoHorses], "luna"), [], "2026-10-26");
  assert.deepEqual(
    lunaMonday.todayPlanned.map((entry) => entry.horseId),
    ["luna"],
    "Today lists only this horse's ride."
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
  // A rider with no horse: the week is read whole, any ride covers the day.
  const upcoming = upcomingPlannedDays([plan], [{ completedAt: ride(TODAY) }], "2026-10-24", 10);
  assert.deepEqual(
    upcoming.map((entry) => entry.day),
    ["2026-10-24", "2026-10-26", "2026-10-28", "2026-10-31", "2026-11-02"],
    "The planned days ahead, for the morning reminders."
  );
  assert.deepEqual(
    upcomingPlannedDays([plan], [{ completedAt: ride("2026-10-24") }], "2026-10-24", 3).map((entry) => entry.day),
    ["2026-10-26"],
    "A planned day already ridden gets no reminder."
  );
}

// Each horse has its own week and streak. Daimon on Monday and Wednesday,
// Luna on Tuesday and Saturday, both from Monday 5 October.
const stable: PlanVersion = {
  effectiveFrom: "2026-10-05",
  days: [
    { weekday: 1, trainingType: "dressage", horseId: "daimon" },
    { weekday: 3, trainingType: "jumping", horseId: "daimon" },
    { weekday: 2, trainingType: "flatwork", horseId: "luna" },
    { weekday: 6, trainingType: "hack", horseId: "luna" }
  ]
};
const on = (horseId: string | undefined, days: string[]) =>
  days.map((day) => (horseId ? { completedAt: ride(day), horseId } : { completedAt: ride(day) }));
const daimonRides = on("daimon", ["2026-10-05", "2026-10-07", "2026-10-12", "2026-10-14", "2026-10-19", "2026-10-21"]);
const lunaRides = on("luna", ["2026-10-06", "2026-10-10", "2026-10-13", "2026-10-17", "2026-10-20", "2026-10-24"]);
const bothRides = [...daimonRides, ...lunaRides];
// The streak Home shows for a horse, as useTrainingPlan reads it.
const streakOf = (versions: PlanVersion[], rides: RideEnd[], horseId: string | undefined, today = TODAY, periods: TimeOffPeriod[] = []) =>
  trainingStreakFor(versions, rides, horseId, today, periods);

// Two horses, two streaks, each from its own days and rides.
{
  const daimon = streakOf([stable], bothRides, "daimon");
  assert.equal(daimon.current, 6);
  assert.equal(daimon.startedOn, "2026-10-05");
  const luna = streakOf([stable], bothRides, "luna");
  assert.equal(luna.current, 6);
  assert.equal(luna.startedOn, "2026-10-06");
  assert.deepEqual(
    luna.week.map((day) => day.state),
    ["rest", "ridden", "rest", "rest", "rest", "ridden", "rest"],
    "Luna's week shows Luna's rides only."
  );
}

// A ride on Daimon on Luna's Tuesday does not cover it.
{
  const lunaMissed = lunaRides.filter((entry) => !entry.completedAt.startsWith("2026-10-20"));
  const rides = [...daimonRides, ...on("daimon", ["2026-10-20"]), ...lunaMissed];
  const luna = streakOf([stable], rides, "luna");
  assert.equal(luna.current, 1, "Luna's missed Tuesday starts her streak over: only Saturday counts.");
  assert.equal(luna.best, 4);
  assert.equal(streakOf([stable], rides, "daimon").current, 7, "For Daimon the Tuesday is a ride on a day off: it adds one.");
}

// Luna joins the plan on Monday 19: her streak starts there, and her rides
// before it count for nothing.
{
  const daimonOnly: PlanVersion = { effectiveFrom: "2026-10-05", days: stable.days.filter((entry) => entry.horseId === "daimon") };
  const joined: PlanVersion = { ...stable, effectiveFrom: "2026-10-19" };
  const versions = [joined, daimonOnly];
  assert.deepEqual(planForHorse(versions, "luna").map((version) => version.effectiveFrom), ["2026-10-19"]);
  const luna = streakOf(versions, bothRides, "luna");
  assert.equal(luna.current, 2);
  assert.equal(luna.best, 2);
  assert.equal(luna.startedOn, "2026-10-20");
  assert.equal(streakOf(versions, bothRides, "daimon").current, 6, "Daimon's streak goes back to his own first week.");

  // From Saturday 24 Luna is taken out of the plan: she has no week again.
  const lunaOut: PlanVersion = { effectiveFrom: "2026-10-24", days: daimonOnly.days };
  const later = [...versions, lunaOut];
  assert.equal(streakOf(later, bothRides, "luna").hasPlan, false, "Home offers to plan Luna's week again.");
  assert.equal(streakOf(later, bothRides, "daimon").hasPlan, true);
  assert.equal(streakOf(later, bothRides, "nova").hasPlan, false, "A horse never planned has no week.");
}

// Time off on Daimon leaves Luna's days due.
{
  const daimonOff: TimeOffPeriod[] = [{ horseId: "daimon", kind: "stall-rest", startsOn: "2026-10-19", endsOn: "2026-10-21" }];
  const daimonRested = daimonRides.filter((entry) => entry.completedAt < ride("2026-10-19"));
  const lunaMissed = lunaRides.filter((entry) => !entry.completedAt.startsWith("2026-10-20"));
  const rides = [...daimonRested, ...lunaMissed];
  assert.equal(streakOf([stable], rides, "daimon", TODAY, daimonOff).current, 4, "Daimon's days off break nothing.");
  assert.equal(streakOf([stable], rides, "luna", TODAY, daimonOff).current, 1, "Luna was not off: her missed Tuesday still counts.");
}

// Entries and rides without a horse count for no horse; a rider with no
// horse at all reads them together, as before.
{
  const withHack: PlanVersion = { ...stable, days: [...stable.days, { weekday: 5, trainingType: "hack" }] };
  const loose = on(undefined, ["2026-10-23"]);
  assert.equal(planForHorse([withHack], "daimon")[0]?.days.length, 2, "The hack with no horse is not Daimon's.");
  assert.equal(ridesForHorse([...daimonRides, ...loose], "daimon").length, 6, "A ride with no horse is not Daimon's.");
  assert.equal(planForHorse([withHack], undefined)[0]?.days.length, 5, "With no horse to scope by, every entry.");
  assert.equal(ridesForHorse([...bothRides, ...loose], undefined).length, 13, "And every ride.");
  // Unscoped, any ride covers any planned day: the loose ride keeps Friday
  // 23, and every ride since the missed Friday 16 counts.
  assert.equal(streakOf([withHack], [...bothRides, ...loose], undefined).current, 6);
  assert.equal(streakOf([withHack], bothRides, undefined).current, 1, "Without it, Friday 23 is missed.");
  assert.deepEqual(
    streakOf([withHack], [...bothRides, ...loose], undefined),
    trainingStreak([withHack], [...bothRides, ...loose].map((entry) => entry.completedAt), TODAY),
    "A rider with no horse gets exactly the streak as it always was."
  );
}

// A week of rest days. A rider with no horse who turned every day to rest
// still has a plan, as before: the card keeps their streak, and a ride on a
// day off still adds one. A horse whose days were all taken out has none.
{
  const restWeek: PlanVersion = { effectiveFrom: "2026-10-19", days: [] };
  const noHorse = streakOf([restWeek], on(undefined, ["2026-10-22"]), undefined);
  assert.equal(noHorse.hasPlan, true, "Unscoped, a week with no day in it is still the rider's plan.");
  assert.equal(noHorse.current, 1, "A ride on a day off adds one.");
  assert.equal(streakOf([plan, restWeek], [], undefined).hasPlan, true);
  assert.equal(
    streakOf([stable, { effectiveFrom: "2026-10-19", days: [] }], bothRides, "daimon").hasPlan,
    false,
    "Daimon taken out of the plan: Home offers to plan his week again."
  );
}

// The reminders: one a day, naming the horses still to ride. Monday has
// Daimon and Luna, Thursday Nova, who is no longer the rider's.
{
  const reminded: PlanVersion = {
    effectiveFrom: "2026-10-05",
    days: [
      { weekday: 1, trainingType: "dressage", horseId: "daimon" },
      { weekday: 1, trainingType: "jumping", horseId: "luna" },
      { weekday: 4, trainingType: "hack", horseId: "nova" }
    ]
  };
  const rides = on("daimon", ["2026-10-26"]);
  const active = new Set(["daimon", "luna"]);
  const days = upcomingPlannedDays([reminded], rides, "2026-10-26", 4, [], active);
  assert.deepEqual(days.map((entry) => entry.day), ["2026-10-26"], "No reminder for a horse that is no longer the rider's.");
  assert.deepEqual(days[0]?.planned.map((entry) => entry.horseId), ["luna"], "Daimon is ridden already: only Luna is left.");
  const allRidden = upcomingPlannedDays([reminded], [...rides, ...on("luna", ["2026-10-26"])], "2026-10-26", 4, [], active);
  assert.deepEqual(allRidden, [], "Both ridden: no reminder that day.");
  assert.deepEqual(
    upcomingPlannedDays([reminded], rides, "2026-10-26", 4).map((entry) => entry.day),
    ["2026-10-29"],
    "With no horses (unscoped), any ride covers the day and every entry is reminded."
  );
}

// Saving one horse's week keeps the other horses' days.
{
  const current = [
    { weekday: 1, trainingType: "dressage", horseId: "daimon" },
    { weekday: 2, trainingType: "flatwork", horseId: "luna" },
    { weekday: 4, trainingType: "hack", horseId: "nova" },
    { weekday: 6, trainingType: "hack" }
  ];
  const edited = [
    { weekday: 3, trainingType: "jumping", horseId: "daimon" },
    { weekday: 2, trainingType: "flatwork", horseId: "luna" }
  ];
  assert.deepEqual(
    mergeHorseWeek(current, edited, "daimon").map((entry) => `${entry.weekday}:${entry.horseId ?? "-"}`),
    ["2:luna", "4:nova", "6:-", "3:daimon"],
    "Without the rider's horses (not read, or the read failed), nothing but Daimon's days changes."
  );
  assert.deepEqual(
    mergeHorseWeek(current, edited, "daimon", ["daimon", "luna"]).map((entry) => `${entry.weekday}:${entry.horseId ?? "-"}`),
    ["2:luna", "6:-", "3:daimon"],
    "With them, a horse no longer the rider's drops out."
  );
  // Nova was added on the web after this phone listed its horses. The save
  // reads them again (ownHorseIdsNow), and Nova's week stays.
  assert.deepEqual(
    mergeHorseWeek(current, edited, "daimon", ["daimon", "luna", "nova"]).map((entry) => `${entry.weekday}:${entry.horseId ?? "-"}`),
    ["2:luna", "4:nova", "6:-", "3:daimon"],
    "A horse in the list read at save keeps its week."
  );
  assert.deepEqual(mergeHorseWeek(current, edited, undefined), edited, "Without a horse, the editor's week is the plan.");
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
