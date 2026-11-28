import assert from "node:assert/strict";
import { assessHealthConcern, mentionsHealthConcern } from "../supabase/functions/_shared/coach-safety";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RideEntry } from "../src/backend";
import { coachHorseFor } from "../src/features/coach/coach-types";
import { coachContextFor } from "../supabase/functions/_shared/coach-context";
import type { RideSession } from "../src/features/ride/RideExperience";
import { defaultRidePhases, rideTrainingTypes } from "../src/features/ride/ride-plan";
import {
  RIDE_REVIEW_NOTE_LIMIT,
  RIDE_REVIEW_PROMPT_LIMIT,
  rideMinutesLabel,
  rideReviewFactsFromEntry,
  rideReviewFactsFromSession,
  rideReviewPrompt
} from "../src/features/ride/ride-review-prompt";

// "Ask Ralf about this ride": Ralf cannot be pointed at one ride, so the
// ride's facts travel in the question. One builder writes it, for the ride
// just finished and for one opened from the journal.

// Local time on purpose: the prompt names the day and the hour as the rider
// lived them, whatever zone the tests run in.
const startedAt = new Date(2026, 10, 17, 14, 50).toISOString();
const completedAt = new Date(2026, 10, 17, 15, 32).toISOString();
const question = "What went well, and what is the one thing to work on next time?";

const liveEntry: RideEntry = {
  id: "ride-1",
  riderId: "rider-a",
  horseId: "horse-a",
  discipline: "jumping",
  trainingType: "pole-work",
  focus: "Pole work",
  plannedDuration: "52 min",
  startedAt,
  completedAt,
  elapsedSeconds: 42 * 60,
  completedPhases: 3,
  totalPhases: 4,
  phases: [
    { title: "Pre warm-up", detail: "Walk", plannedSeconds: 600, actualSeconds: 660 },
    { title: "Warm-up", detail: "Trot", plannedSeconds: 420, actualSeconds: 480 },
    { title: "Training", detail: "Pole work", plannedSeconds: 1200, actualSeconds: 1380 },
    { title: "Cool-down", plannedSeconds: 900 }
  ],
  mood: "focused",
  source: "live",
  createdAt: completedAt,
  updatedAt: completedAt
};

const manualEntry: RideEntry = {
  ...liveEntry,
  id: "ride-2",
  trainingType: "hack",
  discipline: "trail",
  focus: "Hack",
  plannedDuration: "45 min",
  elapsedSeconds: 45 * 60,
  completedPhases: 2,
  totalPhases: 2,
  phases: [
    { title: "Warm-up", detail: "Walk", plannedSeconds: 900, actualSeconds: 900 },
    { title: "Training", detail: "Hack", plannedSeconds: 1800, actualSeconds: 1800 }
  ],
  mood: undefined,
  riderNote: "Quiet in the woods, a little sharp past the tractor.",
  source: "manual"
};

// The filter coach-chat runs on the whole message. A hit answers with the
// fixed "contact your veterinarian" reply, so the template's own words must
// never be what trips it. The filter lives in _shared, so the test runs the
// real one in every language it reads.
const coachChat = readFileSync(join(process.cwd(), "supabase/functions/coach-chat/index.ts"), "utf8");
assert.ok(coachChat.includes("assessHealthConcern(input.message)"));
assert.ok(mentionsHealthConcern("He felt lame behind"));
assert.match(coachChat, /message: z\.string\(\)\.trim\(\)\.min\(1\)\.max\(3000\)/);
assert.ok(RIDE_REVIEW_PROMPT_LIMIT < 3000);

{
  // A ride the clock timed: every fact, in plain sentences.
  const prompt = rideReviewPrompt(rideReviewFactsFromEntry(liveEntry, "Test"));
  const lines = prompt.split("\n");
  assert.equal(lines[0], "Review my session on Tue 17 Nov: Pole work with Test.");
  assert.equal(lines[1], "");
  assert.equal(lines.at(-1), question);
  assert.equal(lines.at(-2), "");
  assert.ok(prompt.includes("It started at 14:50."));
  assert.ok(prompt.includes("The app timed it live. I rode for 42 min. The plan was 52 min."));
  assert.ok(prompt.includes("I reached 3 of 4 phases."));
  assert.ok(prompt.includes("Pre warm-up (Walk): planned 10 min, rode 11 min."));
  assert.ok(prompt.includes("Training (Pole work): planned 20 min, rode 23 min."));
  assert.ok(prompt.includes("Cool-down: planned 15 min, not reached."));
  assert.ok(prompt.includes("Test felt focused."));
  // The focus only repeats the training here, so it is not said twice.
  assert.ok(!prompt.includes("I worked on"));
  assert.ok(!prompt.includes("My note"));
  assert.ok(!prompt.includes("by hand"));
  assert.ok(!prompt.includes("—"));
  assert.ok(!mentionsHealthConcern(prompt), prompt);
  assert.ok(prompt.length < RIDE_REVIEW_PROMPT_LIMIT);
}

{
  // An activity added by hand says so: its minutes are not the clock's.
  const prompt = rideReviewPrompt(rideReviewFactsFromEntry(manualEntry, "Test"));
  assert.ok(prompt.startsWith("Review my session on Tue 17 Nov: Hack with Test.\n\n"));
  assert.ok(prompt.includes("I added it by hand afterwards, so the app did not time it. It lasted 45 min."));
  assert.ok(prompt.includes("Warm-up (Walk): 15 min."));
  assert.ok(prompt.includes("Training (Hack): 30 min."));
  assert.ok(prompt.includes("My note: Quiet in the woods, a little sharp past the tractor."));
  assert.ok(!prompt.includes("timed it live"));
  assert.ok(!prompt.includes("The plan was"));
  assert.ok(!prompt.includes("phases."));
  assert.ok(!prompt.includes("planned"));
  assert.ok(!prompt.includes("felt"));
  assert.ok(prompt.endsWith(`\n\n${question}`));
  assert.ok(!mentionsHealthConcern(prompt), prompt);
}

{
  // No horse on the ride, or one that is no longer the rider's.
  const prompt = rideReviewPrompt(rideReviewFactsFromEntry({ ...liveEntry, horseId: undefined, mood: "fresh" }));
  assert.ok(prompt.startsWith("Review my session on Tue 17 Nov: Pole work.\n"));
  assert.ok(prompt.includes("My horse felt fresh."));
}

{
  // A ride from before the setup sheet: the discipline names it, the focus is its own.
  const facts = rideReviewFactsFromEntry(
    { ...liveEntry, trainingType: undefined, focus: "Rhythm", phases: undefined, plannedDuration: undefined },
    "Test"
  );
  assert.equal(facts.training, "Jumping");
  const prompt = rideReviewPrompt(facts);
  assert.ok(prompt.startsWith("Review my session on Tue 17 Nov: Jumping with Test."));
  assert.ok(prompt.includes("I worked on: Rhythm."));
  assert.ok(prompt.includes("The app timed it live. I rode for 42 min.\n"));
  assert.ok(!prompt.includes("The plan was"));
}

// The stored discipline 'trail' reads "Leisure", as everywhere the rider sees it.
assert.equal(rideReviewFactsFromEntry({ ...liveEntry, trainingType: undefined, discipline: "trail" }, "Test").training, "Leisure");

{
  // The ride just finished, as the recap holds it: capitalised names, no source.
  const session: RideSession = {
    id: "local-1",
    startedAt,
    completedAt,
    discipline: "Jumping",
    trainingType: "pole-work",
    focus: "Pole work",
    plannedDuration: "52 min",
    elapsedSeconds: 42 * 60,
    completedPhases: 3,
    totalPhases: 4,
    phases: liveEntry.phases,
    mood: "Tender"
  };
  const facts = rideReviewFactsFromSession(session, "Test");
  assert.equal(facts.mood, "tender");
  assert.equal(facts.logged, false);
  // The same words as the same ride opened from the journal later.
  assert.equal(
    rideReviewPrompt(facts),
    rideReviewPrompt(rideReviewFactsFromEntry({ ...liveEntry, mood: "tender" }, "Test"))
  );
  // Before the rider picked a feeling, none is claimed.
  const { mood: _mood, ...unrated } = session;
  assert.ok(!rideReviewPrompt(rideReviewFactsFromSession(unrated)).includes("felt"));
  assert.equal(rideReviewFactsFromSession({ ...session, trainingType: undefined }).training, "Jumping");
  assert.equal(rideReviewFactsFromSession({ ...session, trainingType: undefined, discipline: "Trail" }).training, "Leisure");
}

{
  // A long note is cut where Ralf's own reading of the journal cuts it.
  const note = `${"a".repeat(RIDE_REVIEW_NOTE_LIMIT)}ZZZ${"b".repeat(1600)}`;
  const prompt = rideReviewPrompt(rideReviewFactsFromEntry({ ...manualEntry, riderNote: note }, "Test"));
  assert.ok(prompt.includes(`My note: ${"a".repeat(RIDE_REVIEW_NOTE_LIMIT)}...`));
  assert.ok(!prompt.includes("Z"));
  assert.ok(!prompt.includes("b".repeat(10)));
  assert.ok(prompt.endsWith(question));
  // A note typed on several lines stays one fact.
  const spaced = rideReviewPrompt(rideReviewFactsFromEntry({ ...manualEntry, riderNote: "Calm.\n\nGood canter." }));
  assert.ok(spaced.includes("My note: Calm. Good canter."));
}

{
  // The most a ride can hold stays well inside the server's 3000 characters.
  const fullest = rideReviewPrompt(rideReviewFactsFromEntry({
    ...liveEntry,
    trainingType: "cross-country",
    focus: "f".repeat(120),
    totalPhases: 12,
    completedPhases: 12,
    phases: Array.from({ length: 12 }, () => ({
      title: "t".repeat(60), detail: "d".repeat(60), plannedSeconds: 5400, actualSeconds: 5400
    })),
    riderNote: "n".repeat(2000)
  }, "h".repeat(80)));
  assert.ok(fullest.length <= RIDE_REVIEW_PROMPT_LIMIT, `fullest prompt is ${fullest.length} characters`);
  assert.ok(fullest.includes(`My note: ${"n".repeat(RIDE_REVIEW_NOTE_LIMIT)}...`));
  assert.ok(fullest.endsWith(question));

  // A row no screen could have written still cannot push the question out.
  const absurd = rideReviewPrompt(rideReviewFactsFromEntry({
    ...liveEntry,
    phases: Array.from({ length: 400 }, (_, index) => ({ title: `Phase ${index}`, plannedSeconds: 600, actualSeconds: 600 }))
  }, "Test"));
  assert.ok(absurd.length <= RIDE_REVIEW_PROMPT_LIMIT);
  assert.ok(absurd.startsWith("Review my session on Tue 17 Nov: Pole work with Test."));
  assert.ok(absurd.endsWith(`...\n\n${question}`));
}

{
  // Ralf's history names a conversation after the first 45 characters of its
  // first message. The day has to be among them, or two reviews of Pole work
  // on different days look the same there.
  assert.match(coachChat, /return compact\.length <= 48 \? compact : `\$\{compact\.slice\(0, 45\)\.trim\(\)\}\.\.\.`;/);
  const historyTitle = (message: string) => {
    const compact = message.replace(/\s+/g, " ").trim();
    return compact.length <= 48 ? compact : `${compact.slice(0, 45).trim()}...`;
  };
  for (const training of rideTrainingTypes) {
    for (const horse of [undefined, "Test", "Sir Galahad of the Northern Hills"]) {
      const title = historyTitle(rideReviewPrompt(rideReviewFactsFromEntry({ ...liveEntry, trainingType: training.id }, horse)));
      assert.ok(title.startsWith("Review my session on Tue 17 Nov:"), title);
    }
  }
  const lastDayOfMonth = new Date(2026, 8, 30, 9, 5).toISOString();
  assert.ok(
    historyTitle(rideReviewPrompt(rideReviewFactsFromEntry({ ...liveEntry, startedAt: lastDayOfMonth }, "Test")))
      .startsWith("Review my session on Wed 30 Sep:")
  );
}

{
  // An emoji is two UTF-16 units. A cut between them leaves half of one,
  // which Postgres refuses as JSON when coach-chat saves the message: Ralf
  // would fail on that ride every time.
  const loneHalf = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
  const split = `${"a".repeat(RIDE_REVIEW_NOTE_LIMIT - 1)}🐴${"b".repeat(100)}`;
  const prompt = rideReviewPrompt(rideReviewFactsFromEntry({ ...manualEntry, riderNote: split }, "Test"));
  assert.doesNotMatch(prompt, loneHalf);
  assert.ok(prompt.includes(`My note: ${"a".repeat(RIDE_REVIEW_NOTE_LIMIT - 1)}...`));
  // An emoji that fits whole stays.
  const whole = `${"a".repeat(RIDE_REVIEW_NOTE_LIMIT - 2)}🐴${"b".repeat(100)}`;
  assert.ok(rideReviewPrompt(rideReviewFactsFromEntry({ ...manualEntry, riderNote: whole }, "Test"))
    .includes(`My note: ${"a".repeat(RIDE_REVIEW_NOTE_LIMIT - 2)}🐴...`));
  // The same where the facts are cut to fit. A horse name one letter longer
  // moves the cut by one, so one of the two lands inside an emoji.
  for (const horse of ["Test", "Tests"]) {
    const cut = rideReviewPrompt(rideReviewFactsFromEntry(
      { ...liveEntry, phases: undefined, mood: undefined, focus: "🐴".repeat(2000) },
      horse
    ));
    assert.ok(cut.length <= RIDE_REVIEW_PROMPT_LIMIT);
    assert.ok(cut.endsWith(`...\n\n${question}`));
    assert.doesNotMatch(cut, loneHalf);
  }
}

{
  // Ralf talks about the horse of the ride he is asked about. A ride with no
  // horse, or on one the rider no longer has (sold and archived, or no longer
  // shared), is asked about with no horse: never as a ride on the Home horse.
  const names = { bella: "Bella", max: "Max" };
  const home = { selectedHorseId: "bella", hasHorse: true, horseName: "Bella" };
  assert.equal(coachHorseFor(undefined, names, home), home, "No question about a horse: the one on Home.");
  assert.deepEqual(coachHorseFor("max", names, home), { selectedHorseId: "max", hasHorse: true, horseName: "Max" });
  const none = coachHorseFor(null, names, home);
  assert.deepEqual(none, { hasHorse: false, horseName: "" });
  assert.equal(none.selectedHorseId, undefined, "coach-chat then starts the conversation with no horse.");
  // A horse that leaves while Ralf is open hands him back to Home's, as before.
  assert.equal(coachHorseFor("gone", names, home), home);
  // The server follows the same horse when it reads the journal on its own:
  // asked about Max, Max's rides; asked with no horse, the rides logged with
  // no horse, never Bella's because she is the horse on Home.
  const everySwitchOn = { use_rider_profile: true, use_selected_horse: true, use_ride_history: true };
  assert.deepEqual(coachContextFor(everySwitchOn, coachHorseFor("max", names, home).selectedHorseId).rides, { horseId: "max" });
  assert.deepEqual(coachContextFor(everySwitchOn, none.selectedHorseId).rides, { horseId: null });
  // With "Ride history" off the server adds no ride at all. The ride being
  // asked about still goes, in the rider's own message, because they sent it.
  assert.equal(coachContextFor({ ...everySwitchOn, use_ride_history: false }, "max").rides, null);
}

// Every training the app offers, with its usual phases, timed and logged,
// with every feeling, for horses whose names are words in another language
// Ralf reads: the fixed wording never reads as a health question.
const neutral: string[] = [];
const horseNames = ["Test", "Dolores", "Seb", "Sebe", "Rana", "Rani", "Laz", "Dor", "Dores", "Remedios", "Doze", "Santa", "Coja"];
for (const horseName of horseNames) for (const training of rideTrainingTypes) {
  const phases = defaultRidePhases(training).map((phase, index) => ({
    title: phase.title,
    detail: phase.detail,
    plannedSeconds: phase.minutes * 60,
    ...(index < 2 ? { actualSeconds: phase.minutes * 60 } : {})
  }));
  for (const mood of ["fresh", "focused", "tender"] as const) {
    for (const source of ["live", "manual"] as const) {
      neutral.push(rideReviewPrompt(rideReviewFactsFromEntry({
        ...liveEntry, trainingType: training.id, focus: training.label, phases, mood, source,
        completedPhases: 2, totalPhases: phases.length
      }, horseName)));
    }
  }
}
assert.equal(neutral.length, horseNames.length * rideTrainingTypes.length * 6);
assert.deepEqual(neutral.filter((prompt) => mentionsHealthConcern(prompt)), []);
// A note in another language is read in its own language inside the
// English template: Portuguese "dor", Spanish "dolía" and Hungarian "fáj" are
// health words there, whatever the horse is called.
assert.ok(rideReviewPrompt(rideReviewFactsFromEntry({ ...manualEntry, riderNote: "x" })).includes("My note: x"));
for (const [note, language] of [
  ["Ela estava com dor na pata depois do salto.", "pt"],
  ["Le dolía el lomo al final.", "es"],
] as const) {
  assert.deepEqual(assessHealthConcern(rideReviewPrompt(rideReviewFactsFromEntry({ ...manualEntry, riderNote: note }, "Estrela"))), { concern: true, language }, note);
}
assert.equal(mentionsHealthConcern(rideReviewPrompt(rideReviewFactsFromEntry({ ...manualEntry, riderNote: "Treino tranquilo, ela foi muito bem." }, "Estrela"))), false);
// The rider's own words are still screened like any message to Ralf.
assert.ok(mentionsHealthConcern(rideReviewPrompt(rideReviewFactsFromEntry({ ...manualEntry, riderNote: "No swelling today." }))));

assert.equal(rideMinutesLabel(0), "<1 min");
assert.equal(rideMinutesLabel(59), "<1 min");
assert.equal(rideMinutesLabel(60), "1 min");
assert.equal(rideMinutesLabel(42 * 60 + 40), "43 min");

console.log("Ride review prompt passed.");
