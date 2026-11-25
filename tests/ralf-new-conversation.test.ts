import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// "New conversation" in Ralf's menu has to leave an empty conversation on
// screen. Ralf opens on the latest conversation (resumeLatest), and the history
// loads again whenever the active conversation changes, so starting a new one
// must switch that resume off, or the latest conversation comes straight back.

const hook = readFileSync(join(process.cwd(), "src", "features", "coach", "useCoachConversation.ts"), "utf8");

const startNew = hook.slice(hook.indexOf("const startNew = useCallback("), hook.indexOf("const updateContext = useCallback("));
assert.ok(startNew.length > 0, "startNew is where it was");
assert.match(startNew, /resumeLatestRef\.current = false;/, "starting a new conversation stops the resume");
assert.ok(
  startNew.indexOf("resumeLatestRef.current = false;") < startNew.indexOf('setActiveConversationId("")'),
  "the resume is off before the active id is cleared"
);

// The resume itself only ever happens through that ref, on a history load with
// no conversation open.
assert.match(hook, /if \(resumeLatestRef\.current && !activeConversationId && next\[0\]\) \{\s*await loadConversation\(next\[0\]\.id\);/);
assert.match(hook, /useEffect\(\(\) => \{\s*if \(mode === "connected" && enabled\) void loadHistory\(\);\s*\}, \[enabled, loadHistory, mode\]\);/);

console.log("Ralf new conversation passed.");
