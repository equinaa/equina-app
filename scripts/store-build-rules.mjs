// What a store build must have, as plain functions. scripts/eas-build-guard.mjs
// runs them on EAS before dependencies are installed, so this file may only
// import from Node itself. tests/eas-build-guard.test.ts covers them.
//
// Every line they produce names variables and never repeats a value: the lines
// end up in a build log.

/** The web app's own address. A privacy link there is a placeholder, not a policy. */
const webAppHost = "equina-ten.vercel.app";

const clean = (value) => (typeof value === "string" ? value.trim() : "");

const webAddress = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
};

/** The role inside a Supabase JWT key, or null when the key is not one. */
const jwtRole = (key) => {
  const parts = key.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload?.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
};

/** A key that opens the whole database. It must never be built into an app. */
const isSecretKey = (key) => key.startsWith("sb_secret_") || jwtRole(key) === "service_role";

/**
 * Whether EAS is making a build here. EAS does not say it the same way
 * everywhere: EAS_BUILD is "true" on its own machines and "1" when the build
 * runs on this computer (`eas build --local`). Both also name the runner and
 * the profile, so any of the three counts and no single spelling can switch
 * the guard off.
 */
export const isEasBuild = (env) =>
  ["true", "1"].includes(clean(env.EAS_BUILD).toLowerCase()) ||
  clean(env.EAS_BUILD_RUNNER) !== "" ||
  clean(env.EAS_BUILD_PROFILE) !== "";

/**
 * Whether the build runs on this computer (`eas build --local`) instead of on
 * EAS's own machines: the local build plugin names itself as the runner, and
 * says EAS_BUILD=1 where EAS's machines say true.
 */
export const isLocalEasBuild = (env) =>
  clean(env.EAS_BUILD_RUNNER) === "local-build-plugin" || clean(env.EAS_BUILD) === "1";

/**
 * Whether Expo CLI takes this shell for CI. Expo reads CI as "true" or "1" and
 * stops on any other value but "false" or "0", so everything else counts here.
 */
const ciIsSet = (env) => {
  const value = clean(env.CI).toLowerCase();
  return value !== "" && value !== "false" && value !== "0";
};

/**
 * Whether the checks apply. Only the development client is let through: it
 * loads its JavaScript from Metro, with the values of .env.local. Any other
 * profile, known or not, produces an app someone installs.
 */
export const isStoreBuild = (profile) => profile !== "development";

/**
 * The "env" eas.json gives a build profile, resolved the way EAS CLI resolves
 * it: parents first through "extends" (five deep at most), then the platform's
 * own block over the shared one.
 */
export const reviewedSwitches = (easJson, profile, platform) => {
  const chain = [];
  let name = profile;
  for (let depth = 0; depth < 5 && typeof name === "string"; depth += 1) {
    const config = easJson?.build?.[name];
    if (!config || typeof config !== "object") break;
    chain.unshift(config);
    name = config.extends;
  }
  const switches = {};
  for (const config of chain) Object.assign(switches, config.env);
  if (platform === "ios" || platform === "android") {
    for (const config of chain) Object.assign(switches, config[platform]?.env);
  }
  return switches;
};

/**
 * The switches of eas.json that something else sets too. On the build machine
 * one of the two silently wins, so a name lives in one place only.
 */
export const setTwice = (env, switches) => Object.keys(switches).filter((name) => env[name] !== undefined);

/**
 * What this release does not sell with. The app opens its paywall only when a
 * store key for the platform and a privacy link are both built in
 * (src/features/plans/purchase-catalog.ts, purchasesAvailable), and nothing
 * else reads these three names. The server's side of selling is already on in
 * production, so a build that carries them sells to every tester.
 *
 * The first closed test sells nothing: the team gives each account its plan
 * from the Admin (decided on 24 Nov 2026). Until that changes a store build
 * carries none of the three. To start selling, take the names out of this list
 * in the commit that reviews the paywall, and set them as EAS variables.
 */
export const notSoldYet = [
  "EXPO_PUBLIC_REVENUECAT_IOS_API_KEY",
  "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY",
  "EXPO_PUBLIC_PRIVACY_POLICY_URL"
];

/** The name the app reads the key from: the old one only when the new one is absent. */
const backendKeyName = (env) =>
  env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY === undefined && env.EXPO_PUBLIC_SUPABASE_ANON_KEY !== undefined
    ? "EXPO_PUBLIC_SUPABASE_ANON_KEY"
    : "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY";

/**
 * Why this build must not ship. Empty when the build is fine, and for the
 * development client.
 *
 * `env` is what the build machine sees. `switches` is what eas.json gives the
 * profile (reviewedSwitches).
 */
export const storeBuildProblems = ({ profile, env, switches = {} }) => {
  if (!isStoreBuild(profile)) return [];

  // One line for each variable, whichever rule catches it first.
  const problems = new Map();
  const report = (name, message) => {
    if (!problems.has(name)) problems.set(name, `${name} ${message}`);
  };

  // The backend, read as src/backend/config.ts reads it.
  const url = clean(env.EXPO_PUBLIC_SUPABASE_URL);
  if (!url) {
    report("EXPO_PUBLIC_SUPABASE_URL", "is not set. The app would open with no backend and nobody could sign in.");
  } else if (webAddress(url)?.protocol !== "https:") {
    report("EXPO_PUBLIC_SUPABASE_URL", "is not an https address.");
  }
  // The app falls back to the key's old name only when the new one is absent.
  const keyName = backendKeyName(env);
  const key = clean(env[keyName]);
  if (!key) {
    report("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "is not set. The app would open with no backend and nobody could sign in.");
  } else if (isSecretKey(key)) {
    report(keyName, "holds a secret key. Only the publishable key may be built into the app.");
  }

  // Every email carries a six-digit code. The app compares this value exactly.
  if (env.EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE !== "otp") {
    report("EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE", 'is not "otp". The app would wait for a link the emails no longer carry.');
  }

  if (clean(env.EXPO_PUBLIC_EQUINA_DEMO_MODE).toLowerCase() === "true") {
    report("EXPO_PUBLIC_EQUINA_DEMO_MODE", "is on. The demo is for development builds.");
  }

  for (const name of ["EXPO_PUBLIC_REVENUECAT_IOS_API_KEY", "EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY"]) {
    if (clean(env[name]).startsWith("test_")) {
      report(name, "is a RevenueCat Test Store key, which only works in development builds. Delete it from this environment.");
    }
  }

  const privacy = webAddress(clean(env.EXPO_PUBLIC_PRIVACY_POLICY_URL));
  if (privacy && privacy.hostname.replace(/\.$/, "") === webAppHost) {
    report("EXPO_PUBLIC_PRIVACY_POLICY_URL", "points at the web app, not at a privacy policy. Leave it unset until the policy has its own page.");
  }

  // Nothing is sold in this release, so nothing selling needs is built in.
  for (const name of notSoldYet) {
    if (clean(env[name]) !== "") {
      report(
        name,
        "is set, and this release sells nothing. With a store key and a privacy link built in, the paywall opens for every tester. Delete it from this environment."
      );
    }
  }

  // On this computer, a set CI makes Expo skip the cache reset that the native
  // build asks for (@expo/cli, export/embed/exportEmbedAsync.js), and Metro's
  // cache, shared by every checkout here, then hands the app the EXPO_PUBLIC_
  // values of an earlier bundle. EAS's own machines start with an empty cache.
  if (isLocalEasBuild(env) && ciIsSet(env)) {
    report(
      "CI",
      "is set in this terminal. A build on this computer with CI set can carry the EXPO_PUBLIC_ values of an earlier build. Run it from a terminal without CI (unset CI)."
    );
  }

  // The switches reviewed in git are the ones the build gets.
  const lines = [...problems.values()];
  const unreported = Object.keys(switches).filter((name) => !problems.has(name));
  const missing = unreported.filter((name) => env[name] === undefined);
  const changed = unreported.filter((name) => env[name] !== undefined && env[name] !== switches[name]);
  if (missing.length > 0) {
    lines.push(`Missing, although eas.json gives them to this profile: ${missing.join(", ")}.`);
  }
  if (changed.length > 0) {
    lines.push(
      `Not the value eas.json gives them: ${changed.join(", ")}. ` +
        "An EAS environment variable with the same name is the likely cause: delete it, and change the switch in eas.json instead."
    );
  }
  return lines;
};

/**
 * Whether the two backend values are a live project's own: asks the project's
 * auth service for its public settings with the key, as the app's client
 * would, and wants a plain 200. A wrong letter in the address or a key cut
 * short when it was pasted passes every rule above, and the build that carries
 * it cannot sign anyone in and cannot be patched.
 *
 * Only the rehearsal calls this, from the owner's computer. A build machine
 * asks nobody. It answers with a line for the report, or null when the project
 * answered. The line carries the status, never the address or the key.
 */
export const backendAnswer = async (env, request = globalThis.fetch) => {
  const url = clean(env.EXPO_PUBLIC_SUPABASE_URL);
  const keyName = backendKeyName(env);
  const key = clean(env[keyName]);
  let status;
  try {
    const response = await request(new URL("/auth/v1/settings", url), {
      headers: { apikey: key },
      signal: AbortSignal.timeout(15_000)
    });
    status = response.status;
  } catch {
    return "EXPO_PUBLIC_SUPABASE_URL did not answer from this computer. It is not the project's address, or this computer is offline.";
  }
  if (status === 200) return null;
  if (status === 401 || status === 403) {
    return `${keyName} was refused by the project (HTTP ${status}). It is not this project's publishable key, or it was cut short.`;
  }
  return `EXPO_PUBLIC_SUPABASE_URL answered HTTP ${status}, not as a Supabase project does.`;
};
