import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  formatClock,
  lessonCategories,
  parseClock,
  publishBlockers,
  readChapters,
  readLessonForm,
  slugFor
} from "../admin/src/lib/lessons";
import { queueReason, reasonLabel, restoreLabel } from "../admin/src/lib/moderation";
import { knownTopics } from "../src/features/academy/academy-catalog";

// --- Filing a lesson ---------------------------------------------------------

// A lesson filed under a topic the app does not filter by is only reachable
// under "All", so the admin offers exactly the app's topics.
assert.deepEqual([...lessonCategories], knownTopics, "The admin's categories must be the app's Academy topics.");

// --- Lengths and chapter marks -------------------------------------------------

assert.equal(parseClock("14:30"), 870);
assert.equal(parseClock(" 1:02:00 "), 3720);
assert.equal(parseClock("45"), 45, "A bare number is seconds.");
assert.equal(parseClock(""), null, "An empty field is no length, not a wrong one.");
for (const nonsense of ["twelve", "12:75", "1:2:3:4", "-5", "4.5", "4:"]) {
  assert.equal(parseClock(nonsense), undefined, `"${nonsense}" is not a time.`);
}
assert.equal(formatClock(870), "14:30");
assert.equal(formatClock(3720), "1:02:00");
assert.equal(formatClock(5), "0:05");
for (const seconds of [0, 59, 61, 599, 3599, 3600, 86400]) {
  assert.equal(parseClock(formatClock(seconds)), seconds, `${seconds}s must survive formatting and reading back.`);
}

// --- Slugs ---------------------------------------------------------------------

assert.equal(slugFor("Half-halts that land"), "half-halts-that-land");
assert.equal(slugFor("Équitation : l'épaule en dedans !"), "equitation-l-epaule-en-dedans");
assert.equal(slugFor("!!!"), "lesson", "A title with nothing sluggable still gets a slug.");
const longSlug = slugFor("A very long lesson title about riding the corners of a twenty by sixty arena with purpose");
assert.ok(longSlug.length <= 72 && !longSlug.endsWith("-"), "A long title is cut on a clean boundary.");
assert.ok(/^[a-z0-9-]{2,80}$/.test(longSlug), "Slugs stay inside the database's length check.");

// --- The lesson form -------------------------------------------------------------

const lessonForm = (overrides: Record<string, string> = {}) => {
  const values: Record<string, string> = {
    title: "Half-halts that land",
    summary: "Asking for balance without losing the go.",
    category: "Dressage",
    discipline: "dressage",
    level: "",
    access: "free",
    duration: "14:30",
    coachName: "  ",
    coachTitle: "",
    position: "",
    ...overrides
  };
  return readLessonForm((name) => values[name] ?? "");
};

assert.deepEqual(lessonForm().fields, {
  title: "Half-halts that land",
  summary: "Asking for balance without losing the go.",
  category: "Dressage",
  discipline: "dressage",
  level: null,
  access: "free",
  duration_seconds: 870,
  coach_name: null,
  coach_title: null,
  position: 0
}, "Empty optional fields are stored as nothing, not as blank text.");
assert.equal(lessonForm({ duration: "" }).fields?.duration_seconds, null, "A draft may not know its length yet.");

const refusals: Array<[Record<string, string>, string]> = [
  [{ title: "A" }, "title"],
  [{ summary: "" }, "summary"],
  [{ category: "Flatwork" }, "category"],
  [{ discipline: "polo" }, "discipline"],
  [{ level: "expert" }, "level"],
  [{ access: "premium" }, "access"],
  [{ duration: "twelve" }, "duration"],
  [{ duration: "25:00:00" }, "duration"],
  [{ coachName: "x".repeat(121) }, "coachName"],
  [{ position: "-1" }, "position"],
  [{ position: "1.5" }, "position"]
];
for (const [override, field] of refusals) {
  const result = lessonForm(override);
  assert.equal(result.fields, null, `${JSON.stringify(override)} must be refused.`);
  assert.ok(result.errors[field as keyof typeof result.errors], `${JSON.stringify(override)} must point at ${field}.`);
}

// --- Chapters ----------------------------------------------------------------------

assert.deepEqual(
  readChapters(["9:40", "", "0:00"], ["When to call the vet", "", "Feeling for heat"], 725),
  { marks: [{ starts_at_seconds: 0, title: "Feeling for heat" }, { starts_at_seconds: 580, title: "When to call the vet" }], error: null },
  "Blank rows are skipped and marks come back in order."
);
assert.deepEqual(readChapters([], [], null), { marks: [], error: null }, "A lesson may have no chapters.");
assert.match(readChapters(["15:00"], ["Late"], 725).error ?? "", /^Row 1: starts at 15:00, after the lesson ends \(12:05\)/);
assert.match(readChapters(["1:00", "1:00"], ["One", "Two"], null).error ?? "", /^Row 2: another chapter already starts at 1:00/);
assert.match(readChapters(["1:00"], [""], null).error ?? "", /^Row 1: give the chapter a title/);
assert.match(readChapters(["", "soon"], ["", "Later"], null).error ?? "", /^Row 2: write when the chapter starts/);
assert.match(
  readChapters(Array.from({ length: 61 }, (_, index) => String(index)), Array.from({ length: 61 }, () => "Mark"), null).error ?? "",
  /at most 60 chapters/
);

// --- Publishing ----------------------------------------------------------------------

assert.deepEqual(publishBlockers(870, "ready"), [], "A lesson with a length and a ready video can be published.");
assert.deepEqual(publishBlockers(null, null), ["Add the lesson's length.", "Upload the video."]);
assert.deepEqual(publishBlockers(870, "processing"), ["Wait for the video to finish processing."]);
assert.deepEqual(publishBlockers(870, "failed"), ["The video failed to process. Upload it again."]);

// --- Moderation copy -------------------------------------------------------------------

assert.equal(reasonLabel("unsafe_advice"), "Unsafe advice");
assert.equal(reasonLabel("new_reason"), "new_reason", "An unknown reason is shown as stored rather than dropped.");
assert.equal(
  queueReason({ status: "hidden", open_reports: 3, reasons: ["scam", "spam"] }),
  "3 reports (Scam, Spam), hidden until you decide"
);
assert.equal(queueReason({ status: "visible", open_reports: 1, reasons: ["harassment"] }), "1 report (Harassment), still visible");
assert.equal(queueReason({ status: "hidden", open_reports: 0, reasons: [] }), "Hidden by the phrase filter");
assert.equal(restoreLabel("visible"), "Keep visible");
assert.equal(restoreLabel("hidden"), "Restore");

// --- What the admin's code may do ----------------------------------------------------------

const adminSource = join(process.cwd(), "admin", "src");
const sourceFiles = (directory: string): string[] =>
  readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
const files = sourceFiles(adminSource).map((path) => ({ path: relative(process.cwd(), path), source: readFileSync(path, "utf8") }));

// The admin acts with each staff member's own session. A service-role key
// anywhere in it would put every staff check out of reach of the database.
for (const { path, source } of files) {
  assert.ok(!/service_role|SERVICE_ROLE/i.test(source), `${path} must not use the service role.`);
  for (const [, name] of source.matchAll(/process\.env\.(\w+)/g)) {
    assert.ok(
      ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "NODE_ENV"].includes(name ?? ""),
      `${path} reads ${name}; the admin needs no secret of its own.`
    );
  }
}

// Server actions are reachable by a direct POST, not only through the pages,
// so each one checks the session itself. The sign-in steps check where the
// session stands instead; signing out needs no check.
const signInSteps = new Set(["signIn", "startEnrollment", "confirmCode", "signOut"]);
for (const { path, source } of files.filter((file) => /^["']use server["'];/m.test(file.source))) {
  const actions = [...source.matchAll(/export async function (\w+)/g)];
  assert.ok(actions.length > 0, `${path} declares server actions.`);
  for (const [index, action] of actions.entries()) {
    const name = action[1] ?? "";
    const body = source.slice(action.index, actions[index + 1]?.index ?? source.length);
    if (signInSteps.has(name)) {
      assert.ok(name === "signOut" || body.includes("staffState("), `${path}: ${name} must check where the session stands.`);
    } else {
      assert.ok(body.includes("await requireStaff()"), `${path}: ${name} must start by requiring a staff session.`);
    }
  }
}

// A layout does not guard the pages under it in the App Router -- they render
// alongside it -- so every staff page asks for itself.
for (const { path, source } of files.filter((file) => file.path.includes("(console)") && file.path.endsWith("page.tsx"))) {
  assert.ok(source.includes("await requireStaff()"), `${path} must require a staff session.`);
}

// Every database function the admin calls exists, under the name it uses.
const migrations = readdirSync(join(process.cwd(), "supabase", "migrations"))
  .map((name) => readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8"))
  .join("\n");
for (const { path, source } of files) {
  for (const [, name] of source.matchAll(/\.rpc\("(\w+)"/g)) {
    assert.ok(
      new RegExp(`create or replace function public\\.${name}\\(`).test(migrations),
      `${path} calls ${name}, which no migration creates.`
    );
  }
}

console.log("Admin rules passed.");
