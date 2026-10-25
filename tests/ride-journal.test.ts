import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { RideRepository } from "../src/backend/ride-repository";

// The journal used to hold the newest 30 rides and nothing else, so a rider
// out five times a week lost the start of last month from the month summary,
// and Home said "30 rides are now in your journal" forever after.

type Row = Record<string, unknown>;
type Call = { since?: string; limit?: number; count?: boolean };

const DAY = 86_400_000;
const now = Date.parse("2026-10-25T09:00:00Z");

/** One ride a day, newest first, ending `count` days back. */
const dailyRides = (count: number): Row[] =>
  Array.from({ length: count }, (_, index) => {
    const completedAt = new Date(now - index * DAY).toISOString();
    return {
      id: `ride-${index}`, rider_id: "rider-a", horse_id: null, discipline: "jumping", training_type: null,
      focus: "Poles", planned_duration: null, started_at: completedAt, completed_at: completedAt,
      elapsed_seconds: 1800, completed_phases: 3, total_phases: 3, phases: null, mood: null, rider_note: null,
      created_at: completedAt, updated_at: completedAt
    };
  });

/** Just enough of PostgREST's builder: select, gte, order, limit, and a head count. */
const fakeClient = (rows: Row[], calls: Call[]) => ({
  from: () => {
    const call: Call = {};
    const builder = {
      select: (_columns: string, options?: { head?: boolean }) => {
        if (options?.head) {
          calls.push({ count: true });
          return Promise.resolve({ count: rows.length, error: null });
        }
        return builder;
      },
      gte: (_column: string, value: string) => {
        call.since = value;
        return builder;
      },
      order: () => builder,
      limit: (limit: number) => {
        call.limit = limit;
        calls.push(call);
        const since = call.since ? Date.parse(call.since) : -Infinity;
        const data = rows.filter((row) => Date.parse(String(row.completed_at)) >= since).slice(0, limit);
        return Promise.resolve({ data, error: null });
      }
    };
    return builder;
  }
}) as unknown as SupabaseClient;

const daysAgo = (days: number) => new Date(now - days * DAY).toISOString();

{
  const calls: Call[] = [];
  const rides = await new RideRepository(fakeClient(dailyRides(12), calls)).listSince(daysAgo(55));
  assert.equal(rides.length, 12, "A rider with fewer than 30 rides gets all of them.");
  assert.equal(calls.length, 1, "in one read.");
}

{
  const calls: Call[] = [];
  const rides = await new RideRepository(fakeClient(dailyRides(80), calls)).listSince(daysAgo(55));
  assert.equal(rides.length, 56, "A busy rider gets every ride back to the start of last month, not just 30.");
  assert.equal(calls.length, 2);
  assert.equal(calls[1]?.since, daysAgo(55));
  assert.equal(rides[0]?.id, "ride-0", "Newest first.");
}

{
  const calls: Call[] = [];
  const rides = await new RideRepository(fakeClient(dailyRides(80), calls)).listSince(daysAgo(10));
  assert.equal(rides.length, 30, "When the newest 30 already reach back far enough, that is the journal.");
  assert.equal(calls.length, 1);
}

{
  const calls: Call[] = [];
  assert.equal(await new RideRepository(fakeClient(dailyRides(80), calls)).count(), 80, "Home counts every ride, not the page loaded.");
  assert.deepEqual(calls, [{ count: true }]);
}

console.log("Ride journal reads passed.");
