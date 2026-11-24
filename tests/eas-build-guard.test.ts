import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { readBackendConfig } from "../src/backend/config";
import { revenueCatApiKey } from "../src/features/plans/purchase-catalog";
import { isStoreBuild, reviewedSwitches, setTwice, storeBuildProblems } from "../scripts/store-build-rules.mjs";

// The guard EAS runs before a build (package.json, "eas-build-pre-install"):
// a store build never ships without a backend, with the wrong sign-in mode,
// with a development-only key, or with a switch other than the reviewed ones.

const root = process.cwd();
const easJson: unknown = JSON.parse(readFileSync(join(root, "eas.json"), "utf8"));
const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: Record<string, string> };

// Shaped like the real values, and worth nothing.
const projectUrl = "https://store-build-test.supabase.co";
const publishableKey = `sb_publishable_${"t".repeat(24)}`;
const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const jwtKey = (role: string) => `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ iss: "supabase", role })}.${"s".repeat(43)}`;
const secretKey = ["sb", "secret", "x".repeat(24)].join("_");
const testStoreKey = `test_${"k".repeat(24)}`;

type Env = Record<string, string | undefined>;

/** One rule at a time: a build that passes, with nothing from eas.json to compare. */
const problemsWith = (overrides: Env, profile: string | undefined = "production") =>
  storeBuildProblems({
    profile,
    env: {
      EXPO_PUBLIC_SUPABASE_URL: projectUrl,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
      EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE: "otp",
      ...overrides
    }
  });
const about = (problems: string[], name: string) => problems.filter((problem) => problem.startsWith(`${name} `));

// Which builds are checked: all but the development client.
{
  assert.equal(isStoreBuild("development"), false);
  for (const profile of ["preview", "production", "base", "anything-new", "", undefined]) {
    assert.equal(isStoreBuild(profile), true, "Only the development client is let through.");
  }
  assert.deepEqual(storeBuildProblems({ profile: "development", env: {} }), [], "A development client reads .env.local through Metro.");
  for (const profile of ["preview", "production", undefined]) {
    assert.ok(storeBuildProblems({ profile, env: {} }).length > 0, "A store build with nothing set is stopped.");
  }
  assert.deepEqual(problemsWith({}), [], "A backend and the code sign-in are enough to pass the rules themselves.");
}

// The switches committed in eas.json pass, on both store profiles and both platforms.
for (const profile of ["preview", "production"]) {
  for (const platform of ["ios", "android"]) {
    const switches = reviewedSwitches(easJson, profile, platform);
    assert.ok(Object.keys(switches).length > 0, `eas.json gives "${profile}" its switches.`);
    assert.deepEqual(
      storeBuildProblems({
        profile,
        env: { ...switches, EXPO_PUBLIC_SUPABASE_URL: projectUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey },
        switches
      }),
      [],
      `The "${profile}" build for ${platform} passes once the two EAS variables are set.`
    );
    assert.equal(
      about(storeBuildProblems({ profile, env: { ...switches }, switches }), "EXPO_PUBLIC_SUPABASE_URL").length,
      1,
      "Without the EAS variables the same build is stopped."
    );
  }
}

// No backend, no build.
{
  for (const url of [undefined, "", "   "]) {
    const problems = problemsWith({ EXPO_PUBLIC_SUPABASE_URL: url });
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /^EXPO_PUBLIC_SUPABASE_URL is not set\./);
  }
  for (const url of ["http://store-build-test.supabase.co", "store-build-test.supabase.co", "localhost:54321"]) {
    assert.match(problemsWith({ EXPO_PUBLIC_SUPABASE_URL: url })[0] ?? "", /^EXPO_PUBLIC_SUPABASE_URL is not an https address\./);
  }
  for (const key of [undefined, "", "  "]) {
    const problems = problemsWith({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set\./);
  }
  assert.deepEqual(
    problemsWith({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwtKey("anon") }),
    [],
    "The app still accepts the key under its old name."
  );

  // The guard and the app agree on what "a backend" is, name by name.
  const names = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "EXPO_PUBLIC_SUPABASE_ANON_KEY"] as const;
  const before = names.map((name) => process.env[name]);
  const put = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  try {
    for (const url of [undefined, "", "  ", projectUrl, `${projectUrl}/`]) {
      for (const publishable of [undefined, "", " ", publishableKey]) {
        for (const anon of [undefined, "", jwtKey("anon")]) {
          put(names[0], url);
          put(names[1], publishable);
          put(names[2], anon);
          const guardSeesBackend = !problemsWith({
            EXPO_PUBLIC_SUPABASE_URL: url,
            EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishable,
            EXPO_PUBLIC_SUPABASE_ANON_KEY: anon
          }).some((problem) => problem.includes("is not set"));
          assert.equal(
            guardSeesBackend,
            readBackendConfig() !== null,
            "The guard reads the backend settings exactly as the app does."
          );
        }
      }
    }
  } finally {
    names.forEach((name, index) => put(name, before[index]));
  }
}

// A key that opens the whole database never goes into an app.
{
  for (const key of [secretKey, jwtKey("service_role")]) {
    const problems = problemsWith({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key });
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY holds a secret key\./);
  }
  assert.match(
    problemsWith({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: undefined, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwtKey("service_role") })[0] ?? "",
    /^EXPO_PUBLIC_SUPABASE_ANON_KEY holds a secret key\./
  );
  assert.deepEqual(problemsWith({ EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwtKey("anon") }), [], "A publishable JWT key is fine.");
}

// Sign-in by emailed code, compared as the app compares it.
{
  for (const mode of [undefined, "", "magic-link", "OTP", " otp"]) {
    const problems = problemsWith({ EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE: mode });
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /^EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE is not "otp"\./);
  }
  assert.match(
    readFileSync(join(root, "src", "features", "account", "social-auth.ts"), "utf8"),
    /process\.env\.EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE === "otp" \? "otp" : "magic-link"/,
    "The app turns anything but the exact value into link mode, so the guard accepts nothing else."
  );
}

// The demo, a Test Store key and the placeholder privacy link stay in development.
{
  for (const demo of ["true", "TRUE", " true "]) {
    assert.match(problemsWith({ EXPO_PUBLIC_EQUINA_DEMO_MODE: demo })[0] ?? "", /^EXPO_PUBLIC_EQUINA_DEMO_MODE is on\./);
  }
  for (const demo of [undefined, "", "false"]) {
    assert.deepEqual(problemsWith({ EXPO_PUBLIC_EQUINA_DEMO_MODE: demo }), []);
  }

  for (const name of ["EXPO_PUBLIC_REVENUECAT_IOS_API_KEY", "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY"]) {
    const problems = problemsWith({ [name]: testStoreKey });
    assert.equal(problems.length, 1);
    assert.ok(problems[0]!.startsWith(`${name} is a RevenueCat Test Store key`));
    for (const key of [undefined, "", `appl_${"k".repeat(24)}`, `goog_${"k".repeat(24)}`]) {
      assert.deepEqual(problemsWith({ [name]: key }), [], "A store key, or none, is fine.");
    }
  }
  assert.equal(
    revenueCatApiKey({ platform: "ios", iosKey: testStoreKey, androidKey: undefined, isDev: false }),
    null,
    "The app itself treats a Test Store key as no key outside development."
  );

  for (const link of [
    "https://equina-ten.vercel.app",
    "https://equina-ten.vercel.app/privacy",
    "http://equina-ten.vercel.app/",
    "HTTPS://EQUINA-TEN.VERCEL.APP/Privacy",
    "  https://equina-ten.vercel.app/legal  "
  ]) {
    const problems = problemsWith({ EXPO_PUBLIC_PRIVACY_POLICY_URL: link });
    assert.equal(problems.length, 1);
    assert.match(problems[0]!, /^EXPO_PUBLIC_PRIVACY_POLICY_URL points at the web app/);
  }
  for (const link of [undefined, "", "https://example.com/privacy", "https://equina-ten.vercel.app.example.com/", "equina-ten.vercel.app/privacy"]) {
    assert.deepEqual(problemsWith({ EXPO_PUBLIC_PRIVACY_POLICY_URL: link }), [], "Only an http(s) link on the web app's own host is refused.");
  }
}

// The switches reviewed in git are the ones the build gets.
{
  const switches = reviewedSwitches(easJson, "production", "ios");
  const reviewed: Env = { ...switches, EXPO_PUBLIC_SUPABASE_URL: projectUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey };

  assert.deepEqual(storeBuildProblems({ profile: "production", env: reviewed, switches }), []);

  const turnedOn = storeBuildProblems({
    profile: "production",
    env: { ...reviewed, EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS: "true", EXPO_PUBLIC_ENABLE_APPLE_AUTH: "true" },
    switches
  });
  assert.equal(turnedOn.length, 1, "Switches that changed share one line.");
  assert.match(
    turnedOn[0]!,
    /^Not the value eas\.json gives them: EXPO_PUBLIC_ENABLE_APPLE_AUTH, EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS\. An EAS environment variable/
  );

  const gone = storeBuildProblems({ profile: "production", env: { ...reviewed, EXPO_PUBLIC_ENABLE_CLUB_PUBLISHING: undefined }, switches });
  assert.deepEqual(gone, ["Missing, although eas.json gives them to this profile: EXPO_PUBLIC_ENABLE_CLUB_PUBLISHING."]);

  const linkMode = storeBuildProblems({ profile: "production", env: { ...reviewed, EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE: "magic-link" }, switches });
  assert.equal(linkMode.length, 1, "One line for a variable, even when two rules catch it.");
  assert.equal(about(linkMode, "EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE").length, 1);

  // A name is set in one place only: eas.json, or an EAS variable.
  assert.deepEqual(setTwice({ EXPO_PUBLIC_SUPABASE_URL: projectUrl }, switches), []);
  assert.deepEqual(
    setTwice({ EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS: "false", EXPO_PUBLIC_SUPABASE_URL: projectUrl }, switches),
    ["EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS"],
    "Even with the same value: the next change in eas.json would not take."
  );
}

// Names, never values: these lines end up in a build log.
{
  const switches = reviewedSwitches(easJson, "production", "ios");
  const values = {
    EXPO_PUBLIC_SUPABASE_URL: "http://plain-address.example.test",
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secretKey,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: testStoreKey,
    EXPO_PUBLIC_PRIVACY_POLICY_URL: "https://equina-ten.vercel.app/some-private-path"
  };
  const problems = storeBuildProblems({
    profile: "production",
    env: { ...switches, ...values, EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE: "magic-link", EXPO_PUBLIC_EQUINA_DEMO_MODE: "true" },
    switches
  });
  assert.equal(problems.length, 6);
  for (const problem of problems) assert.match(problem, /^EXPO_PUBLIC_[A-Z0-9_]+ /, "Each of these lines starts with the variable at fault.");
  for (const value of Object.values(values)) {
    assert.ok(!problems.join("\n").includes(value), "No line repeats a value.");
  }

  const odd = "a-value-nobody-reviewed";
  const changed = storeBuildProblems({
    profile: "production",
    env: { ...switches, EXPO_PUBLIC_SUPABASE_URL: projectUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey, EXPO_PUBLIC_ENABLE_COACH_CHAT: odd },
    switches
  });
  assert.equal(changed.length, 1);
  assert.ok(changed[0]!.includes("EXPO_PUBLIC_ENABLE_COACH_CHAT") && !changed[0]!.includes(odd), "A changed switch is named, not quoted.");
}

// eas.json is resolved the way EAS CLI resolves it.
{
  const build = (easJson as { build: Record<string, { env?: Record<string, string> }> }).build;
  for (const profile of ["preview", "production"]) {
    for (const platform of ["ios", "android", undefined]) {
      assert.deepEqual(reviewedSwitches(easJson, profile, platform), build[profile]?.env);
    }
  }
  for (const profile of ["development", "base", "missing", undefined]) {
    assert.deepEqual(reviewedSwitches(easJson, profile, "ios"), {});
  }

  const layered = {
    build: {
      base: { env: { A: "base", B: "base" }, ios: { env: { C: "base ios" } } },
      middle: { extends: "base", env: { B: "middle" } },
      top: { extends: "middle", env: { D: "top" }, android: { env: { A: "top android" } } }
    }
  };
  assert.deepEqual(reviewedSwitches(layered, "top", "ios"), { A: "base", B: "middle", C: "base ios", D: "top" });
  assert.deepEqual(reviewedSwitches(layered, "top", "android"), { A: "top android", B: "middle", D: "top" });
  assert.deepEqual(reviewedSwitches(layered, "top"), { A: "base", B: "middle", D: "top" });
  assert.deepEqual(
    Object.keys(reviewedSwitches({ build: { a: { extends: "b", env: { X: "a" } }, b: { extends: "a", env: { X: "b" } } } }, "a", "ios")),
    ["X"],
    "A cycle of extends ends instead of hanging the build."
  );
  for (const broken of [null, undefined, {}, { build: null }, "eas.json"]) {
    assert.deepEqual(reviewedSwitches(broken, "production", "ios"), {});
  }
}

// The hook is wired, and the guard runs before npm install: nothing to import but Node.
{
  assert.equal(packageJson.scripts["eas-build-pre-install"], "node scripts/eas-build-guard.mjs");
  for (const file of ["eas-build-guard.mjs", "store-build-rules.mjs"]) {
    const source = readFileSync(join(root, "scripts", file), "utf8");
    const imports = [...source.matchAll(/\bfrom "([^"]+)";/g)].map((match) => match[1]!);
    for (const specifier of imports) {
      assert.match(specifier, /^(node:|\.\/)/, `${file} imports ${specifier}, which does not exist before npm install.`);
    }
    assert.doesNotMatch(source, /\brequire\(|\bimport\(/, `${file} loads nothing else on the side.`);
  }
}

// The command itself, as EAS runs it.
{
  const switches = reviewedSwitches(easJson, "production", "ios");
  const run = (env: Record<string, string>, args: string[] = []) => {
    // Only what the scenario sets: nothing from this shell or its .env files.
    const result = spawnSync(process.execPath, ["scripts/eas-build-guard.mjs", ...args], {
      cwd: root,
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env },
      encoding: "utf8"
    });
    return { status: result.status, output: `${result.stdout}${result.stderr}`, errors: result.stderr };
  };

  const outside = run({ EXPO_PUBLIC_EQUINA_DEMO_MODE: "true" });
  assert.equal(outside.status, 0, "Outside EAS it checks nothing and fails nothing.");
  assert.match(outside.output, /not an EAS build/);

  const development = run({ EAS_BUILD: "true", EAS_BUILD_PROFILE: "development", EAS_BUILD_PLATFORM: "ios" });
  assert.equal(development.status, 0, "A development client build goes through.");

  const empty = run({ EAS_BUILD: "true", EAS_BUILD_PROFILE: "production", EAS_BUILD_PLATFORM: "ios" });
  assert.equal(empty.status, 1, "A production build with nothing set fails the EAS build.");
  assert.match(empty.errors, /the "production" build was stopped/);
  assert.match(empty.errors, /EXPO_PUBLIC_SUPABASE_URL is not set/);
  assert.match(empty.errors, /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not set/);
  assert.match(empty.errors, /EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE is not "otp"/);
  assert.match(empty.errors, /Missing, although eas\.json gives them to this profile: EXPO_PUBLIC_ENABLE_ACCOUNT_SETTINGS, /);

  const unnamed = run({ EAS_BUILD: "true" });
  assert.equal(unnamed.status, 1, "A build that does not say which profile it is counts as a store build.");

  for (const [profile, platform] of [["production", "ios"], ["production", "android"], ["preview", "ios"], ["preview", "android"]] as const) {
    const ready = run({
      EAS_BUILD: "true",
      EAS_BUILD_PROFILE: profile,
      EAS_BUILD_PLATFORM: platform,
      ...switches,
      EXPO_PUBLIC_SUPABASE_URL: projectUrl,
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey
    });
    assert.equal(ready.status, 0, `A complete "${profile}" build for ${platform} goes through.`);
    assert.match(ready.output, /has a backend/);
    assert.match(ready.output, /EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY, EXPO_PUBLIC_SUPABASE_URL\./, "The log lists the names the build sees.");
    assert.ok(!ready.output.includes(projectUrl) && !ready.output.includes(publishableKey), "And none of their values.");
  }

  const overridden = run({
    EAS_BUILD: "true",
    EAS_BUILD_PROFILE: "production",
    EAS_BUILD_PLATFORM: "android",
    ...switches,
    EXPO_PUBLIC_ENABLE_GOOGLE_AUTH: "true",
    EXPO_PUBLIC_SUPABASE_URL: projectUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: testStoreKey
  });
  assert.equal(overridden.status, 1);
  assert.match(overridden.errors, /Not the value eas\.json gives them: EXPO_PUBLIC_ENABLE_GOOGLE_AUTH\./);
  assert.match(overridden.errors, /EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY is a RevenueCat Test Store key/);
  assert.ok(!overridden.output.includes(testStoreKey) && !overridden.output.includes(publishableKey), "A failure prints no value either.");

  // A rehearsal from this computer, where `eas env:exec` supplies the EAS variables.
  const easVariables = { EXPO_PUBLIC_SUPABASE_URL: projectUrl, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey };
  for (const profile of ["preview", "production"]) {
    const rehearsed = run(easVariables, ["--rehearse", profile]);
    assert.equal(rehearsed.status, 0, `With the two EAS variables, a "${profile}" build would go through.`);
    assert.match(rehearsed.output, /has a backend/);
    assert.ok(!rehearsed.output.includes(projectUrl) && !rehearsed.output.includes(publishableKey));
  }
  const nothingOnEas = run({}, ["--rehearse", "production"]);
  assert.equal(nothingOnEas.status, 1, "Without them it says so before a build is spent.");
  assert.match(nothingOnEas.errors, /the "production" build would be stopped/);
  assert.match(nothingOnEas.errors, /EXPO_PUBLIC_SUPABASE_URL is not set/);
  assert.doesNotMatch(nothingOnEas.errors, /Missing, although/, "The switches come from eas.json in a rehearsal.");

  const inBoth = run({ ...easVariables, EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS: "true" }, ["--rehearse", "production"]);
  assert.equal(inBoth.status, 1, "A switch that is also an EAS variable is caught before the build machine picks one.");
  assert.match(inBoth.errors, /Set outside eas\.json as well as in it: EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS\./);

  const leftovers = run({ ...easVariables, EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: testStoreKey }, ["--rehearse", "preview"]);
  assert.equal(leftovers.status, 1, "What a careless env:push left on EAS is caught too.");
  assert.match(leftovers.errors, /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is a RevenueCat Test Store key/);

  assert.equal(run({}, ["--rehearse"]).status, 1, "A rehearsal names its profile.");
  assert.equal(run({}, ["--rehearse", "development"]).status, 0);
  assert.equal(
    run({ EAS_BUILD: "true", EAS_BUILD_PROFILE: "production" }, ["--rehearse", "development"]).status,
    1,
    "On EAS the profile is the one EAS is building, whatever the arguments say."
  );
}

console.log("EAS build guard passed.");
