import assert from "node:assert/strict";
import {
  EQUINA_NEXT_STOP_REPLY,
  EQUINA_READY_REPLY,
  normalizeCoachQuestion,
  scriptedCoachReply,
  scriptedReplyUserIds
} from "../supabase/functions/_shared/coach-scripted-replies";

const brand = "5f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f";
const rider = "0a1b2c3d-4e5f-4a6b-9c7d-8e9f0a1b2c3d";
const listed = scriptedReplyUserIds(brand);

// The reply is the brand's exact text: an en dash (U+2013) between the days,
// not a hyphen an editor or formatter could slip in.
assert.equal(EQUINA_NEXT_STOP_REPLY, "Hong Kong. 29–31 January.");
assert.equal(EQUINA_NEXT_STOP_REPLY.length, 25);
assert.equal(new TextEncoder().encode(EQUINA_NEXT_STOP_REPLY).length, 27);
assert.ok(EQUINA_NEXT_STOP_REPLY.includes("–"));
assert.ok(!EQUINA_NEXT_STOP_REPLY.includes("29-31"));

// The question as it is typed, and as a phone keyboard may send it.
for (const asked of [
  "Where should Equina go next?",
  "where should equina go next",
  "WHERE SHOULD EQUINA GO NEXT?",
  "  Where should Equina go next?  ",
  "Where  should\tEquina go next ?",
  "Where should Equina go next ?",
  "Where should Equina go next ?",
  "Where should Equina go next？",
  "Where should Equina go next?!",
  "Where should Equina go next.",
  "Where should Equina go next…",
  "“Where should Equina go next?”",
  "\"Where should Equina go next?\"",
  "Ralf, where should Equina go next?",
  "Ralph: where should Equina go next?",
  // iOS autocorrect turns the brand name into a word it knows.
  "Where should Equine go next?"
]) {
  assert.equal(scriptedCoachReply(asked, brand, listed), EQUINA_NEXT_STOP_REPLY, `should match: ${JSON.stringify(asked)}`);
}

// Anything else from the same account is a real question for the model.
for (const asked of [
  "Where should Equina go next? And what should I pack?",
  "Where should Equina go next year?",
  "Where should I go next?",
  "Where should my horse go next?",
  "Where should Equina go",
  "Should Equina go next?",
  "Where did Equina go?",
  "Hey Ralf, where should Equina go next?",
  "Ralfwhere should Equina go next?",
  "Where should Equina go next? I think Paris.",
  "Onde a Equina deve ir agora?",
  ""
]) {
  assert.equal(scriptedCoachReply(asked, brand, listed), null, `should not match: ${JSON.stringify(asked)}`);
}

// Only listed accounts get it; any other rider asking the same question gets
// the model, and so does everyone when the secret is not set.
assert.equal(scriptedCoachReply("Where should Equina go next?", rider, listed), null);
assert.equal(scriptedCoachReply("Where should Equina go next?", brand, scriptedReplyUserIds(undefined)), null);
assert.equal(scriptedCoachReply("Where should Equina go next?", brand, scriptedReplyUserIds("")), null);
assert.equal(scriptedCoachReply("Where should Equina go next?", brand, scriptedReplyUserIds("  ")), null);

// The secret takes one or more ids, by commas or whitespace, in any case.
assert.deepEqual([...scriptedReplyUserIds(` ${brand.toUpperCase()} ,\n${rider} `)], [brand, rider]);
assert.equal(scriptedCoachReply("Where should Equina go next?", brand, scriptedReplyUserIds(brand.toUpperCase())), EQUINA_NEXT_STOP_REPLY);
assert.equal(scriptedCoachReply("Where should Equina go next?", brand.toUpperCase(), listed), EQUINA_NEXT_STOP_REPLY);

assert.equal(normalizeCoachQuestion("  “Ralf,  Where should Equina go next ?” "), "ralf where should equina go next");

// The Hong Kong film: the rider asks Ralf after her training, and the answer
// is the brand's exact text, one sentence per line so the phone shows three
// lines instead of wrapping "go." onto a line of its own.
assert.equal(EQUINA_READY_REPLY, "You are ready.\nHong Kong, 29 January.\nLet's go.");
assert.deepEqual(EQUINA_READY_REPLY.split("\n"), ["You are ready.", "Hong Kong, 29 January.", "Let's go."]);
assert.ok(!EQUINA_READY_REPLY.includes("\r") && !/ \n|\n /.test(EQUINA_READY_REPLY), "plain line breaks, no stray spaces");
assert.ok(EQUINA_READY_REPLY.includes("Let's"), "a straight apostrophe, as the brand wrote it");
assert.ok(!EQUINA_READY_REPLY.includes("’"));

for (const asked of [
  "Hey Ralf, what do you think?",
  "hey ralf what do you think",
  "HEY RALF, WHAT DO YOU THINK?",
  "  Hey Ralf,  what do you think ?  ",
  "Hey Ralf, what do you think？",
  "Hey Ralf, what do you think?!",
  "“Hey Ralf, what do you think?”",
  "Hey, Ralf, what do you think?",
  "Ralf, what do you think?",
  // Dictation and autocorrect spell the name the common way.
  "Hey Ralph, what do you think?",
  "Hey Ralph what do you think"
]) {
  assert.equal(scriptedCoachReply(asked, brand, listed), EQUINA_READY_REPLY, `should match: ${JSON.stringify(asked)}`);
}

// A real question from the same account still reaches the model, and so does
// the film's question from any other rider.
for (const asked of [
  "What do you think?",
  "Hey, what do you think?",
  "Hey Ralf, what do you think about Hong Kong?",
  "Hey Ralf, what do you think of my ride today?",
  "Hey Ralf, what do you think? Be honest.",
  "Hey Ralf, what did you think?",
  "Hey Ralf",
  "Oi Ralf, o que você acha?"
]) {
  assert.equal(scriptedCoachReply(asked, brand, listed), null, `should not match: ${JSON.stringify(asked)}`);
}
assert.equal(scriptedCoachReply("Hey Ralf, what do you think?", rider, listed), null);
assert.equal(scriptedCoachReply("Hey Ralf, what do you think?", brand, scriptedReplyUserIds(undefined)), null);

// Each question keeps its own answer.
assert.equal(scriptedCoachReply("Where should Equina go next?", brand, listed), EQUINA_NEXT_STOP_REPLY);
assert.equal(scriptedCoachReply("Hey Ralf, where should Equina go next?", brand, listed), null);
