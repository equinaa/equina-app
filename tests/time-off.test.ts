import assert from "node:assert/strict";
import { plannedRideFor, plannedRidesLabel } from "../src/features/ride/planned-rides";
import { currentTimeOff, timeOffAction, timeOffIsOver, timeOffLabel, timeOffProblem, timeOffRange } from "../src/features/records/time-off";

// A horse's time off (202610250003) and how a day's planned rides read.

const TODAY = "2026-10-25";

{
  const ok = { kind: "stall-rest", startsOn: "2026-10-23", endsOn: "2026-11-06" };
  assert.equal(timeOffProblem(ok, TODAY), null, "Stall rest from two days ago for two weeks can be saved.");
  assert.match(timeOffProblem({ ...ok, startsOn: "2026-10-10" }, TODAY) ?? "", /up to 7 days back/);
  assert.match(timeOffProblem({ ...ok, endsOn: "2026-10-20" }, TODAY) ?? "", /after the first/);
  assert.match(timeOffProblem({ ...ok, endsOn: "2027-12-01" }, TODAY) ?? "", /up to a year/);
  assert.match(timeOffProblem({ ...ok, kind: "other" }, TODAY) ?? "", /Add a note/, "Other needs a word on why.");
  assert.equal(timeOffProblem({ ...ok, kind: "other", note: "Moving yards" }, TODAY), null);
  assert.match(timeOffProblem({ ...ok, kind: "" }, TODAY) ?? "", /Pick why/);
}

{
  assert.equal(timeOffLabel("stall-rest"), "Stall rest");
  assert.equal(timeOffLabel("vet"), "Vet treatment");
  assert.equal(timeOffLabel("box-rest"), "Box rest", "A kind the app does not list yet still reads as words.");
  assert.equal(timeOffRange({ startsOn: "2026-10-25", endsOn: "2026-11-08" }), "25 Oct – 8 Nov");
  assert.equal(timeOffRange({ startsOn: "2026-10-25", endsOn: "2026-10-25" }), "25 Oct");
}

{
  assert.equal(timeOffIsOver({ endsOn: "2026-10-24" }, TODAY), false, "Ended yesterday: can still be taken back.");
  assert.equal(timeOffIsOver({ endsOn: "2026-10-23" }, TODAY), true, "Ended before that: it decided past days.");
  const periods = [
    { id: "a", horseId: "daimon", kind: "break", startsOn: "2026-11-10", endsOn: "2026-11-20" },
    { id: "b", horseId: "daimon", kind: "stall-rest", startsOn: "2026-10-20", endsOn: "2026-10-30" },
    { id: "c", horseId: "daimon", kind: "rest", startsOn: "2026-10-01", endsOn: "2026-10-02" },
    { id: "d", horseId: "luna", kind: "rest", startsOn: "2026-10-25", endsOn: "2026-10-25" }
  ];
  assert.deepEqual(currentTimeOff(periods, "daimon", TODAY).map((period) => period.id), ["b", "a"], "Under way and to come, soonest first; long past ones and other horses left out.");
  const recent = [...periods, { id: "e", horseId: "daimon", kind: "injury", startsOn: "2026-10-19", endsOn: "2026-10-20" }];
  assert.deepEqual(currentTimeOff(recent, "daimon", TODAY).map((period) => period.id), ["e", "b", "a"], "A period that ended this past week still shows, so a mistake can be seen.");
}

// What a rider can still do with a period, as the database allows it.
{
  const now = Date.parse("2026-10-25T12:00:00Z");
  const longAgo = "2026-10-01T09:00:00Z";
  assert.equal(timeOffAction({ startsOn: "2026-11-01", endsOn: "2026-11-05", createdAt: longAgo }, TODAY, now), "remove", "Not started: taken back whole.");
  assert.equal(timeOffAction({ startsOn: "2026-10-10", endsOn: "2026-11-05", createdAt: longAgo }, TODAY, now), "end", "Under way: ended early, the days it covered stay covered.");
  assert.equal(timeOffAction({ startsOn: "2026-10-10", endsOn: "2026-10-24", createdAt: longAgo }, TODAY, now), "none", "Ends yesterday already: nothing left to end.");
  assert.equal(timeOffAction({ startsOn: "2026-10-01", endsOn: "2026-10-05", createdAt: longAgo }, TODAY, now), "none", "Over: stays as it was.");
  assert.equal(
    timeOffAction({ startsOn: "2026-10-19", endsOn: "2026-10-20", createdAt: "2026-10-25T08:00:00Z" }, TODAY, now),
    "remove",
    "Entered today for days already gone (the wrong horse, say): it can be taken back the same day."
  );
  assert.equal(timeOffAction({ startsOn: "2026-10-24", endsOn: "2026-10-30", createdAt: longAgo }, TODAY, now), "remove", "Started only yesterday: still within the slack.");
}

{
  const names = { daimon: "Daimon", luna: "Luna" };
  assert.equal(plannedRidesLabel([{ trainingType: "dressage", horseId: "daimon" }], names), "Dressage with Daimon");
  assert.equal(
    plannedRidesLabel([{ trainingType: "dressage", horseId: "daimon" }, { trainingType: "jumping", horseId: "luna" }, { trainingType: "hack" }], names),
    "Dressage with Daimon, Jumping with Luna and Hack"
  );
  assert.equal(plannedRidesLabel([], names), "");
  const today = [{ horseId: "daimon", trainingType: "dressage" }, { horseId: "luna", trainingType: "jumping" }];
  assert.equal(plannedRideFor(today, "luna")?.horseId, "luna", "Start ride opens on Home's horse when it is planned today.");
  assert.equal(plannedRideFor(today, "nova")?.horseId, "daimon", "Else on the first planned ride.");
  assert.equal(plannedRideFor([], "luna"), undefined);
}

console.log("Horse time off passed.");
