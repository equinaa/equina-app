import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coachContextFor } from "../supabase/functions/_shared/coach-context";

// Account > Privacy and Ralf: "Choose the factual context Ralf may use.
// Turning context off changes the next server request, not just the
// interface." This is the server's side of that sentence, switch by switch.

const root = process.cwd();
const bella = "7c1e5d7a-3f1b-4c66-9d0a-2b7f1f3e9a10";
const allOn = { reduced_personalization: false, use_rider_profile: true, use_selected_horse: true, use_ride_history: true };

// Every switch on, a conversation about Bella: her details, and her rides.
assert.deepEqual(coachContextFor(allOn, bella), { riderProfile: true, horseId: bella, rides: { horseId: bella } });

// "Ride history" off: no ride at all, whatever the other switches say.
assert.equal(coachContextFor({ ...allOn, use_ride_history: false }, bella).rides, null);
assert.equal(coachContextFor({ ...allOn, use_ride_history: false }, null).rides, null);
assert.equal(coachContextFor({ ...allOn, use_ride_history: false, use_selected_horse: false, use_rider_profile: false }, bella).rides, null);
// And it changes nothing else.
assert.deepEqual(
  coachContextFor({ ...allOn, use_ride_history: false }, bella),
  { riderProfile: true, horseId: bella, rides: null }
);

// "Ride history" on: the rides of the horse the conversation is about, never
// every horse's.
assert.deepEqual(coachContextFor(allOn, bella).rides, { horseId: bella });
// With no horse (a rider who has none, or a question about a ride that had
// none), the rides logged with no horse.
assert.deepEqual(coachContextFor(allOn, null).rides, { horseId: null });
assert.deepEqual(coachContextFor(allOn, undefined).rides, { horseId: null });
assert.deepEqual(coachContextFor(allOn, "").rides, { horseId: null });

// "Selected horse" off holds back the horse's name, breed and discipline. The
// rides on that horse have their own switch, and stay scoped to it.
assert.deepEqual(
  coachContextFor({ ...allOn, use_selected_horse: false }, bella),
  { riderProfile: true, horseId: null, rides: { horseId: bella } }
);
// No horse in the conversation: nothing to send, switch on or off.
assert.equal(coachContextFor(allOn, null).horseId, null);

// "Rider profile" off touches only the profile.
assert.deepEqual(
  coachContextFor({ ...allOn, use_rider_profile: false }, bella),
  { riderProfile: false, horseId: bella, rides: { horseId: bella } }
);

// "Minimal context": only the current question. Account greys the other three
// out while it is on and keeps their values, so it has to win over all of them.
const nothing = { riderProfile: false, horseId: null, rides: null };
assert.deepEqual(coachContextFor({ ...allOn, reduced_personalization: true }, bella), nothing);
assert.deepEqual(coachContextFor({ reduced_personalization: true }, bella), nothing);
assert.deepEqual(coachContextFor({ ...allOn, reduced_personalization: true }, null), nothing);

// Each switch alone, and all of them off without "Minimal context".
assert.deepEqual(
  coachContextFor({ reduced_personalization: false, use_rider_profile: false, use_selected_horse: false, use_ride_history: true }, bella),
  { riderProfile: false, horseId: null, rides: { horseId: bella } }
);
assert.deepEqual(
  coachContextFor({ reduced_personalization: false, use_rider_profile: false, use_selected_horse: false, use_ride_history: false }, bella),
  nothing
);

// A rider whose switches were never saved gets the column defaults
// (202607230001): the three sources on, "Minimal context" off.
const defaults = { riderProfile: true, horseId: bella, rides: { horseId: bella } };
assert.deepEqual(coachContextFor(null, bella), defaults);
assert.deepEqual(coachContextFor(undefined, bella), defaults);
assert.deepEqual(coachContextFor({}, bella), defaults);
const migration = readFileSync(join(root, "supabase", "migrations", "202607230001_account_preferences.sql"), "utf8");
assert.match(migration, /use_rider_profile boolean not null default true/);
assert.match(migration, /use_selected_horse boolean not null default true/);
assert.match(migration, /use_ride_history boolean not null default true/);
assert.match(migration, /reduced_personalization boolean not null default false/);

// The promise as Account words it. If these change, the server's reading of
// each switch has to be looked at again.
const accountScreen = readFileSync(join(root, "src", "features", "account", "AccountScreen.tsx"), "utf8");
assert.ok(accountScreen.includes("Turning context off changes the next server request, not just the interface."));
for (const title of ["Rider profile", "Selected horse", "Ride history", "Minimal context"]) {
  assert.ok(accountScreen.includes(`title="${title}"`), `Account still offers "${title}".`);
}
assert.ok(accountScreen.includes('detail="Send only the current question"'));

// Every switch Account saves is one the server reads. "Ride history" was saved
// for months and read by nothing.
const accountRepository = readFileSync(join(root, "src", "backend", "account-repository.ts"), "utf8");
const coachContextSource = readFileSync(join(root, "supabase", "functions", "_shared", "coach-context.ts"), "utf8");
const savedSwitches = [...accountRepository.matchAll(/payload\.(use_[a-z_]+|reduced_personalization) = /g)].map((match) => match[1] as string);
assert.deepEqual([...savedSwitches].sort(), ["reduced_personalization", "use_ride_history", "use_rider_profile", "use_selected_horse"]);
for (const column of savedSwitches) {
  assert.match(coachContextSource, new RegExp(`switches\\?\\.${column}\\b`), `coach-chat must read ${column}.`);
}

console.log("Ralf context switches passed.");
