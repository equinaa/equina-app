import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readBackendConfig } from "../src/backend/config";
import { revenueCatApiKey } from "../src/features/plans/purchase-catalog";
import {
  backendAnswer,
  isEasBuild,
  isLocalEasBuild,
  isStoreBuild,
  notSoldYet,
  reviewedSwitches,
  setTwice,
  storeBuildProblems
} from "../scripts/store-build-rules.mjs";

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

// Where the guard works: wherever EAS is building, on its own machines or on
// this computer (`eas build --local`). The two do not spell EAS_BUILD alike.
{
  assert.equal(isEasBuild({}), false, "A plain shell is not an EAS build.");
  assert.equal(isEasBuild({ CI: "1", NODE_ENV: "production", EXPO_PUBLIC_EQUINA_DEMO_MODE: "true" }), false);
  assert.equal(isEasBuild({ EAS_BUILD: "true" }), true, "EAS's own machines say true.");
  assert.equal(isEasBuild({ EAS_BUILD: "1" }), true, "A local build says 1.");
  for (const runner of ["eas-build", "local-build-plugin"]) {
    assert.equal(isEasBuild({ EAS_BUILD_RUNNER: runner }), true, "The runner alone is enough.");
  }
  assert.equal(isEasBuild({ EAS_BUILD_PROFILE: "production" }), true, "So is the profile.");
  for (const unset of [undefined, "", "  "]) {
    assert.equal(isEasBuild({ EAS_BUILD: unset, EAS_BUILD_RUNNER: unset, EAS_BUILD_PROFILE: unset }), false);
  }
}

// A build on this computer is told apart from one on EAS's machines.
{
  assert.equal(isLocalEasBuild({ EAS_BUILD_RUNNER: "local-build-plugin" }), true);
  assert.equal(isLocalEasBuild({ EAS_BUILD: "1", EAS_BUILD_RUNNER: "eas-build" }), false, "EAS's machines, whatever EAS_BUILD says.");
  assert.equal(isLocalEasBuild({ EAS_BUILD: "1" }), false, "Without the runner's name nothing says the build is local.");
  assert.equal(isLocalEasBuild({ EAS_BUILD: "true", EAS_BUILD_RUNNER: "eas-build" }), false, "EAS's own machines.");
  assert.equal(isLocalEasBuild({}), false);
}

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
    for (const key of [undefined, "", "   "]) {
      assert.deepEqual(problemsWith({ [name]: key }), [], "No key is fine: nothing is sold.");
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
  for (const link of [undefined, "", "  "]) {
    assert.deepEqual(problemsWith({ EXPO_PUBLIC_PRIVACY_POLICY_URL: link }), [], "No privacy link is fine: nothing is sold.");
  }
}

// Nothing is sold in this release, so a store build carries nothing selling needs.
{
  assert.deepEqual(
    [...notSoldYet].sort(),
    ["EXPO_PUBLIC_PRIVACY_POLICY_URL", "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY", "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY"],
    "The store keys and the privacy link are what opens the paywall. Take a name out only in the commit that reviews selling."
  );
  // These are exactly the two things the app itself needs before it sells.
  const catalog = readFileSync(join(root, "src", "features", "plans", "purchase-catalog.ts"), "utf8");
  assert.match(catalog, /Boolean\(input\.apiKey\) &&\s+Boolean\(input\.privacyPolicyUrl\) &&/);

  const storeKeys: Record<string, string> = {
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: `appl_${"k".repeat(24)}`,
    EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: `goog_${"k".repeat(24)}`
  };
  for (const [name, key] of Object.entries(storeKeys)) {
    const problems = problemsWith({ [name]: key });
    assert.equal(problems.length, 1, "A real store key is refused as well: with it the paywall can open.");
    assert.ok(problems[0]!.startsWith(`${name} is set, and this release sells nothing.`));
    assert.ok(!problems[0]!.includes(key), "The key is not repeated.");
  }
  for (const link of ["https://example.com/privacy", "https://equina-ten.vercel.app.example.com/", "equina-ten.vercel.app/privacy"]) {
    const problems = problemsWith({ EXPO_PUBLIC_PRIVACY_POLICY_URL: link });
    assert.equal(problems.length, 1, "A privacy link on any host is the other half of selling.");
    assert.match(problems[0]!, /^EXPO_PUBLIC_PRIVACY_POLICY_URL is set, and this release sells nothing\./);
    assert.ok(!problems[0]!.includes(link));
  }
  // The more exact reason wins when there is one, and each name is reported once.
  assert.match(
    problemsWith({ EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: testStoreKey })[0] ?? "",
    /^EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is a RevenueCat Test Store key/
  );
  assert.equal(problemsWith({ ...storeKeys, EXPO_PUBLIC_PRIVACY_POLICY_URL: "https://example.com/privacy" }).length, 3);
  // The development client still takes whatever .env.local holds.
  assert.deepEqual(storeBuildProblems({ profile: "development", env: { ...storeKeys } }), []);
}

// A build on this computer with CI set is stopped: Expo then skips the cache
// reset, and the app could carry the values of an earlier bundle made here.
{
  const local = { EAS_BUILD: "1", EAS_BUILD_RUNNER: "local-build-plugin" };
  for (const ci of ["1", "true", "TRUE", "yes"]) {
    const problems = problemsWith({ ...local, CI: ci });
    assert.equal(problems.length, 1, `CI=${ci} stops a local build.`);
    assert.match(problems[0]!, /^CI is set in this terminal\./);
  }
  for (const ci of [undefined, "", "0", "false", "False"]) {
    assert.deepEqual(problemsWith({ ...local, CI: ci }), [], "Without CI a local build goes through.");
  }
  for (const easBuild of ["true", "1"]) {
    assert.deepEqual(
      problemsWith({ EAS_BUILD: easBuild, EAS_BUILD_RUNNER: "eas-build", CI: "1" }),
      [],
      "EAS's own machines set CI and start with an empty cache: nothing to stop there, however EAS_BUILD is spelled."
    );
  }
  assert.deepEqual(problemsWith({ CI: "1" }), [], "Outside a build, CI means nothing to the rules.");
  // The Expo CLI that expo itself loads: its own copy first, else the shared one.
  const expoCli = [join(root, "node_modules", "expo", "node_modules", "@expo", "cli"), join(root, "node_modules", "@expo", "cli")].find(
    (folder) => existsSync(join(folder, "package.json"))
  );
  assert.ok(expoCli, "Expo CLI is installed.");
  const exportEmbed = readFileSync(join(expoCli, "build", "src", "export", "embed", "exportEmbedAsync.js"), "utf8");
  assert.match(
    exportEmbed,
    /if \(_env\.env\.CI && options\.resetCache\) \{[^}]*options\.resetCache = false;/,
    "The reason for this rule is still in Expo CLI. If it is gone, the rule can go too."
  );
}

// Whether the address and the key are a live project's own is asked of the
// project. Only a rehearsal asks; the answer names the status and nothing else.
{
  type Asked = { url: string; apikey: string | undefined };
  const asking = (status: number | Error) => {
    const asked: Asked[] = [];
    const request = async (url: URL, init: { headers: Record<string, string> }) => {
      asked.push({ url: url.toString(), apikey: init.headers.apikey });
      if (status instanceof Error) throw status;
      return { status };
    };
    return { asked, request };
  };
  const env: Env = { EXPO_PUBLIC_SUPABASE_URL: ` ${projectUrl}/ `, EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey };

  const live = asking(200);
  assert.equal(await backendAnswer(env, live.request), null, "The project answered: nothing to report.");
  assert.deepEqual(live.asked, [{ url: `${projectUrl}/auth/v1/settings`, apikey: publishableKey }], "The auth service's public settings, with the key, as the app's client asks.");

  for (const status of [401, 403]) {
    const refused = await backendAnswer(env, asking(status).request);
    assert.match(refused ?? "", new RegExp(`^EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY was refused by the project \\(HTTP ${status}\\)\\.`));
  }
  const oldName = await backendAnswer(
    { EXPO_PUBLIC_SUPABASE_URL: projectUrl, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwtKey("anon") },
    asking(401).request
  );
  assert.match(oldName ?? "", /^EXPO_PUBLIC_SUPABASE_ANON_KEY was refused/, "The key is named as the app reads it.");

  for (const status of [404, 500, 302]) {
    assert.match((await backendAnswer(env, asking(status).request)) ?? "", new RegExp(`^EXPO_PUBLIC_SUPABASE_URL answered HTTP ${status},`));
  }
  const unreachable = await backendAnswer(env, asking(new Error(`getaddrinfo ENOTFOUND ${projectUrl}`)).request);
  assert.match(unreachable ?? "", /^EXPO_PUBLIC_SUPABASE_URL did not answer from this computer\./);

  for (const outcome of [401, 404, new Error(`connect ECONNREFUSED ${projectUrl} ${publishableKey}`)]) {
    const line = (await backendAnswer(env, asking(outcome).request)) ?? "";
    assert.ok(!line.includes("store-build-test") && !line.includes(publishableKey), "No line repeats the address or the key.");
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

  // `eas build --local` makes the same build on this computer, and says so
  // with EAS_BUILD=1. Its .ipa and .aab go to the stores like any other.
  const local = { EAS_BUILD: "1", EAS_BUILD_RUNNER: "local-build-plugin", EAS_BUILD_PLATFORM: "ios" };
  const localEmpty = run({ ...local, EAS_BUILD_PROFILE: "production" });
  assert.equal(localEmpty.status, 1, "A local production build with nothing set is stopped like one on EAS.");
  assert.match(localEmpty.errors, /the "production" build was stopped/);
  assert.match(localEmpty.errors, /EXPO_PUBLIC_SUPABASE_URL is not set/);
  assert.match(localEmpty.errors, /EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE is not "otp"/);
  const localReady = run({
    ...local,
    EAS_BUILD_PROFILE: "production",
    ...switches,
    EXPO_PUBLIC_SUPABASE_URL: projectUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey
  });
  assert.equal(localReady.status, 0, "A complete local build goes through.");
  assert.match(localReady.output, /has a backend/);
  const localLeftover = run({
    ...local,
    EAS_BUILD_PROFILE: "production",
    ...switches,
    EXPO_PUBLIC_SUPABASE_URL: projectUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: testStoreKey
  });
  assert.equal(localLeftover.status, 1, "A local build also gets what the terminal exports, development keys included.");
  assert.match(localLeftover.errors, /EXPO_PUBLIC_REVENUECAT_IOS_API_KEY is a RevenueCat Test Store key/);
  assert.equal(run({ ...local, EAS_BUILD_PROFILE: "development" }).status, 0, "A local development client goes through.");
  const localWithCi = run({
    ...local,
    EAS_BUILD_PROFILE: "production",
    ...switches,
    EXPO_PUBLIC_SUPABASE_URL: projectUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    CI: "1"
  });
  assert.equal(localWithCi.status, 1, "A complete local build from a terminal with CI set is stopped.");
  assert.match(localWithCi.errors, /CI is set in this terminal/);
  const cloudWithCi = run({
    EAS_BUILD: "true",
    EAS_BUILD_RUNNER: "eas-build",
    EAS_BUILD_PROFILE: "production",
    EAS_BUILD_PLATFORM: "android",
    ...switches,
    EXPO_PUBLIC_SUPABASE_URL: projectUrl,
    EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: publishableKey,
    CI: "1"
  });
  assert.equal(cloudWithCi.status, 0, "On EAS's machines CI is expected.");
  const oneNameOnly: Array<Record<string, string>> = [
    { EAS_BUILD_RUNNER: "local-build-plugin" },
    { EAS_BUILD_RUNNER: "eas-build" },
    { EAS_BUILD_PROFILE: "preview" }
  ];
  for (const env of oneNameOnly) {
    const stopped = run(env);
    assert.equal(stopped.status, 1, "The runner or the profile is enough to know EAS is building, however EAS_BUILD is spelled.");
    assert.doesNotMatch(stopped.output, /not an EAS build/);
  }

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
  // --offline: these addresses are made up, and a test asks nobody on the network.
  for (const profile of ["preview", "production"]) {
    const rehearsed = run(easVariables, ["--rehearse", profile, "--offline"]);
    assert.equal(rehearsed.status, 0, `With the two EAS variables, a "${profile}" build would go through.`);
    assert.match(rehearsed.output, /has a backend/);
    assert.doesNotMatch(rehearsed.output, /the project answered/, "Offline, the project is not asked.");
    assert.ok(!rehearsed.output.includes(projectUrl) && !rehearsed.output.includes(publishableKey));
  }
  // Without --offline the rehearsal asks the project. Nothing listens on this
  // port of this computer, so the question fails at once and no network is used.
  const nobodyHome = "https://127.0.0.1:9";
  const unanswered = run({ ...easVariables, EXPO_PUBLIC_SUPABASE_URL: nobodyHome }, ["--rehearse", "production"]);
  assert.equal(unanswered.status, 1, "An address that is not a live project stops the rehearsal, though its shape is right.");
  assert.match(unanswered.errors, /EXPO_PUBLIC_SUPABASE_URL did not answer from this computer\./);
  assert.ok(!unanswered.output.includes(nobodyHome) && !unanswered.output.includes(publishableKey));
  // A build on EAS never asks: the same unanswering address goes through there.
  const onEasNobodyAsks = run({
    EAS_BUILD: "true",
    EAS_BUILD_PROFILE: "production",
    EAS_BUILD_PLATFORM: "ios",
    ...switches,
    ...easVariables,
    EXPO_PUBLIC_SUPABASE_URL: nobodyHome
  });
  assert.equal(onEasNobodyAsks.status, 0, "The build machine checks the rules and asks nobody.");
  const nothingOnEas = run({}, ["--rehearse", "production"]);
  assert.equal(nothingOnEas.status, 1, "Without them it says so before a build is spent.");
  assert.match(nothingOnEas.errors, /the "production" build would be stopped/);
  assert.match(nothingOnEas.errors, /EXPO_PUBLIC_SUPABASE_URL is not set/);
  assert.doesNotMatch(nothingOnEas.errors, /Missing, although/, "The switches come from eas.json in a rehearsal.");

  const inBoth = run({ ...easVariables, EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS: "true" }, ["--rehearse", "production", "--offline"]);
  assert.equal(inBoth.status, 1, "A switch that is also an EAS variable is caught before the build machine picks one.");
  assert.match(inBoth.errors, /Set outside eas\.json as well as in it: EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS\./);

  const leftovers = run({ ...easVariables, EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: testStoreKey }, ["--rehearse", "preview", "--offline"]);
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
