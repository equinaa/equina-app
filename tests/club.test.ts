import assert from "node:assert/strict";
import { backendError } from "../src/backend/errors";
import {
  clubErrorMessage,
  clubReportReasons,
  isDuplicateReport,
  relativeTime,
  rideShareLine,
  spaceSlugForDiscipline
} from "../src/features/club/club-format";

const now = Date.parse("2026-10-02T12:00:00Z");

// Relative time.
{
  assert.equal(relativeTime("2026-10-02T11:59:40Z", now), "Just now");
  assert.equal(relativeTime("2026-10-02T11:55:00Z", now), "5m");
  assert.equal(relativeTime("2026-10-02T09:00:00Z", now), "3h");
  assert.equal(relativeTime("2026-09-30T12:00:00Z", now), "2d");
  assert.equal(relativeTime("2026-09-01T12:00:00Z", now), "Sep 1");
  assert.equal(relativeTime("2026-10-02T12:05:00Z", now), "Just now", "A clock ahead of the server must not show negative time.");
  assert.equal(relativeTime("not a date", now), "");
}

// A shared ride carries its own summary: other riders cannot open the journal.
{
  assert.equal(
    rideShareLine({ horseName: "Ralfy", elapsedSeconds: 1920, focus: "Rhythm", mood: "focused" }),
    "Ralfy · 32 min · Rhythm · felt focused"
  );
  assert.equal(rideShareLine({ elapsedSeconds: 20, focus: "Walk" }), "1 min · Walk", "A short ride still reads as a ride.");
  assert.equal(rideShareLine({ horseName: " ", elapsedSeconds: 600, focus: "" }), "10 min");
}

// Default space per discipline.
{
  assert.equal(spaceSlugForDiscipline("Jumping"), "jumping");
  assert.equal(spaceSlugForDiscipline("Trail"), "trail");
  assert.equal(spaceSlugForDiscipline("Western"), "coach-qa", "An unknown discipline falls back to the shared space.");
}

// Report reasons match public.report_reason exactly.
{
  assert.deepEqual(
    clubReportReasons.map((reason) => reason.value).sort(),
    ["animal_welfare", "harassment", "nudity", "other", "scam", "spam", "unsafe_advice"]
  );
}

// Errors the rider can act on, never the database's own words.
{
  const fromDatabase = (message: string, code?: string) =>
    backendError(Object.assign(new Error(message), { code, status: 400 }), "fallback");
  assert.equal(isDuplicateReport(fromDatabase("duplicate key value violates unique constraint", "23505")), true);
  assert.equal(isDuplicateReport(fromDatabase("anything", "42501")), false);
  assert.match(clubErrorMessage(fromDatabase("Post rate limit exceeded", "P0001"), "x"), /posting quickly/);
  assert.match(clubErrorMessage(fromDatabase("This account is temporarily restricted", "P0001"), "x"), /temporarily restricted/);
  assert.match(
    clubErrorMessage(fromDatabase('new row violates row-level security policy for table "club_posts"', "42501"), "x"),
    /not open for this account/
  );
  const offline = backendError(
    Object.assign(new Error("Network request failed"), { status: 0, name: "AuthRetryableFetchError" }),
    "fallback"
  );
  assert.match(clubErrorMessage(offline, "x"), /offline/);
  assert.equal(clubErrorMessage(fromDatabase("relation does not exist", "42P01"), "The feed could not be loaded."), "The feed could not be loaded.");
}

console.log("Club rules passed.");
