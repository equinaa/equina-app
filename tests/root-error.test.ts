import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { supportEmail } from "../src/config/support-contact";
import { appVersionLine } from "../src/ui/states/app-version";
import { errorDetailLine, failedAgain, repeatWindowMs, rootErrorCopy as copy } from "../src/ui/states/root-error";

const root = process.cwd();

// --- The version line: the error screen and Account print the same one ------------------------

assert.equal(appVersionLine({ version: "1.0.0", build: "12" }), "Version 1.0.0 (12)");
assert.equal(appVersionLine({ version: "1.0.0", build: null }), "Version 1.0.0", "The web has no native build number.");
assert.equal(appVersionLine({ version: null, build: "12" }), "Build 12");
assert.equal(appVersionLine({ version: null, build: null }), "", "Nothing known: no line, never a guess.");
assert.equal(appVersionLine({ version: " 1.0.0 ", build: " " }), "Version 1.0.0");

// --- What the screen says ---------------------------------------------------------------------

assert.equal(copy.title, "Something went wrong");
assert.equal(copy.retry, "Try again");
for (const line of Object.values(copy)) {
  assert.doesNotMatch(line, /!/, "The product's voice has no exclamation marks.");
}
assert.equal(copy.body.match(/[.?]/g)?.length, 1, "One sentence.");
assert.ok(copy.repeatBody.includes(supportEmail), "A failure that repeats names where to write.");

// --- A second failure right after "Try again" is told apart from a new one --------------------

assert.equal(failedAgain(1_000, null), false, "The first failure is not a repeat.");
assert.equal(failedAgain(4_050, 4_000), true, "Failing as soon as the app restarts is the same failure.");
assert.equal(failedAgain(4_000 + repeatWindowMs - 1, 4_000), true);
assert.equal(failedAgain(4_000 + repeatWindowMs, 4_000), false, "After the app ran for a while it is a new failure.");

// --- One readable line about the error, whatever was thrown -----------------------------------

assert.equal(
  errorDetailLine(new TypeError("Cannot read property 'name' of undefined")),
  "TypeError: Cannot read property 'name' of undefined"
);
assert.equal(errorDetailLine(new Error("first line\n    at Home (index.bundle:1:1)")), "Error: first line", "No stack.");
assert.equal(errorDetailLine(new Error("")), "Error");
assert.equal(errorDetailLine("thrown as text"), "thrown as text");
for (const thrown of [null, undefined, 42, {}, Symbol("x")]) assert.equal(errorDetailLine(thrown), "");
const long = errorDetailLine(new Error("x".repeat(500)));
assert.equal(long.length, 160);
assert.ok(long.endsWith("..."));
const hostile = new Error("x");
Object.defineProperty(hostile, "message", { get() { throw new Error("no message for you"); } });
assert.equal(errorDetailLine(hostile), "", "Describing the error must never throw on the error screen.");

// --- How the boundary is built -----------------------------------------------------------------

const boundary = readFileSync(join(root, "src", "ui", "states", "RootErrorBoundary.tsx"), "utf8");
assert.match(boundary, /static getDerivedStateFromError\(/);
// The screen shown when something broke depends on nothing that may have broken.
assert.deepEqual(
  [...boundary.matchAll(/^import .* from "([^"]+)";$/gm)].map(([, source]) => source),
  ["react", "react-native", "../theme/theme", "./installed-version", "./root-error"]
);
// An error that repeats must not loop: only the button clears the failure.
assert.doesNotMatch(boundary, /setTimeout|setInterval|componentDidUpdate|componentDidMount|useEffect/,
  "Nothing on the error screen may retry by itself.");
assert.equal(boundary.match(/failure: null/g)?.length, 2, "Cleared in the initial state and by Try again, nowhere else.");

// It wraps everything App renders, the safe-area provider included.
const app = readFileSync(join(root, "src", "App.tsx"), "utf8");
assert.match(app, /export default function App\(\) \{\n  return \(\n    <RootErrorBoundary>\n/);

// The version comes from two packages the app does not list itself. Both ship
// in every build because Expo's own packages need them; if that ever stops
// being true this fails here rather than in a store build.
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { dependencies: Record<string, string> };
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
  packages: Record<string, { dependencies?: Record<string, string> }>;
};
const installedVersion = readFileSync(join(root, "src", "ui", "states", "installed-version.ts"), "utf8");
const required = [...installedVersion.matchAll(/require\("([^"]+)"\)/g)].map(([, name]) => name ?? "");
assert.deepEqual(required, ["expo-application", "expo-constants"]);
for (const name of required) {
  assert.ok(lock.packages[`node_modules/${name}`], `${name} is installed at the top level.`);
  assert.ok(
    Object.keys(packageJson.dependencies).some((direct) => lock.packages[`node_modules/${direct}`]?.dependencies?.[name]),
    `A package the app depends on must bring ${name}.`
  );
}

console.log("Root error screen passed.");
