import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  coachMessageKey,
  ralfAnswerArrives,
  ralfIsThinking,
  showsSendingLine
} from "../src/features/coach/coach-thinking";

// While a question waits for Ralf, his "Thinking" row stands where the answer
// will appear, and the answer fades in when it comes. Nothing else moves.

const question = { id: "pending-n1", role: "user" as const, status: "pending" as const, clientNonce: "n1" };
const asked = { ...question, id: "m1", status: "complete" as const };
const answer = { id: "m2", role: "assistant" as const, status: "complete" as const, clientNonce: "n1" };
const earlierQuestion = { id: "m3", role: "user" as const, status: "complete" as const, clientNonce: "n0" };
const earlierAnswer = { id: "m4", role: "assistant" as const, status: "complete" as const, clientNonce: "n0" };

// Thinking: only while the last thing on screen is the question being sent.
assert.equal(ralfIsThinking([question], true), true);
assert.equal(ralfIsThinking([earlierQuestion, earlierAnswer, question], true), true);
assert.equal(ralfIsThinking([question], false), false, "nothing is being sent");
assert.equal(ralfIsThinking([question, answer], true), false, "the answer came in before the send returned");
assert.equal(ralfIsThinking([{ ...question, status: "failed" as const }], true), false, "a failed question shows Retry");
assert.equal(ralfIsThinking([], true), false);

// "Sending..." under a question: never while a send is in flight (the Thinking
// row says it), never once the answer is on screen.
assert.equal(showsSendingLine(question, [question], true), false, "the Thinking row stands in");
assert.equal(
  showsSendingLine(question, [question, answer], true),
  false,
  "Realtime delivered the answer before the send returned"
);
assert.equal(
  showsSendingLine(question, [question, answer], false),
  false,
  "a late copy of an answered question still says pending"
);
assert.equal(showsSendingLine(question, [question], false), true, "pending with nothing in flight and no answer");
assert.equal(showsSendingLine(asked, [asked], false), false);
assert.equal(showsSendingLine(answer, [question, answer], false), false, "only questions carry the line");

// The question keeps one key from the copy shown while it is sent to the copy
// the server returns, so it never counts as new.
assert.equal(coachMessageKey(question), coachMessageKey(asked));
assert.notEqual(coachMessageKey(question), coachMessageKey(answer), "question and answer share a nonce, not a key");
assert.equal(coachMessageKey({ ...earlierAnswer, clientNonce: "" }), "assistant:m4", "no nonce: known by its id");

// Arriving: an answer whose question was already on screen, and it was not.
const shownWhileAsking = new Set([coachMessageKey(earlierQuestion), coachMessageKey(earlierAnswer), coachMessageKey(question)]);
const live = [earlierQuestion, earlierAnswer, asked, answer];
assert.equal(ralfAnswerArrives(answer, live, shownWhileAsking), true);
assert.equal(ralfAnswerArrives(earlierAnswer, live, shownWhileAsking), false, "already on screen");
assert.equal(ralfAnswerArrives(answer, live, new Set()), false, "a conversation opening: question and answer come together");
assert.equal(
  ralfAnswerArrives(answer, live, new Set([coachMessageKey(earlierQuestion), coachMessageKey(earlierAnswer)])),
  false,
  "the demo restoring a saved conversation: the question was not on screen first"
);
assert.equal(ralfAnswerArrives(asked, live, shownWhileAsking), false, "only Ralf's answers fade in");
assert.equal(
  ralfAnswerArrives({ ...answer, clientNonce: "" }, live, shownWhileAsking),
  false,
  "an answer without its question's nonce cannot be matched"
);

// Wiring in the Ralf screen.
const root = process.cwd();
const read = (...path: string[]) => readFileSync(join(root, ...path), "utf8");
const screen = read("src", "features", "coach", "CoachScreen.tsx");
assert.match(screen, /const thinking = ralfIsThinking\(controller\.messages, controller\.sending\);/);
assert.match(
  screen,
  /\{thinking \? \(\s*<View style=\{styles\.messageBlock\}>\s*<ThinkingIndicator testID="ralf-thinking" author="Ralf" reducedMotion=\{reducedMotion\} \/>\s*<\/View>\s*\) : null\}\s*<\/ScrollView>/,
  "the Thinking row is the last thing in the conversation, shown only while thinking"
);
assert.match(screen, /showPendingLabel=\{showsSendingLine\(message, controller\.messages, controller\.sending\)\}/);
assert.match(
  screen,
  /arriving=\{!reducedMotion && ralfAnswerArrives\(message, controller\.messages, shownMessages\.current\)\}/,
  "the fade follows the rule and never plays with reduced motion"
);
assert.match(
  screen,
  /if \(Platform\.OS !== "web" && ralfAnswerArrives\(message, controller\.messages, shown\)\) \{\s*AccessibilityInfo\.announceForAccessibility\(`Ralf: \$\{message\.text\}`\);/,
  "a screen reader hears the answer that just arrived"
);

// The answer fades under Ralf's name, which stays still; every other message
// keeps its children directly in the row.
const message = read("src", "ui", "conversation", "ConversationMessage.tsx");
assert.match(message, /showPendingLabel = true,/, "other conversations keep their Sending... line");
assert.match(message, /status === "pending" && showPendingLabel \? <Text style=\{styles\.pending\}>Sending\.\.\.<\/Text>/);
assert.match(
  message,
  /\{author \? <Text style=\{styles\.author\}>\{author\}<\/Text> : null\}[\s\S]*\{coachReply \? <ArrivingView animate=\{arriving\} style=\{styles\.content\}>\{content\}<\/ArrivingView> : content\}/
);

// Motion follows the app's convention (no native driver on the web) and stops
// with reduced motion; the Thinking row is announced when it appears.
const indicator = read("src", "ui", "conversation", "ThinkingIndicator.tsx");
const arriving = read("src", "ui", "motion", "ArrivingView.tsx");
for (const [name, source] of [["ThinkingIndicator", indicator], ["ArrivingView", arriving]] as const) {
  const timings = source.match(/Animated\.timing\(/g)?.length ?? 0;
  const drivers = source.match(/useNativeDriver: (?:nativeDriver|Platform\.OS !== "web")/g)?.length ?? 0;
  assert.ok(timings > 0, `${name} animates`);
  assert.equal(drivers, timings, `${name}: every animation picks the driver by platform`);
  assert.doesNotMatch(source, /useNativeDriver: true/, `${name} must not force the native driver on the web`);
}
assert.match(indicator, /const nativeDriver = Platform\.OS !== "web";/);
assert.match(indicator, /if \(reducedMotion\) \{\s*dots\.forEach\(\(dot\) => dot\.setValue\(1\)\);\s*return;/);
assert.match(indicator, /AccessibilityInfo\.announceForAccessibility\(`\$\{author\} is thinking`\)/);
assert.match(indicator, /accessibilityLabel=\{`\$\{author\} is thinking`\}/);

console.log("Ralf thinking passed.");
