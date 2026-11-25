import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { coachMessageKey, ralfAnswerArrives, ralfIsThinking } from "../src/features/coach/coach-thinking";

// While a question waits for Ralf, his "Thinking" row stands where the answer
// will appear, and the answer fades in when it comes. Nothing else moves.

const question = { id: "pending-n1", role: "user" as const, status: "pending" as const, clientNonce: "n1" };
const asked = { ...question, id: "m1", status: "complete" as const };
const answer = { id: "m2", role: "assistant" as const, status: "complete" as const, clientNonce: "n1" };
const earlier = { id: "m0", role: "assistant" as const, status: "complete" as const, clientNonce: "" };

// Thinking: only while the last thing on screen is the question being sent.
assert.equal(ralfIsThinking([question], true), true);
assert.equal(ralfIsThinking([earlier, question], true), true);
assert.equal(ralfIsThinking([question], false), false, "nothing is being sent");
assert.equal(ralfIsThinking([asked, answer], true), false, "the answer is already there");
assert.equal(ralfIsThinking([{ ...question, status: "failed" as const }], true), false, "a failed question shows Retry instead");
assert.equal(ralfIsThinking([], true), false);

// The question keeps one key from the copy shown while it is sent to the copy
// the server returns, so it never counts as new and never replays.
assert.equal(coachMessageKey(question), coachMessageKey(asked));
assert.notEqual(coachMessageKey(question), coachMessageKey(answer), "question and answer share a nonce, not a key");
assert.equal(coachMessageKey(earlier), "assistant:m0", "a message without a nonce is known by its id");

// Arriving: an answer not yet on screen, once the conversation has loaded.
const shownBefore = new Set([coachMessageKey(earlier), coachMessageKey(question)]);
assert.equal(ralfAnswerArrives(answer, shownBefore), true);
assert.equal(ralfAnswerArrives(earlier, shownBefore), false, "already on screen");
assert.equal(ralfAnswerArrives(answer, null), false, "the conversation is still loading");
assert.equal(ralfAnswerArrives(asked, new Set()), false, "only Ralf's answers fade in");

// Wiring: the row sits after the messages, takes the place of "Sending...",
// respects reduced motion, and the arrival only plays without reduced motion.
const root = process.cwd();
const screen = readFileSync(join(root, "src", "features", "coach", "CoachScreen.tsx"), "utf8");
assert.match(screen, /const thinking = ralfIsThinking\(controller\.messages, controller\.sending\);/);
assert.match(screen, /showPendingLabel=\{!thinking\}/);
assert.match(screen, /<ThinkingIndicator testID="ralf-thinking" author="Ralf" reducedMotion=\{reducedMotion\} \/>/);
assert.match(screen, /animate=\{!reducedMotion && ralfAnswerArrives\(message, shownMessages\.current\)\}/);
assert.ok(
  screen.indexOf("controller.messages.map(") < screen.indexOf("<ThinkingIndicator"),
  "the Thinking row comes after the messages"
);
const indicator = readFileSync(join(root, "src", "ui", "conversation", "ThinkingIndicator.tsx"), "utf8");
assert.match(indicator, /if \(reducedMotion\) \{\s*dots\.forEach\(\(dot\) => dot\.setValue\(1\)\);\s*return;/);
assert.match(indicator, /accessibilityLabel=\{`\$\{author\} is thinking`\}/);
assert.match(indicator, /useNativeDriver: true/);
const message = readFileSync(join(root, "src", "ui", "conversation", "ConversationMessage.tsx"), "utf8");
assert.match(message, /status === "pending" && showPendingLabel \? <Text style=\{styles\.pending\}>Sending\.\.\.<\/Text>/);
assert.match(message, /showPendingLabel = true,/, "other conversations keep their Sending... line");

console.log("Ralf thinking passed.");
