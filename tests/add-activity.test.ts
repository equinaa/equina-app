import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RideEntry } from "../src/backend/contracts";
import { RideRepository } from "../src/backend/ride-repository";
import { localMomentLabel, shortDayLabel } from "../src/domain/local-day";
import { describeLogged, describeTracked, summarise } from "../src/domain/ride-stats";
import {
  activityCompletion,
  activityDays,
  activityProblem,
  activityStartedAt,
  activityTimeExists,
  activityWindowDays,
  defaultActivityStart,
  defaultRidePhases,
  formatActivityTime,
  rideTrainingTypeById,
  type ActivityDraft
} from "../src/features/ride/ride-plan";

// Add activity: a training done without the clock, logged afterwards into
// the journal (202610250001).

// The rider's local calendar decides "today" and "yesterday", so this file
// runs in one zone and puts the machine's back at the end.
const machineZone = process.env.TZ;
process.env.TZ = "Europe/Bucharest";

const hack = rideTrainingTypeById("hack")!;
const lunging = rideTrainingTypeById("lunging")!;
// Sunday 25 October 2026, 12:10 in Bucharest (UTC+2 after the clocks went back that morning).
const now = Date.parse("2026-10-25T10:10:00Z");
const plan = { horseId: "daimon", horseName: "Daimon", trainingType: hack, phases: defaultRidePhases(hack) };
const draft = (patch: Partial<ActivityDraft> = {}): ActivityDraft => ({ day: "2026-10-24", startMinutes: 9 * 60, plan, ...patch });

// --- When it can be ------------------------------------------------------------------

{
  const days = activityDays(now);
  assert.equal(days.length, activityWindowDays);
  assert.deepEqual(days.slice(0, 3), ["2026-10-25", "2026-10-24", "2026-10-23"], "Today first, then back one day at a time.");
  assert.equal(days[days.length - 1], "2026-10-19", "A week, today included.");
  assert.deepEqual(activityDays(Date.parse("2026-03-01T08:00:00Z")).slice(0, 2), ["2026-03-01", "2026-02-28"], "Back across a month end.");
}

{
  // The phases come to 52 minutes; at 12:10 the last quarter hour from which
  // they had already ended is 11:15.
  const midday = defaultActivityStart(now, 52);
  assert.deepEqual(midday, { day: "2026-10-25", startMinutes: 11 * 60 + 15 });
  assert.equal(activityProblem(draft(midday), now), null, "The sheet opens on something that can be saved as it is.");

  // At 00:30 nothing 52 minutes long has finished today yet: it opens on
  // yesterday evening instead of on an error.
  const afterMidnight = Date.parse("2026-10-24T21:30:00Z");
  const late = defaultActivityStart(afterMidnight, 52);
  assert.deepEqual(late, { day: "2026-10-24", startMinutes: 23 * 60 + 30 });
  assert.equal(activityProblem(draft(late), afterMidnight), null);
  assert.match(
    activityProblem(draft({ day: "2026-10-25", startMinutes: 0 }), afterMidnight) ?? "",
    /Pick an earlier day/,
    "When no start today could have ended, the rider is sent to another day, not to an earlier time."
  );

  assert.equal(formatActivityTime(11 * 60 + 15), "11:15");
  assert.equal(formatActivityTime(0), "00:00");
}

// The clocks go forward on 28 March 2027 in Romania, from 03:00 to 04:00:
// 03:30 is not a time that day. Going back in October, 03:30 happens twice.
{
  assert.equal(activityTimeExists("2027-03-28", 3 * 60 + 30), false);
  assert.equal(activityTimeExists("2027-03-28", 2 * 60 + 45), true);
  assert.equal(activityTimeExists("2027-03-28", 4 * 60), true);
  assert.equal(activityTimeExists("2026-10-25", 3 * 60 + 30), true);
  assert.match(
    activityProblem(draft({ day: "2027-03-28", startMinutes: 3 * 60 + 30 }), Date.parse("2027-03-28T12:00:00Z")) ?? "",
    /clocks went forward/
  );
  // An hour after the jump the latest start is still a real quarter hour.
  assert.deepEqual(defaultActivityStart(Date.parse("2027-03-28T01:50:00Z"), 52), { day: "2027-03-28", startMinutes: 2 * 60 + 45 });
}

{
  assert.equal(activityProblem(draft(), now), null, "Yesterday morning can be saved.");
  assert.equal(activityProblem(draft({ day: "2026-10-25", startMinutes: 11 * 60 }), now), null, "Earlier today, finished by now, can be saved.");
  assert.match(
    activityProblem(draft({ day: "2026-10-25", startMinutes: 11 * 60 + 30 }), now) ?? "",
    /hasn't finished yet/,
    "A training that would still be going on now cannot be logged."
  );
  assert.match(activityProblem(draft({ day: "2026-10-18" }), now) ?? "", /up to 6 days back/, "Eight days ago is outside the window.");
  assert.match(activityProblem(draft({ day: "2026-10-26" }), now) ?? "", /up to 6 days back/, "Tomorrow is not a day to log.");
  assert.match(
    activityProblem(draft({ plan: { ...plan, phases: [{ id: "a", title: " ", detail: "", minutes: 10 }] } }), now) ?? "",
    /Give every phase a name/,
    "The phases follow the same rules as a ride's."
  );
}

// --- What is saved -------------------------------------------------------------------

{
  // The clocks went back at 04:00 that Sunday: local times still land where the rider said.
  assert.equal(activityStartedAt({ day: "2026-10-25", startMinutes: 9 * 60 }).toISOString(), "2026-10-25T07:00:00.000Z");
  assert.equal(activityStartedAt({ day: "2026-10-24", startMinutes: 9 * 60 }).toISOString(), "2026-10-24T06:00:00.000Z");

  const session = activityCompletion(draft(), "Jumping");
  assert.equal(session.startedAt, "2026-10-24T06:00:00.000Z");
  assert.equal(session.completedAt, "2026-10-24T06:52:00.000Z", "It ends when its phases do.");
  assert.equal(session.elapsedSeconds, 52 * 60);
  assert.equal(session.plannedDuration, "52 min");
  assert.equal(session.trainingType, "hack");
  assert.equal(session.focus, "Hack");
  assert.equal(session.discipline, "Trail", "The training's own discipline wins over the horse's.");
  assert.equal(session.completedPhases, 4);
  assert.equal(session.totalPhases, 4);
  assert.deepEqual(
    session.phases?.map((phase) => [phase.title, phase.plannedSeconds, phase.actualSeconds]),
    [["Pre warm-up", 600, 600], ["Warm-up", 420, 420], ["Training", 1200, 1200], ["Cool-down", 900, 900]],
    "Every phase was done for the minutes entered: none reads as never reached."
  );
  assert.equal(
    activityCompletion(draft({ plan: { ...plan, trainingType: lunging, phases: defaultRidePhases(lunging) } }), "Dressage").discipline,
    "Dressage",
    "A training with no discipline of its own takes the horse's."
  );
}

// --- How the journal tells them apart ------------------------------------------------

{
  const entry = (patch: Partial<RideEntry>): RideEntry => ({
    id: `ride-${patch.completedAt}`, riderId: "rider-a", discipline: "trail", focus: "Hack",
    startedAt: "2026-10-23T09:00:00Z", completedAt: "2026-10-23T09:52:00Z",
    elapsedSeconds: 3120, completedPhases: 4, totalPhases: 4,
    createdAt: "2026-10-23T10:00:00Z", updatedAt: "2026-10-23T10:00:00Z",
    ...patch
  });
  const summary = summarise([
    entry({ completedAt: "2026-10-21T09:52:00Z", elapsedSeconds: 1500 }),
    entry({ completedAt: "2026-10-23T09:52:00Z", source: "manual" }),
    entry({ completedAt: "2026-10-24T09:52:00Z", source: "live", elapsedSeconds: 600 })
  ], "week", "2026-10-25");
  assert.equal(summary?.rides, 3, "A logged activity is a ride in the count.");
  assert.equal(summary?.trackedSeconds, 2100, "but its minutes are not tracked time.");
  assert.equal(summary?.loggedSeconds, 3120);
  assert.equal(describeTracked(summary?.trackedSeconds ?? 0), "35 min tracked");
  assert.equal(describeLogged(summary?.loggedSeconds ?? 0), "52 min logged");
  assert.equal(describeLogged(30), null);
}

{
  assert.equal(localMomentLabel("2026-10-23T11:50:00Z"), "Fri 23 Oct · 14:50");
  assert.equal(localMomentLabel("nonsense"), null);
  assert.equal(shortDayLabel("2026-09-01"), "1 Sep");
  assert.equal(shortDayLabel("1 Sep"), null);
}

// --- What reaches the database -------------------------------------------------------

{
  const inserts: Record<string, unknown>[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "rider-a" } } }) },
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        const saved = { id: `ride-${inserts.length}`, created_at: "2026-10-25T10:10:00Z", updated_at: "2026-10-25T10:10:00Z", ...row, source: row.source ?? "live" };
        return { select: () => ({ single: async () => ({ data: saved, error: null }) }) };
      }
    })
  } as unknown as SupabaseClient;
  const rides = new RideRepository(client);
  const session = activityCompletion(draft(), "Jumping");
  const base = { ...session, discipline: "trail" as const, horseId: "daimon" };

  const logged = await rides.create({ ...base, source: "manual" });
  assert.equal(inserts[0]?.source, "manual", "A logged activity says so.");
  assert.equal(logged.source, "manual");

  const timed = await rides.create({ ...base, source: "live" });
  assert.equal("source" in (inserts[1] ?? {}), false, "A timed ride sends no source, so it saves even before the column exists.");
  assert.equal(timed.source, "live");
}

if (machineZone === undefined) delete process.env.TZ;
else process.env.TZ = machineZone;

console.log("Add activity passed.");
