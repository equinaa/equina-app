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

// "The context you allow in Account" is a promise only the server can keep:
// coach-chat has to read every switch under Privacy and Ralf, and a store
// build cannot take the sentence back. The rule that the function is deployed
// first lives in the claim registry, and stays there for as long as the line
// makes the promise.
const promise = "the context you allow in Account";
assert.ok(ralfAiNotice.includes(promise));
const registry = readFileSync(join(root, "docs", "EQUINA_ACTION_REGISTRY.md"), "utf8");
const claims = registry.slice(registry.indexOf("## Production Claim Registry"), registry.indexOf("## Release Gate"));
const unrecorded =
  "The Ralf line promises the Account switches. Keep its row in the Production Claim Registry (docs/EQUINA_ACTION_REGISTRY.md), with the deploy it waits for, or reword the line so it promises nothing the server has to keep.";
const claimRow = claims.split("\n").find((row) => row.startsWith("| Ralf is sent only the context the rider allows |"));
assert.ok(claimRow, unrecorded);
const [truth = "", rule = ""] = claimRow.split("|").slice(2, 4);
assert.ok(truth.includes(`"${promise}"`), unrecorded);
assert.match(truth, /true only on a `coach-chat` that reads all four switches/, unrecorded);
assert.match(rule, /Before a store build reaches a tester, production runs a `coach-chat` that reads `use_ride_history`/, unrecorded);
assert.match(rule, /no over-the-air update can take them back/, unrecorded);
// How to tell on a device, in the words the app shows: the sheet of an answer
// lists what the server read for it, and the server names the rides this way.
assert.match(rule, /BASED ON must not list `recent rides`/, unrecorded);
const stale = "The device check in the claim registry reads BASED ON and `recent rides` on an answer's sheet: reword the check with them.";
assert.ok(screen.includes("<Text style={styles.basedOnLabel}>BASED ON</Text>"), stale);
const coachChat = readFileSync(join(root, "supabase", "functions", "coach-chat", "index.ts"), "utf8");
assert.ok(coachChat.includes('basedOn.push("recent rides")'), stale);

console.log("Ralf AI notice passed.");
