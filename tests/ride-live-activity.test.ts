import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { restoreRun } from "../src/features/ride/active-ride";
import {
  defaultRidePhases,
  pauseRun,
  readyRun,
  resumeRun,
  rideTrainingTypeById,
  skipPhase,
  startRun,
  syncRun,
  type RidePlan,
  type RideRun
} from "../src/features/ride/ride-plan";
import {
  isRideActivityLink,
  rideActivityAttributes,
  rideActivityContent,
  rideActivityId,
  rideActivityLink
} from "../src/features/ride/ride-live-activity";

// The ride on the iPhone lock screen and in the Dynamic Island (2026-11-28).
// No Equina code runs while the phone is locked, so what the activity is
// given has to stay true by itself: clock times on the ride clock's frame,
// and a stale date at the current phase's planned end.

const minute = 60_000;
const t0 = 1_800_000_000_000;
const jumping = rideTrainingTypeById("jumping");
assert.ok(jumping);
const phases = defaultRidePhases(jumping); // Pre warm-up 10, Warm-up 7, Training 20, Cool-down 15 = 52 minutes
const plan: RidePlan = { horseId: "horse-1", horseName: " Daimon ", trainingType: jumping, phases };
const started = startRun(readyRun(), t0);
const at = (...minutes: number[]) => minutes.map((value) => t0 + value * minute);

// --- What the activity is for ---------------------------------------------------------

{
  assert.equal(rideActivityId(readyRun()), null, "A ride not started has no activity.");
  assert.equal(rideActivityAttributes(plan, readyRun()), null);
  assert.equal(rideActivityId(started), String(t0), "The ride's start names its activity, kept on the phone with the ride.");
  assert.deepEqual(rideActivityAttributes(plan, started), {
    rideId: String(t0),
    horseName: "Daimon",
    training: "Jumping",
    phases: [
      { title: "Pre warm-up", detail: "Walk", minutes: 10 },
      { title: "Warm-up", detail: "Trot", minutes: 7 },
      { title: "Training", detail: "Jumping", minutes: 20 },
      { title: "Cool-down", detail: "Trot & walk", minutes: 15 }
    ]
  });
  // A plan brought back from the phone is not rounded; the widget reads whole minutes.
  const odd = rideActivityAttributes({ ...plan, phases: [{ ...phases[0]!, minutes: 7.6 }] }, started);
  assert.equal(odd?.phases[0]?.minutes, 8);

  // ActivityKit allows 4 KB for the attributes and the state together.
  const longest: RidePlan = {
    ...plan,
    horseName: "H".repeat(40),
    phases: Array.from({ length: 8 }, (_, index) => ({ id: `p${index}`, title: "T".repeat(40), detail: "D".repeat(40), minutes: 90 }))
  };
  const size = JSON.stringify(rideActivityAttributes(longest, started)).length + JSON.stringify(rideActivityContent(longest, started, t0).state).length;
  assert.ok(size < 4096, `The largest plan fits ActivityKit's 4 KB (${size} bytes).`);
}

// --- Running: clock times that hold until a tap -----------------------------------------

{
  const content = rideActivityContent(plan, started, t0 + 2 * minute);
  assert.deepEqual(content.state, {
    phaseIndex: 0,
    clockRunning: true,
    phasesDone: false,
    clockStartMs: t0,
    elapsedMs: 0,
    phaseStartMs: at(0, 10, 17, 37),
    endMs: t0 + 52 * minute
  });
  assert.equal(content.staleDateMs, t0 + 10 * minute, "Exact until the pre warm-up's planned end.");
  assert.deepEqual(
    rideActivityContent(plan, started, t0 + 9 * minute),
    content,
    "The same all through a phase: nothing is sent while the clock simply runs."
  );

  // The run handed over is behind the clock (the ride screen is on another
  // tab): the activity is for where the clock has the ride.
  const later = rideActivityContent(plan, started, t0 + 12 * minute);
  assert.equal(later.state.phaseIndex, 1);
  assert.deepEqual(later.state.phaseStartMs, at(0, 10, 17, 37), "A phase begun by the clock begins at its planned time.");
  assert.equal(later.staleDateMs, t0 + 17 * minute);
}

// --- Pauses ------------------------------------------------------------------------------

{
  const paused = pauseRun(started, t0 + 5 * minute);
  const content = rideActivityContent(plan, paused, t0 + 6 * minute);
  assert.equal(content.state.clockRunning, false);
  assert.equal(content.state.elapsedMs, 5 * minute, "Paused, the clock is shown still.");
  assert.equal(content.staleDateMs, null, "Nothing moves while paused, so nothing goes stale.");
  assert.equal(content.state.clockStartMs, t0, "Placed as if resumed where it stopped.");
  assert.deepEqual(
    rideActivityContent(plan, paused, t0 + 40 * minute),
    content,
    "The same however long the break: one update at the pause, none during it."
  );

  // Ten minutes off: everything ahead moves ten minutes later.
  const resumed = resumeRun(paused, t0 + 15 * minute);
  const after = rideActivityContent(plan, resumed, t0 + 16 * minute);
  assert.equal(after.state.clockRunning, true);
  assert.equal(after.state.elapsedMs, 0);
  assert.equal(after.state.clockStartMs, t0 + 10 * minute, "The ride clock reads 6:00 at 16 minutes past.");
  assert.deepEqual(after.state.phaseStartMs, at(10, 20, 27, 47));
  assert.equal(after.state.endMs, t0 + 62 * minute, "Ends ten minutes later than planned.");
  assert.equal(after.staleDateMs, t0 + 20 * minute);

  // A pause in a later phase: the phases ridden keep their place on the bar,
  // the ones ahead move.
  // The ride screen pauses the run it keeps moved on with the clock.
  const inTraining = pauseRun(syncRun(started, phases, t0 + 20 * minute).run, t0 + 20 * minute); // Training began at 17
  const back = resumeRun(inTraining, t0 + 25 * minute);
  const now = rideActivityContent(plan, back, t0 + 26 * minute);
  assert.equal(now.state.phaseIndex, 2);
  assert.equal(now.state.clockStartMs, t0 + 5 * minute);
  assert.deepEqual(now.state.phaseStartMs, at(5, 15, 22, 42));
  assert.equal(now.staleDateMs, t0 + 42 * minute, "Training ends 20 minutes after it began, the break left out.");
  // Paused in the middle of the training: what is left of it is fixed.
  const held = rideActivityContent(plan, inTraining, t0 + 21 * minute).state;
  const phaseEnd = held.phaseStartMs[held.phaseIndex + 1]!;
  assert.equal(phaseEnd - held.clockStartMs - held.elapsedMs, 17 * minute, "17 minutes of training left, shown still.");
}

// --- Skips ---------------------------------------------------------------------------------

{
  const skipped = skipPhase(started, phases, t0 + 3 * minute); // Warm-up from 3 minutes
  const content = rideActivityContent(plan, skipped, t0 + 4 * minute);
  assert.equal(content.state.phaseIndex, 1);
  assert.deepEqual(content.state.phaseStartMs, at(0, 3, 10, 30), "Everything ahead comes seven minutes sooner.");
  assert.equal(content.state.endMs, t0 + 45 * minute);
  assert.equal(content.staleDateMs, t0 + 10 * minute);
}

// --- Done ------------------------------------------------------------------------------------

{
  // By the clock: the cool-down ran out and the rider has not finished yet.
  const content = rideActivityContent(plan, started, t0 + 60 * minute);
  assert.equal(content.state.phasesDone, true);
  assert.equal(content.state.phaseIndex, 3);
  assert.equal(content.state.clockRunning, true, "The clock keeps counting until Finish.");
  assert.equal(content.staleDateMs, null);

  // By a skip past the last phase.
  let run: RideRun = started;
  for (let skips = 0; skips < phases.length; skips += 1) run = skipPhase(run, phases, t0 + (skips + 1) * minute);
  const skippedDone = rideActivityContent(plan, run, t0 + 5 * minute);
  assert.equal(skippedDone.state.phasesDone, true);
  assert.equal(skippedDone.staleDateMs, null);

  // A ride brought back the next morning: stopped at its planned end.
  const restored = restoreRun(started, phases, t0 + 10 * 60 * minute);
  const morning = rideActivityContent(plan, restored, t0 + 10 * 60 * minute);
  assert.equal(morning.state.phasesDone, true);
  assert.equal(morning.state.clockRunning, false);
  assert.equal(morning.state.elapsedMs, 52 * minute);
  assert.equal(morning.state.clockStartMs, t0, "The clock stopped where the plan ran out.");
  assert.equal(morning.staleDateMs, null);
}

// --- A run kept by an app from before the timeline ------------------------------------

{
  const { marks: _dropped, ...noMarks } = pauseRun(started, t0 + 5 * minute);
  const first = rideActivityContent(plan, noMarks, t0 + 6 * minute);
  assert.equal(first.state.elapsedMs, 5 * minute);
  assert.deepEqual(rideActivityContent(plan, noMarks, t0 + 30 * minute), first, "No marks, and still the same from one look to the next.");
  const { marks: _gone, ...running } = started;
  assert.deepEqual(rideActivityContent(plan, running, t0 + 2 * minute).state.phaseStartMs, at(0, 10, 17, 37));
}

// --- The link the activity opens ---------------------------------------------------------

{
  assert.equal(rideActivityLink, "equina://ride");
  for (const url of ["equina://ride", "equina://ride/", "EQUINA://ride?from=island", " equina://ride "]) {
    assert.equal(isRideActivityLink(url), true, url);
  }
  for (const url of ["equina://rides", "equina://ride/123/edit", "https://equina.ai/ride", "exp+equina://ride", "", null, undefined]) {
    assert.equal(isRideActivityLink(url), false, String(url));
  }
}

// --- The native side, read as source ------------------------------------------------------

{
  const root = process.cwd();
  const read = (path: string) => readFileSync(join(root, path), "utf8");
  const sourceFiles = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(name) ? [path] : [];
    });

  // ActivityKit finds the type by its name: the app and the extension each
  // compile a copy, and the two are the same file.
  const appCopy = read("modules/ride-activity/ios/RideActivityAttributes.swift");
  const extensionCopy = read("targets/ride-activity/RideActivityAttributes.swift");
  assert.equal(appCopy, extensionCopy, "The attributes are identical in the app and the extension.");
  assert.match(appCopy, /struct RideActivityAttributes: ActivityAttributes \{/);

  // The Swift fields are the ones the app sends, by the same names.
  const block = (name: string) => {
    const start = appCopy.indexOf(`struct ${name}: Codable, Hashable {`);
    assert.ok(start >= 0, `${name} is in the Swift attributes.`);
    return appCopy.slice(start, appCopy.indexOf("\n  }", start));
  };
  const fields = (source: string) => [...source.matchAll(/^\s+var (\w+): /gm)].map((match) => match[1]).sort();
  const state = rideActivityContent(plan, started, t0).state;
  assert.deepEqual(fields(block("ContentState")), Object.keys(state).sort(), "The content state, field for field.");
  const attributes = rideActivityAttributes(plan, started)!;
  const topLevel = appCopy.slice(appCopy.lastIndexOf("\n  }\n"));
  assert.deepEqual(fields(topLevel), Object.keys(attributes).sort(), "The attributes, field for field.");
  assert.deepEqual(fields(block("Phase")), Object.keys(attributes.phases[0]!).sort());

  // The module: one name for JS and Swift, every call behind iOS 16.2, and an
  // end that leaves nothing on the lock screen.
  const module = read("modules/ride-activity/ios/RideActivityModule.swift");
  assert.match(module, /Name\("RideActivity"\)/);
  for (const call of ["isSupported", "start", "update", "end", "list", "endAll"]) {
    assert.match(module, new RegExp(`Function\\("${call}"\\)`), `The module has ${call}.`);
  }
  assert.equal((module.match(/#available\(iOS 16\.2, \*\)/g) ?? []).length, 6, "Every call checks for iOS 16.2 first.");
  assert.match(module, /ActivityAuthorizationInfo\(\)\.areActivitiesEnabled/);
  assert.match(module, /pushType: nil/, "No push in this version.");
  assert.doesNotMatch(module, /dismissalPolicy: \.(default|after)/);
  assert.equal((module.match(/dismissalPolicy: \.immediate/g) ?? []).length, 2, "Finish, discard and sign-out end it at once.");
  const podspec = read("modules/ride-activity/ios/EquinaRideActivity.podspec");
  assert.match(podspec, /s\.platforms\s+= \{ :ios => '15\.1' \}/, "The app's own minimum: iOS 15 phones still install it.");
  assert.match(podspec, /s\.weak_frameworks = 'ActivityKit'/, "Weakly linked, so iOS 15 still opens the app.");
  assert.doesNotMatch(podspec, /s\.name\s+= 'RideActivity'/, "The extension's product is RideActivity: a module of that name would clash with it.");
  assert.deepEqual(JSON.parse(read("modules/ride-activity/expo-module.config.json")), { platforms: ["apple"], apple: { modules: ["RideActivityModule"] } });
  // EAS uploads only what git keeps. An unanchored ios/ would ignore the
  // module's own ios folder too: the build would have no module, and the
  // guard below would quietly show nothing.
  const ignored = read(".gitignore").split("\n").map((line) => line.trim());
  assert.ok(ignored.includes("/ios/") && ignored.includes("/android/"), "Only the generated root folders are ignored.");
  assert.ok(!ignored.includes("ios/") && !ignored.includes("android/"));
  assert.ok(ignored.includes("targets/*/Assets.xcassets/"), "The colour sets apple-targets writes at prebuild are not committed.");

  // The extension.
  const target = JSON.parse(read("targets/ride-activity/expo-target.config.json")) as Record<string, unknown>;
  assert.equal(target.type, "widget");
  assert.equal(target.name, "RideActivity");
  assert.equal(target.bundleIdentifier, ".RideActivity", "App ID com.equina.mobile.RideActivity.");
  assert.equal(target.deploymentTarget, "16.2", "The stale date needs 16.2; the plugin's default would be 18.0.");
  assert.match(read("targets/ride-activity/Info.plist"), /<string>com\.apple\.widgetkit-extension<\/string>/);
  const widget = read("targets/ride-activity/RideActivityWidget.swift");
  assert.match(widget, new RegExp(`URL\\(string: "${rideActivityLink}"\\)`), "The widget opens the link the app listens for.");
  assert.equal((widget.match(/\.widgetURL\(rideURL\)/g) ?? []).length, 2, "Lock screen and Dynamic Island.");
  assert.match(widget, /stale: context\.isStale/);
  assert.match(widget, /Text\(timerInterval: ride\.clockRange, countsDown: false\)/, "The ride clock counts up by itself.");
  assert.match(widget, /Text\(timerInterval: ride\.phaseRange, countsDown: true\)/, "The phase counts down by itself.");
  assert.match(widget, /ProgressView\(timerInterval: ride\.rideRange, countsDown: false/, "The whole-ride bar fills by itself.");
  assert.match(widget, /compactLeading: \{[\s\S]+compactTrailing: \{[\s\S]+minimal: \{/);
  assert.match(widget, /Text\("All phases done"\)/);
  assert.match(widget, /Text\("Paused · /);
  assert.match(widget, /Text\("ends "\) \+ Text\(ride\.end, style: \.time\)/, "Once stale, the timetable ends with the planned end.");
  // Equina's colours: the raised dark warm ground, ivory and brass (src/ui/theme/theme.ts).
  const theme = read("src/ui/theme/theme.ts");
  for (const [name, hex] of [["ground", "171511"], ["ivory", "F7F3EA"], ["brass", "C4A05A"]] as const) {
    assert.ok(theme.includes(`#${hex}`), `#${hex} is the app's own.`);
    const [r, g, b] = [hex.slice(0, 2), hex.slice(2, 4), hex.slice(4, 6)];
    assert.match(widget, new RegExp(`static let ${name} = Color\\(red: 0x${r} / 255, green: 0x${g} / 255, blue: 0x${b} / 255\\)`));
  }
  for (const copy of widget.matchAll(/Text\("([^"\\]+)/g)) {
    assert.doesNotMatch(copy[1]!, /!/, "No exclamation marks.");
  }

  // The JS side: a build without the module never crashes, and does nothing.
  const native = read("src/features/ride/ride-activity-native.ts");
  assert.match(native, /requireOptionalNativeModule<NativeRideActivity>\("RideActivity"\)/, "Asked of Expo, so a missing module is null.");
  assert.match(native, /if \(Platform\.OS !== "ios"\) return \(loaded = null\);/, "Web and Android never look.");
  assert.doesNotMatch(native, /\brequire\(|requireNativeModule\(/, "Never required: Metro reports a failed require as fatal.");
  assert.match(native, /if \(!module\) return Promise\.resolve\(fallback\);/, "Without it, every call resolves to nothing.");
  assert.match(native, /\.catch\(\(\) => fallback\)/, "A native failure is never thrown at the ride.");
  assert.match(native, /for \(const activity of await module\.list\(\)\) \{\s+if \(activity\.rideId === attributes\.rideId && id === null\) id = activity\.id;\s+else await module\.end\(activity\.id\);/, "After a relaunch the ride's own activity is taken back and any other ended.");
  // Only that file reaches the native module.
  const reachers = sourceFiles(join(root, "src")).filter((path) => /"RideActivity"/.test(read(path.slice(root.length + 1))));
  assert.deepEqual(reachers, [join(root, "src/features/ride/ride-activity-native.ts")]);

  // The hook: driven by the ride's clock, ended with the ride.
  const hook = read("src/features/ride/useRideLiveActivity.ts");
  assert.match(hook, /rideActivityContent\(ridePlan, rideRun, now\)/);
  assert.match(hook, /return \(\) => \{\s+shown\.current = null;\s+sent\.current = "";\s+void endRideActivities\(\);\s+\};\s+\}, \[rideId\]\);/, "Ended once, when the ride ends.");
  assert.match(hook, /setTimeout\(\(\) => setLook\(\(count\) => count \+ 1\), Math\.max\(0, content\.staleDateMs - now\) \+ 100\)/, "Wakes at the next phase while the app is open.");
  assert.match(hook, /if \(state === "active"\) setLook/, "Shown at once when the app comes back to the front.");
  assert.match(hook, /\}, \[rideId, ridePlan, rideRun, look\]\);/);
  assert.doesNotMatch(hook, /cancelRideAlerts|cancelStaleRideAlerts|scheduleRideAlerts/, "The phase notifications stay: they are a locked phone's only sound.");

  // App.tsx: owned for the ride's life, ended wherever the ride's alerts are
  // dropped as orphans, and the link brings the ride to the front.
  const app = read("src/App.tsx");
  assert.match(app, /useRideCues\(rideActive, ridePlan, rideRun\);\s+\/\/[^\n]*\n\s+\/\/[^\n]*\n\s+useRideLiveActivity\(rideActive, ridePlan, rideRun\);/);
  const orphanedAlerts = (app.match(/void cancelStaleRideAlerts\(\);/g) ?? []).length;
  assert.ok(orphanedAlerts >= 3);
  assert.equal(
    (app.match(/void cancelStaleRideAlerts\(\);\s+void endRideActivities\(\);/g) ?? []).length,
    orphanedAlerts,
    "Every place an earlier ride's alerts are dropped ends its Live Activity too."
  );
  assert.match(app, /Linking\.addEventListener\("url", \(\{ url \}\) => open\(url\)\)/);
  assert.match(app, /void Linking\.getInitialURL\(\)\.then\(open, \(\) => undefined\);/);
  assert.match(app, /if \(isRideActivityLink\(url\)\) openRideLinkRef\.current\(\);/);
  assert.match(app, /openRideLinkRef\.current = \(\) => \{\s+if \(!rideActiveRef\.current\) return;\s+closeRalf\(\);\s+setTab\("home"\);\s+\};/, "Mid-ride, the ride screen comes to the front.");
}

console.log("Ride live activity passed.");
