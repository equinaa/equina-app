import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PlannedActivity } from "../src/backend/contracts";
import { PlannedActivityRepository } from "../src/backend/planned-activity-repository";
import { activityScheduleDaysAhead, dayUseOn, lastSchedulableDay, pickableDay } from "../src/domain/activity-calendar";
import { plannedReminders, plannedStart } from "../src/features/calendar/planned-schedule";
import { activityIsAhead, defaultRidePhases, rideTrainingTypeById, scheduleProblem, type ActivityDraft } from "../src/features/ride/ride-plan";

// Scheduled activities (202611270001, 2026-11-27): a training put on a day
// ahead from Add activity, marked done (logged) or let go when its day comes.

const machineZone = process.env.TZ;
process.env.TZ = "Europe/Lisbon";

// What a day can take.
{
  const today = "2026-11-27";
  assert.equal(activityScheduleDaysAhead, 90);
  assert.equal(lastSchedulableDay(today), "2027-02-25", "About three months; the server takes up to 92 days.");
  assert.equal(dayUseOn(today, today), "log");
  assert.equal(dayUseOn("2026-10-29", today), "log", "The oldest day to log.");
  assert.equal(dayUseOn("2026-10-28", today), "tooOld");
  assert.equal(dayUseOn("2026-11-28", today), "schedule", "Tomorrow is scheduled.");
  assert.equal(dayUseOn("2026-12-15", today), "schedule", "Next month too.");
  assert.equal(dayUseOn("2027-02-25", today), "schedule");
  assert.equal(dayUseOn("2027-02-26", today), "tooFar");
  assert.equal(pickableDay("2026-12-15", today), true);
  assert.equal(pickableDay("2027-03-01", today), false);
}

// Logged or scheduled, and what stops a schedule.
{
  const hack = rideTrainingTypeById("hack")!;
  const plan = { horseName: "Don", trainingType: hack, phases: defaultRidePhases(hack) };
  // Friday 27 November 2026, 10:00 in Lisbon (UTC+0).
  const now = Date.parse("2026-11-27T10:00:00Z");
  const draft = (patch: Partial<ActivityDraft>): ActivityDraft => ({ day: "2026-12-04", startMinutes: 9 * 60, plan, ...patch });
  assert.equal(activityIsAhead(draft({}), now), true, "A day ahead is scheduled.");
  assert.equal(activityIsAhead(draft({ day: "2026-11-27", startMinutes: 17 * 60 }), now), true, "Later today, not yet ended, is scheduled.");
  assert.equal(activityIsAhead(draft({ day: "2026-11-27", startMinutes: 8 * 60 }), now), false, "This morning, ended by now, is logged.");
  assert.equal(activityIsAhead(draft({ day: "2026-11-26" }), now), false, "Yesterday is logged.");
  assert.equal(activityIsAhead(draft({ day: "" }), now), false, "No day yet (the sheet opening) is not ahead.");
  assert.equal(scheduleProblem(draft({}), now), null, "Next Friday at 09:00 can be scheduled.");
  assert.equal(scheduleProblem(draft({ day: "2026-11-27", startMinutes: 17 * 60 }), now), null, "Later today too.");
  assert.match(scheduleProblem(draft({ day: "2026-11-27", startMinutes: 9 * 60 + 45 }), now) ?? "", /has passed/, "A time already gone today is not scheduled.");
  assert.match(scheduleProblem(draft({ day: "2027-03-15" }), now) ?? "", /three months ahead/);
  assert.match(scheduleProblem(draft({ plan: { ...plan, phases: [] } }), now) ?? "", /at least one phase/);
  // 29 March 2026 the clocks go forward in Lisbon at 01:00: 01:30 does not exist.
  const beforeSpring = Date.parse("2026-03-20T10:00:00Z");
  assert.match(scheduleProblem(draft({ day: "2026-03-29", startMinutes: 90 }), beforeSpring) ?? "", /clocks go forward/);
}

// Reminders: planned ones still to start, within three weeks, at their local start.
{
  const now = new Date(2026, 10, 27, 10, 0).getTime();
  const phases = [{ title: "Flatwork", plannedSeconds: 1800 }];
  const item = (patch: Partial<PlannedActivity>): PlannedActivity => ({
    id: "a", day: "2026-11-28", startMinutes: 9 * 60, trainingType: "dressage", phases, status: "planned", ...patch
  });
  assert.equal(plannedStart(item({})).getTime(), new Date(2026, 10, 28, 9, 0).getTime());
  const reminders = plannedReminders(
    [
      item({ id: "tomorrow" }),
      item({ id: "earlier-today", day: "2026-11-27", startMinutes: 8 * 60 }),
      item({ id: "skipped", status: "skipped" }),
      item({ id: "done", status: "done" }),
      item({ id: "far", day: "2026-12-30" })
    ],
    (activity) => ({ title: `Title ${activity.id}`, body: "Body" }),
    now
  );
  assert.deepEqual(reminders.map((reminder) => reminder.id), ["tomorrow"], "Only a planned one still to start, within three weeks.");
  assert.equal(reminders[0]?.title, "Title tomorrow");
}

// The repository writes the plan's phases as the journal stores them, and
// reads them back without ridden seconds.
{
  const writes: Array<Record<string, unknown>> = [];
  const row = {
    id: "p1", horse_id: null, day: "2026-12-04", start_minutes: 540, training_type: "hack",
    phases: [{ title: "Walk", planned_seconds: 600 }], note: null, status: "planned", ride_entry_id: null
  };
  const builder = {
    insert: (payload: Record<string, unknown>) => (writes.push(payload), builder),
    update: (payload: Record<string, unknown>) => (writes.push(payload), builder),
    eq: () => builder,
    select: () => builder,
    single: async () => ({ data: row, error: null })
  };
  const client = {
    from: () => builder,
    auth: { getUser: async () => ({ data: { user: { id: "rider-1" } } }) }
  } as unknown as ConstructorParameters<typeof PlannedActivityRepository>[0];
  const repository = new PlannedActivityRepository(client);
  const created = await repository.create({ day: "2026-12-04", startMinutes: 540, trainingType: "hack", phases: [{ title: "Walk", plannedSeconds: 600 }], note: "  " });
  assert.deepEqual(writes[0], {
    rider_id: "rider-1", horse_id: null, day: "2026-12-04", start_minutes: 540, training_type: "hack",
    phases: [{ title: "Walk", planned_seconds: 600 }], note: null
  });
  assert.deepEqual(created, { id: "p1", day: "2026-12-04", startMinutes: 540, trainingType: "hack", phases: [{ title: "Walk", plannedSeconds: 600 }], status: "planned" });
  await repository.markDone("p1", "entry-1");
  assert.deepEqual(writes[1], { status: "done", ride_entry_id: "entry-1" });
  await repository.skip("p1");
  assert.deepEqual(writes[2], { status: "skipped" });
}

// Wiring: Add activity schedules a day ahead; the calendar offers Done once
// its time has come, and Done logs it and links the two.
{
  const app = readFileSync(join(process.cwd(), "src/App.tsx"), "utf8");
  assert.match(app, /onSchedule=\{ridePersistence \? scheduleActivity : undefined\}/);
  assert.match(app, /const problem = activityProblem\(draft, Date\.now\(\)\);\s+if \(problem\) throw new Error\(problem\);/, "Done follows the same rules as logging by hand.");
  assert.match(app, /await plannedActivities\.markDone\(item\.id, entry\.id\);/);
  const sheet = readFileSync(join(process.cwd(), "src/features/ride/RideSetupSheet.tsx"), "utf8");
  assert.match(sheet, /const scheduling = logging && Boolean\(onSchedule\) && activityIsAhead\(draft, now\);/);
  assert.match(sheet, /title=\{scheduling \? "Schedule activity" : logging \? "Add activity" : "Customize training"\}/);
  const calendar = readFileSync(join(process.cwd(), "src/features/calendar/ActivityCalendarScreen.tsx"), "utf8");
  assert.match(calendar, /const answerable = item\.status === "planned" && ended;/, "Done or Didn't happen only once its time has passed.");
  assert.match(calendar, /\{answerable && loggable \? \(/, "Done only while the day can still be logged.");
}

if (machineZone === undefined) delete process.env.TZ;
else process.env.TZ = machineZone;

console.log("Scheduled activities passed.");
