import assert from "node:assert/strict";
import type { HorseTimelineRecord } from "../src/backend/contracts";
import type { CareItem } from "../src/domain/care-schedule";
import {
  buildCareSchedule,
  cadenceOf,
  careUrgency,
  completionFor,
  daysUntilDue,
  defaultCadenceDays,
  describeDue,
  isCareType,
  needsAttention,
  nextDueOn
} from "../src/domain/care-schedule";

const TODAY = "2026-09-27";

/** Assert the schedule holds exactly one item, and hand it back typed. */
const only = (items: readonly CareItem[]): CareItem => {
  assert.equal(items.length, 1, `expected exactly one scheduled item, got ${items.length}`);
  return items[0] as CareItem;
};

let sequence = 0;
const record = (patch: Partial<HorseTimelineRecord> = {}): HorseTimelineRecord => ({
  id: `record-${(sequence += 1)}`,
  horseId: "horse-a",
  createdBy: "rider-a",
  recordType: "farrier",
  status: "current",
  title: "Shoeing",
  occurredOn: "2026-08-16",
  source: "rider",
  details: {},
  createdAt: "2026-08-16T09:00:00Z",
  updatedAt: "2026-08-16T09:00:00Z",
  ...patch
});

// Urgency is derived from the due date, never from the stored status column.
{
  assert.equal(careUrgency("2026-09-20", TODAY), "overdue");
  assert.equal(careUrgency("2026-09-27", TODAY), "today");
  assert.equal(careUrgency("2026-10-05", TODAY), "soon");
  assert.equal(careUrgency("2026-10-11", TODAY), "soon", "the soon window reaches 14 days out");
  assert.equal(careUrgency("2026-10-12", TODAY), "scheduled", "and stops after it");
  assert.equal(careUrgency(undefined, TODAY), null);
  assert.equal(careUrgency("not-a-date", TODAY), null);
  assert.equal(careUrgency("2026-13-45", TODAY), null, "a well-shaped impossible date is still not a date");
}

// The bug this feature exists to fix: the stored status says current while the
// vaccination lapsed months ago. The schedule must contradict the column.
{
  const lapsed = record({ recordType: "vaccination", status: "current", dueOn: "2026-03-01" });
  const item = only(buildCareSchedule([lapsed], TODAY));
  assert.equal(item.urgency, "overdue");
  assert.equal(item.daysUntil, -210);
  assert.equal(describeDue(item), "210 days overdue");
}

// Days are whole and timezone-independent: the same answer in Lisbon and Helsinki.
{
  assert.equal(daysUntilDue("2026-09-28", TODAY), 1);
  assert.equal(daysUntilDue("2026-09-26", TODAY), -1);
  assert.equal(daysUntilDue("2027-09-27", TODAY), 365);
  assert.equal(
    daysUntilDue("2026-10-25", "2026-10-24"),
    1,
    "a European DST boundary must not produce a half day"
  );
}

// Only recurring care appears. A passport does not come due; a lab result is history.
{
  assert.ok(isCareType("farrier") && isCareType("vaccination") && isCareType("dental"));
  assert.ok(!isCareType("passport") && !isCareType("lab") && !isCareType("note") && !isCareType("nutrition"));

  const schedule = buildCareSchedule(
    [
      record({ recordType: "passport", dueOn: "2026-10-01" }),
      record({ recordType: "lab", dueOn: "2026-10-02" }),
      record({ recordType: "note", dueOn: "2026-10-03" }),
      record({ recordType: "farrier", dueOn: "2026-10-04" })
    ],
    TODAY
  );
  assert.equal(only(schedule).careType, "farrier");
}

// Archived records and records with no due date stay out of the schedule.
{
  const schedule = buildCareSchedule(
    [
      record({ recordType: "dental", dueOn: "2026-10-01", status: "archived" }),
      record({ recordType: "vet", dueOn: undefined })
    ],
    TODAY
  );
  assert.deepEqual(schedule, []);
}

// One line per horse and care type. A horse shod nine times this year must not
// produce nine farrier rows -- the latest appointment supersedes the rest.
{
  const schedule = buildCareSchedule(
    [
      record({ recordType: "farrier", occurredOn: "2026-05-01", dueOn: "2026-06-12" }),
      record({ recordType: "farrier", occurredOn: "2026-06-12", dueOn: "2026-07-24" }),
      record({ recordType: "farrier", occurredOn: "2026-08-16", dueOn: "2026-09-27" })
    ],
    TODAY
  );
  const shoeing = only(schedule);
  assert.equal(shoeing.dueOn, "2026-09-27");
  assert.equal(shoeing.urgency, "today");
}

// Different horses keep their own schedules.
{
  const schedule = buildCareSchedule(
    [
      record({ horseId: "horse-a", recordType: "farrier", dueOn: "2026-10-02" }),
      record({ horseId: "horse-b", recordType: "farrier", dueOn: "2026-10-09" })
    ],
    TODAY
  );
  assert.equal(schedule.length, 2);
  assert.deepEqual(schedule.map((item) => item.record.horseId), ["horse-a", "horse-b"]);
}

// The schedule is ordered by what happens next, and attention is the front of it.
{
  const schedule = buildCareSchedule(
    [
      record({ recordType: "vet", dueOn: "2027-01-01" }),
      record({ recordType: "vaccination", dueOn: "2026-09-20" }),
      record({ recordType: "farrier", dueOn: "2026-10-04" }),
      record({ recordType: "dental", dueOn: "2026-09-27" })
    ],
    TODAY
  );
  assert.deepEqual(schedule.map((item) => item.careType), ["vaccination", "dental", "farrier", "vet"]);
  assert.deepEqual(needsAttention(schedule).map((item) => item.careType), ["vaccination", "dental", "farrier"]);
}

// Cadence is read from details, and nonsense is refused rather than trusted.
{
  assert.equal(cadenceOf(record({ details: { cadenceDays: 42 } })), 42);
  assert.equal(cadenceOf(record({ details: { cadenceDays: 42.4 } })), 42);
  assert.equal(cadenceOf(record({ details: {} })), null);
  assert.equal(cadenceOf(record({ details: { cadenceDays: 0 } })), null);
  assert.equal(cadenceOf(record({ details: { cadenceDays: -7 } })), null);
  assert.equal(cadenceOf(record({ details: { cadenceDays: 99_999 } })), null);
  assert.equal(cadenceOf(record({ details: { cadenceDays: "42" } })), null, "a string is not a cadence");
  assert.equal(cadenceOf(record({ details: { cadenceDays: Number.NaN } })), null);
}

// Adding a cadence crosses months and leap years correctly.
{
  assert.equal(nextDueOn("2026-09-27", 42), "2026-11-08");
  assert.equal(nextDueOn("2026-12-20", 42), "2027-01-31");
  assert.equal(nextDueOn("2028-02-28", 1), "2028-02-29", "2028 is a leap year");
  assert.equal(nextDueOn("2026-09-27", 365), "2027-09-27");
  assert.equal(nextDueOn("not-a-date", 42), null);
  assert.equal(nextDueOn("2026-09-27", 0), null);
}

// Logging care as done schedules the next one from the day it happened.
{
  const item = only(
    buildCareSchedule([record({ recordType: "farrier", dueOn: "2026-09-27", details: { cadenceDays: 42 } })], TODAY)
  );
  const done = completionFor(item, "2026-09-27");
  assert.deepEqual(done, { occurredOn: "2026-09-27", dueOn: "2026-11-08", cadenceDays: 42 });
}

// A visit that happens late moves the whole cycle, because that is what
// happened to the horse -- the next shoeing is six weeks from the real visit,
// not six weeks from the date it was supposed to be.
{
  const item = only(
    buildCareSchedule([record({ recordType: "farrier", dueOn: "2026-09-13", details: { cadenceDays: 42 } })], TODAY)
  );
  assert.equal(item.urgency, "overdue");
  const done = completionFor(item, "2026-09-27");
  assert.equal(done?.dueOn, "2026-11-08", "not 2026-10-25, which would compound the delay");
}

// A record with no cadence still completes, falling back to the type default.
{
  const item = only(buildCareSchedule([record({ recordType: "vaccination", dueOn: "2026-10-01" })], TODAY));
  assert.equal(item.cadenceDays, null);
  const done = completionFor(item, "2026-09-27");
  assert.equal(done?.cadenceDays, defaultCadenceDays.vaccination);
  assert.equal(done?.dueOn, "2027-09-27");
}

// Completion refuses a date it cannot parse rather than inventing one.
{
  const item = only(buildCareSchedule([record({ dueOn: "2026-10-01" })], TODAY));
  assert.equal(completionFor(item, "tomorrow"), null);
}

// The sentences a rider actually reads.
{
  const phrase = (dueOn: string) => describeDue(only(buildCareSchedule([record({ dueOn })], TODAY)));
  assert.equal(phrase("2026-09-26"), "1 day overdue");
  assert.equal(phrase("2026-09-27"), "Due today");
  assert.equal(phrase("2026-09-28"), "Due tomorrow");
  assert.equal(phrase("2026-10-04"), "Due in 7 days");
}

console.log("Care schedule derivation passed.");
