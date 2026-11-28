import type { RideEntry, RideMoodRecord, RidePhaseEntry } from "../../backend";
import { disciplineLabel } from "../../domain/labels";
import { localMomentLabel } from "../../domain/local-day";
import type { RideSession } from "./RideExperience";
import { rideTrainingLabel } from "./ride-plan";

/**
 * The question Ralf is asked about one ride. Ralf is only shown the rider's
 * few newest rides, and cannot be pointed at one of them, so the ride's facts
 * travel in the message itself: the same words work for the ride just
 * finished and for one from last month. Pure, so the wording is tested.
 */

/** The server refuses a message over 3000 characters; this leaves room. */
export const RIDE_REVIEW_PROMPT_LIMIT = 2900;
/** As much of a rider's note as Ralf reads from the journal on his own. */
export const RIDE_REVIEW_NOTE_LIMIT = 400;

export type RideReviewFacts = {
  /** "Pole work", or the discipline for rides from before the setup sheet. */
  training: string;
  /** Absent when the ride has no horse, or the horse is no longer the rider's. */
  horseName?: string;
  startedAt: string;
  elapsedSeconds: number;
  plannedDuration?: string;
  completedPhases: number;
  totalPhases: number;
  phases?: readonly RidePhaseEntry[];
  mood?: RideMoodRecord;
  focus?: string;
  note?: string;
  /** Added by hand with Add activity: the minutes are the rider's, not the clock's. */
  logged: boolean;
};

/** "<1 min" for a ride the timer barely saw, as the journal says it, not "0 min". */
export const rideMinutesLabel = (seconds: number) =>
  seconds < 60 ? "<1 min" : `${Math.round(seconds / 60)} min`;


// An emoji is two UTF-16 units. A cut between them leaves half of one, and
// coach-chat cannot save a message holding it (Postgres refuses it as JSON),
// so the question would fail on that ride every time.
const cutAt = (text: string, limit: number) => text.slice(0, limit).replace(/[\uD800-\uDBFF]$/, "");

export const rideReviewFactsFromEntry = (entry: RideEntry, horseName?: string): RideReviewFacts => ({
  training: rideTrainingLabel(entry.trainingType) ?? disciplineLabel(entry.discipline),
  ...(horseName ? { horseName } : {}),
  startedAt: entry.startedAt,
  elapsedSeconds: entry.elapsedSeconds,
  ...(entry.plannedDuration ? { plannedDuration: entry.plannedDuration } : {}),
  completedPhases: entry.completedPhases,
  totalPhases: entry.totalPhases,
  ...(entry.phases ? { phases: entry.phases } : {}),
  ...(entry.mood ? { mood: entry.mood } : {}),
  focus: entry.focus,
  ...(entry.riderNote ? { note: entry.riderNote } : {}),
  logged: entry.source === "manual"
});

/** The ride just finished, before or after the journal holds it. The clock timed it. */
export const rideReviewFactsFromSession = (session: RideSession, horseName?: string): RideReviewFacts => ({
  training: rideTrainingLabel(session.trainingType) ?? disciplineLabel(session.discipline),
  ...(horseName ? { horseName } : {}),
  startedAt: session.startedAt,
  elapsedSeconds: session.elapsedSeconds,
  ...(session.plannedDuration ? { plannedDuration: session.plannedDuration } : {}),
  completedPhases: session.completedPhases,
  totalPhases: session.totalPhases,
  ...(session.phases ? { phases: session.phases } : {}),
  ...(session.mood ? { mood: session.mood.toLowerCase() as RideMoodRecord } : {}),
  focus: session.focus,
  logged: false
});

const phaseLine = (phase: RidePhaseEntry, logged: boolean) => {
  const name = phase.detail ? `${phase.title} (${phase.detail})` : phase.title;
  const planned = rideMinutesLabel(phase.plannedSeconds);
  if (logged) return `${name}: ${planned}.`;
  return phase.actualSeconds === undefined
    ? `${name}: planned ${planned}, not reached.`
    : `${name}: planned ${planned}, rode ${rideMinutesLabel(phase.actualSeconds)}.`;
};

/**
 * One message, in plain sentences. The day comes first on purpose: Ralf's
 * history titles a conversation with the first 45 characters of its first
 * message, and the day is what tells two reviews of the same training apart.
 * The question closes it and is never cut; if anything has to give, it is the
 * tail of the facts.
 */
export const rideReviewPrompt = (facts: RideReviewFacts): string =>
  sessionPrompt(facts, "Review", "What went well, and what is the one thing to work on next time?");

/** A comparison stays a few lines; a row no screen could write cannot push the question out. */
const RIDE_COMPARE_LIMIT = 700;

/**
 * The same ride, with how it compares to the rides before it
 * (ride-compare.ts), and the rider's own question about the difference.
 * The comparison comes after the ride's facts and is kept whole: if
 * anything has to give, it is still the tail of the facts.
 */
export const rideComparePrompt = (facts: RideReviewFacts, comparison: readonly string[], question: string): string =>
  sessionPrompt(facts, "Compare", question, comparison);

const sessionPrompt = (
  facts: RideReviewFacts,
  verb: "Review" | "Compare",
  question: string,
  comparison: readonly string[] = []
): string => {
  const moment = localMomentLabel(facts.startedAt);
  const [day, time] = moment ? moment.split(" · ") : [];
  const opening = `${verb} my session${day ? ` on ${day}` : ""}: ${facts.training}${facts.horseName ? ` with ${facts.horseName}` : ""}.`;
  const compared = comparison.join("\n");
  const tail = compared.length > RIDE_COMPARE_LIMIT ? `${cutAt(compared, RIDE_COMPARE_LIMIT - 3).trim()}...` : compared;

  const lines: string[] = [];
  if (time) lines.push(`It started at ${time}.`);
  if (facts.logged) {
    lines.push(`I added it by hand afterwards, so the app did not time it. It lasted ${rideMinutesLabel(facts.elapsedSeconds)}.`);
  } else {
    const planned = facts.plannedDuration ? ` The plan was ${facts.plannedDuration}.` : "";
    lines.push(`The app timed it live. I rode for ${rideMinutesLabel(facts.elapsedSeconds)}.${planned}`);
    if (facts.totalPhases > 0) lines.push(`I reached ${facts.completedPhases} of ${facts.totalPhases} phases.`);
  }
  for (const phase of facts.phases ?? []) lines.push(phaseLine(phase, facts.logged));
  if (facts.mood) lines.push(`${facts.horseName ?? "My horse"} felt ${facts.mood}.`);
  // Older rides keep a focus of their own ("Rhythm"); newer ones repeat the training.
  const focus = facts.focus?.trim();
  if (focus && focus.toLowerCase() !== facts.training.toLowerCase()) lines.push(`I worked on: ${focus}.`);
  const note = facts.note?.replace(/\s+/g, " ").trim();
  if (note) {
    lines.push(`My note: ${note.length > RIDE_REVIEW_NOTE_LIMIT ? `${cutAt(note, RIDE_REVIEW_NOTE_LIMIT).trim()}...` : note}`);
  }

  const room = RIDE_REVIEW_PROMPT_LIMIT - opening.length - question.length - 4 - (tail ? tail.length + 2 : 0);
  const body = lines.join("\n");
  const kept = body.length > room ? `${cutAt(body, Math.max(0, room - 3)).trim()}...` : body;
  return `${opening}\n\n${kept}${tail ? `\n\n${tail}` : ""}\n\n${question}`;
};
