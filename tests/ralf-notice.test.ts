import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { ralfAiNotice } from "../src/features/coach/coach-copy";

const root = process.cwd();

// What the first build tells a rider before they write to Ralf: he is an AI,
// and what leaves Equina to get an answer.
assert.equal(
  ralfAiNotice,
  "Ralf is an AI assistant. Your question and the context you allow in Account are sent to an AI provider to write the answer."
);
assert.doesNotMatch(ralfAiNotice, /!/);

// The owner has not approved naming the provider, in this line or anywhere
// else a rider can read.
const providerNames = /\b(anthropic|claude|openai|chatgpt|gpt-?\d|gemini|mistral|llama|deepseek|grok)\b/i;
assert.doesNotMatch(ralfAiNotice, providerNames);
const clientSources = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? clientSources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
for (const path of clientSources(join(root, "src"))) {
  assert.doesNotMatch(readFileSync(path, "utf8"), providerNames, `${relative(root, path)} names an AI provider.`);
}

// It sits in the empty state, where a conversation starts. The demo answers on
// the device and sends nothing, so it does not claim to.
const screen = readFileSync(join(root, "src", "features", "coach", "CoachScreen.tsx"), "utf8");
const emptyState = screen.slice(screen.indexOf("<View style={styles.empty}>"), screen.indexOf("controller.messages.map("));
assert.match(emptyState, /\{controller\.demo \? null : <Text testID="ralf-ai-notice" style=\{styles\.aiNotice\}>\{ralfAiNotice\}<\/Text>\}/);

console.log("Ralf AI notice passed.");
