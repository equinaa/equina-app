import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The store builds (TestFlight and Google Play) are the "preview" and
// "production" profiles in eas.json. The app reads EXPO_PUBLIC_* when it is
// bundled, and a build made by EAS never sees .env.local, so every name the app
// reads needs an answer here: what does a store build get for it?
//
// Change the answer in this file and in eas.json together.

type BuildProfile = {
  extends?: string;
  node?: string;
  environment?: string;
  distribution?: string;
  developmentClient?: boolean;
  autoIncrement?: boolean;
  android?: { buildType?: string };
  env?: Record<string, string>;
};
type EasJson = {
  cli: { appVersionSource?: string };
  build: Record<string, BuildProfile>;
  submit?: Record<string, unknown>;
};

const root = process.cwd();
const easJson = JSON.parse(readFileSync(join(root, "eas.json"), "utf8")) as EasJson;
const appJson = JSON.parse(readFileSync(join(root, "app.json"), "utf8")) as {
  expo: { ios?: Record<string, unknown>; android?: Record<string, unknown> };
};

/**
 * Committed in eas.json "env": fixed switches that identify nothing, so the
 * public mirror of this repository can carry them and a review can read them.
 */
const committedSwitches: Record<string, string> = {
  // Every email is a six-digit code, never a link (docs/EQUINA_AUTH_DELIVERY.md).
  EXPO_PUBLIC_EQUINA_EMAIL_AUTH_MODE: "otp",
  // On, as in the production web app. The server still decides for each
  // account (docs/EQUINA_FEATURE_FLAG_POLICY.md).
  EXPO_PUBLIC_ENABLE_ACCOUNT_SETTINGS: "true",
  EXPO_PUBLIC_ENABLE_HORSE_MANAGEMENT: "true",
  EXPO_PUBLIC_ENABLE_RECORD_MUTATIONS: "true",
  EXPO_PUBLIC_ENABLE_RIDE_LOGGING: "true",
  EXPO_PUBLIC_ENABLE_COACH_CHAT: "true",
  EXPO_PUBLIC_ENABLE_CLUB_INTERACTIONS: "true",
  EXPO_PUBLIC_ENABLE_CLUB_PUBLISHING: "true",
  EXPO_PUBLIC_ENABLE_CLUB_PHOTO_POSTS: "true",
  // Off in the first store builds: sign-in is by email only, push and the Shop
  // are not live, and the demo is for development.
  EXPO_PUBLIC_ENABLE_APPLE_AUTH: "false",
  EXPO_PUBLIC_ENABLE_GOOGLE_AUTH: "false",
  EXPO_PUBLIC_ENABLE_PUSH_NOTIFICATIONS: "false",
  EXPO_PUBLIC_ENABLE_SHOP_TRANSACTIONS: "false",
  EXPO_PUBLIC_ENABLE_SHOP_LISTING_CREATION: "false",
  EXPO_PUBLIC_ENABLE_SHOP_MESSAGING: "false",
  EXPO_PUBLIC_EQUINA_DEMO_MODE: "false"
};

/**
 * Set as EAS environment variables for "preview" and "production", never
 * committed: they name the project.
 */
const easVariables = ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"];

/** Not set at all in a store build, and why. */
const leftUnset: Record<string, string> = {
  EXPO_PUBLIC_SUPABASE_ANON_KEY: "The old name of the publishable key; the app only falls back to it.",
  EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY: "The Shop is off.",
  EXPO_PUBLIC_REVENUECAT_IOS_API_KEY: "Without a store key the app cannot sell: plans are given from the Admin.",
  EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY: "Without a store key the app cannot sell: plans are given from the Admin.",
  EXPO_PUBLIC_PRIVACY_POLICY_URL: "There is no permanent policy page yet, and without one the app cannot sell either.",
  EXPO_PUBLIC_TERMS_URL: "Shown only on the paywall, which stays closed.",
  EXPO_PUBLIC_EAS_PROJECT_ID: "Read only when a device registers for push, which is off."
};

// Every name the app reads has exactly one answer.
{
  const sourceFiles = (readdirSync(join(root, "src"), { recursive: true }) as string[]).filter((name) =>
    /\.tsx?$/.test(name)
  );
  const read = new Set<string>();
  for (const name of sourceFiles) {
    const source = readFileSync(join(root, "src", name), "utf8");
    for (const match of source.matchAll(/process\.env\.(EXPO_PUBLIC_[A-Z0-9_]+)/g)) read.add(match[1]!);
  }
  const answered = [...Object.keys(committedSwitches), ...easVariables, ...Object.keys(leftUnset)];
  assert.equal(new Set(answered).size, answered.length, "A name has one answer, not two.");
  assert.deepEqual(
    [...read].sort(),
    [...answered].sort(),
    "Every EXPO_PUBLIC_ name read in src/ needs a store build answer here, and no answer outlives its name."
  );
}

// Only switches are committed: a URL or a key in eas.json would reach the public mirror.
for (const [name, value] of Object.entries(committedSwitches)) {
  assert.match(value, /^(true|false|otp)$/, `${name} is a switch, not a value that identifies the project.`);
}

// Both store profiles get exactly the reviewed switches, and nothing else.
for (const profile of ["preview", "production"]) {
  assert.deepEqual(easJson.build[profile]?.env, committedSwitches, `eas.json "${profile}" carries the reviewed switches.`);
}

// What EAS variables provide is never also in eas.json: when a name is in both,
// which one a build gets is not something to depend on.
for (const [profile, config] of Object.entries(easJson.build)) {
  for (const name of [...easVariables, ...Object.keys(leftUnset)]) {
    assert.ok(!(name in (config.env ?? {})), `${name} does not belong in eas.json ("${profile}").`);
  }
}

// The shape the builds rely on.
{
  const { base, development, preview, production } = easJson.build;
  assert.equal(easJson.cli.appVersionSource, "remote", "EAS keeps the build number, so no build rewrites app.json.");
  assert.equal(appJson.expo.ios?.buildNumber, undefined, "With the remote source, a build number in app.json is ignored.");
  assert.equal(appJson.expo.android?.versionCode, undefined, "With the remote source, a version code in app.json is ignored.");
  // The EAS image for SDK 55 ships Node 20; @supabase/supabase-js asks for 22.
  assert.match(base?.node ?? "", /^22\.\d+\.\d+$/, "The base profile pins one exact Node 22.");
  for (const [name, profile] of Object.entries({ development, preview, production })) {
    assert.equal(profile?.extends, "base", `"${name}" builds with the pinned Node.`);
    assert.equal(profile?.environment, name, `"${name}" names its EAS environment instead of leaving EAS to guess.`);
  }
  assert.equal(development?.developmentClient, true);
  assert.equal(development?.env, undefined, "A development client reads .env.local through Metro.");
  assert.equal(preview?.distribution, "internal");
  assert.equal(preview?.android?.buildType, "apk", "An internal Android build has to be an APK to install from a link.");
  assert.equal(production?.distribution, "store");
  assert.equal(production?.autoIncrement, true, "Each store build gets the next build number.");
  assert.ok(easJson.submit?.production, "eas submit --profile production has a profile to start from.");
}

console.log("Store build configuration passed.");
