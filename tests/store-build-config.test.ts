import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LAUNCH_BROWN } from "../src/ui/launch/launch-look";

// The team builds and the store builds are the "preview" profile (an internal
// APK or ad hoc build) and the "production" profile (TestFlight and Google Play)
// in eas.json. The app reads EXPO_PUBLIC_* when it is
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
  expo: {
    icon?: string;
    plugins?: Array<string | [string, Record<string, unknown>?]>;
    ios?: {
      buildNumber?: string;
      bundleIdentifier?: string;
      infoPlist?: Record<string, unknown>;
      config?: { usesNonExemptEncryption?: boolean };
      splash?: { backgroundColor?: string; image?: string };
    };
    android?: {
      versionCode?: number;
      backgroundColor?: string;
      splash?: { backgroundColor?: string };
      adaptiveIcon?: { foregroundImage?: string; backgroundImage?: string; monochromeImage?: string; backgroundColor?: string };
      blockedPermissions?: string[];
    };
  };
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
// So does any profile added later. Only "base" (never built by itself) and the
// development client go without: every other profile makes an app someone
// installs, and the build guard compares a build with its own profile.
for (const [profile, config] of Object.entries(easJson.build)) {
  if (profile === "base" || profile === "development") continue;
  assert.deepEqual(config.env, committedSwitches, `eas.json "${profile}" makes an installable app, so it carries the reviewed switches.`);
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
  // The version line (src/ui/states/app-version.ts) is how a tester's screenshot
  // names a build. Without this a preview build reuses the last number EAS gave.
  assert.equal(preview?.autoIncrement, true, "Each internal build gets its own build number too.");
  assert.ok(easJson.submit?.production, "eas submit --profile production has a profile to start from.");
}

// What app.json has to say before a binary goes to a store.
{
  const { ios, android, plugins = [] } = appJson.expo;
  const options = (name: string): Record<string, unknown> => {
    const plugin = plugins.find((entry) => (Array.isArray(entry) ? entry[0] : entry) === name);
    return (Array.isArray(plugin) ? plugin[1] : undefined) ?? {};
  };

  assert.equal(
    ios?.config?.usesNonExemptEncryption,
    false,
    "Without the export compliance answer, every TestFlight build waits on Missing Compliance."
  );

  // The binary links the camera API through expo-image-picker, although the
  // app never asks for it. Apple refuses an upload whose Info.plist has no
  // purpose string for it (ITMS-90683), and `false` in these options deletes
  // the string. The microphone is used, to ask Ralf by voice: three plugins
  // write its string, and the order of the plugins decides which one stays,
  // so they all say the same.
  const picker = options("expo-image-picker");
  const audio = options("expo-audio");
  const speech = options("expo-speech-recognition");
  for (const purpose of [picker.photosPermission, picker.cameraPermission, picker.microphonePermission, audio.microphonePermission, speech.microphonePermission, speech.speechRecognitionPermission]) {
    assert.equal(typeof purpose, "string", "A purpose string is a sentence, never false.");
    assert.match(String(purpose), /^[A-Z][^!]+\.$/, "One plain sentence, no exclamation mark.");
  }
  assert.equal(audio.microphonePermission, picker.microphonePermission, "The plugins write one microphone string.");
  assert.equal(speech.microphonePermission, picker.microphonePermission, "The plugins write one microphone string.");
  assert.match(String(speech.microphonePermission), /hold the mic to ask Ralf/, "The microphone is asked for the one thing it is used for.");
  assert.match(String(speech.speechRecognitionPermission), /on your phone/, "Speech becomes text on the phone.");
  // expo-secure-store links the Face ID API, which the app never calls (no
  // requireAuthentication), and would otherwise write Expo's generic request.
  const secureStore = options("expo-secure-store");
  assert.equal(secureStore.faceIDPermission, "Equina does not use Face ID.", "Face ID gets the same plain sentence as the camera.");
  assert.match(String(picker.photosPermission), /profile.*horses.*Club posts/, "The photo library is opened for all three; a record's file comes from the document picker.");

  // With the strings in place the image picker plugin no longer removes these itself.
  for (const permission of ["CAMERA", "SYSTEM_ALERT_WINDOW"]) {
    assert.ok(
      android?.blockedPermissions?.includes(`android.permission.${permission}`),
      `${permission} stays out of the Android manifest.`
    );
  }

  // The launch is the icon's brown with the horse symbol, the same ground the React launch curtain
  // (src/ui/launch) carries on, so the system's launch screen hands over to it without a seam.
  assert.equal(ios?.splash?.backgroundColor, LAUNCH_BROWN);
  assert.equal(android?.splash?.backgroundColor, LAUNCH_BROWN);
  assert.equal(android?.backgroundColor, LAUNCH_BROWN, "The window behind React is the launch brown too, until the curtain's first frame.");
  assert.ok(
    ios?.splash?.image && existsSync(join(root, ios.splash.image)),
    "Without an image, SDK 55 leaves the iOS launch screen on the system colour and ignores the background colour."
  );
  // iOS fits the launch image to the screen (aspect fit, centred): a square the screen's width with the
  // symbol at LAUNCH_MARK_FRACTION of it puts the symbol where the curtain draws it.
  const splashHeader = readFileSync(join(root, String(ios?.splash?.image))).subarray(0, 26);
  assert.equal(splashHeader.readUInt32BE(16), splashHeader.readUInt32BE(20), "The launch image is square.");
  assert.ok(splashHeader.readUInt32BE(16) >= 1290, "The launch image is sharp at the widest phone's 3x width.");
  assert.ok(splashHeader[25] === 6, "The launch image is transparent around the symbol, over the brown.");
}

// The icons: the horse symbol from the Equina logo as a medal (brass rim, dark enamel, raised ivory head) on saddle brown.
{
  const { icon, android, plugins = [] } = appJson.expo;
  const notifications = plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-notifications");
  const notificationIcon = Array.isArray(notifications) ? notifications[1]?.icon : undefined;

  // A PNG says its size and whether it has an alpha channel in its first 26 bytes.
  const png = (path: unknown, what: string) => {
    assert.equal(typeof path, "string", `app.json names ${what}.`);
    const file = join(root, String(path));
    assert.ok(existsSync(file), `${what} exists at ${String(path)}.`);
    const header = readFileSync(file).subarray(0, 26);
    assert.equal(header.subarray(1, 4).toString("ascii"), "PNG", `${what} is a PNG.`);
    const colorType = header[25];
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 };
  };

  assert.deepEqual(
    png(icon, "the app icon"),
    { width: 1024, height: 1024, alpha: false },
    "The app icon is 1024 x 1024 with no alpha channel: Apple refuses transparency, and Expo would paint transparent corners white."
  );
  assert.deepEqual(
    png(android?.adaptiveIcon?.foregroundImage, "the Android adaptive icon foreground"),
    { width: 1024, height: 1024, alpha: true },
    "The Android foreground is 1024 x 1024 on a transparent ground, with the mark inside the middle two thirds."
  );
  assert.deepEqual(
    png(android?.adaptiveIcon?.backgroundImage, "the Android adaptive icon background"),
    { width: 1024, height: 1024, alpha: false },
    "Behind the foreground, the same brown ground as the iOS icon, opaque."
  );
  assert.match(String(android?.adaptiveIcon?.backgroundColor), /^#[0-9A-F]{6}$/i, "A brown fallback colour, for launchers that skip the image.");
  assert.deepEqual(
    png(android?.adaptiveIcon?.monochromeImage, "the Android themed (monochrome) icon"),
    { width: 1024, height: 1024, alpha: true },
    "Android 13 themed icons tint one shape: the crescent, on transparent."
  );
  const glyph = png(notificationIcon, "the Android notification icon");
  assert.ok(glyph.alpha && glyph.width === glyph.height && glyph.width >= 96, "The notification icon is a white shape on transparent, 96 px or more.");
}

// The ride chimes, which a locked phone plays as notification sounds. The
// plugin copies each file into the app under its own name, and Android refuses
// a build whose raw resource names have anything but a-z, 0-9 and _.
{
  const { plugins = [] } = appJson.expo;
  const notifications = plugins.find((entry) => Array.isArray(entry) && entry[0] === "expo-notifications");
  const sounds: unknown = Array.isArray(notifications) ? notifications[1]?.sounds : undefined;
  assert.ok(Array.isArray(sounds) && sounds.length > 0, "app.json ships the ride chimes as notification sounds.");
  const cues = readFileSync(join(root, "src/features/ride/ride-cues.ts"), "utf8");
  for (const path of sounds as string[]) {
    const name = path.split("/").pop() ?? "";
    assert.ok(existsSync(join(root, path)), `${path} exists.`);
    assert.match(name, /^[a-z0-9_]+\.(wav|aiff|caf)$/, `${name}: lowercase letters, digits and _ only, and a format iOS plays for a notification.`);
    // A WAV is a list of chunks: "fmt " says the bytes per second, "data" holds the sound.
    const wav = readFileSync(join(root, path));
    const chunks = new Map<string, { at: number; size: number }>();
    for (let at = 12; at + 8 <= wav.length; at += 8 + wav.readUInt32LE(at + 4) + (wav.readUInt32LE(at + 4) % 2)) {
      chunks.set(wav.toString("ascii", at, at + 4), { at: at + 8, size: wav.readUInt32LE(at + 4) });
    }
    const format = chunks.get("fmt ");
    const data = chunks.get("data");
    assert.ok(wav.toString("ascii", 8, 12) === "WAVE" && format && data, `${name} is a WAV with sound in it.`);
    const seconds = data.size / wav.readUInt32LE(format.at + 8);
    assert.ok(seconds < 30, `${name} is under the 30 s iOS allows a notification sound.`);
    assert.ok(cues.includes(`file: "${name}"`), `ride-cues.ts asks for ${name} by the name the app ships it under.`);
  }
}

// The ride on the lock screen and in the Dynamic Island: a widget extension
// (targets/ride-activity) that @bacons/apple-targets adds at prebuild, and
// the key without which iOS refuses to start a Live Activity.
{
  const { ios, plugins = [] } = appJson.expo;
  assert.equal(ios?.infoPlist?.NSSupportsLiveActivities, true, "Without NSSupportsLiveActivities iOS refuses every Live Activity.");
  // Only a frequent-updates budget for push would need this one, and there is no push.
  assert.equal(ios?.infoPlist?.NSSupportsLiveActivitiesFrequentUpdates, undefined);
  const targets = plugins.find((entry) => (Array.isArray(entry) ? entry[0] : entry) === "@bacons/apple-targets");
  assert.ok(targets, "The plugin that adds the widget extension at prebuild.");
  const submitTeam = (easJson.submit?.production as { ios?: { appleTeamId?: string } } | undefined)?.ios?.appleTeamId;
  assert.ok(submitTeam);
  assert.equal(
    Array.isArray(targets) ? targets[1]?.appleTeamId : undefined,
    submitTeam,
    "The extension is signed by the team the app is submitted from."
  );
  assert.equal(ios?.bundleIdentifier, "com.equina.mobile", "The extension's App ID is this one plus .RideActivity.");

  const packageJson = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
    dependencies: Record<string, string>;
    expo?: { autolinking?: { exclude?: string[] } };
  };
  // 5.0.0 is the line for SDK 55 (6.0 asks for Expo 57). Pinned: every
  // release rewrites the Xcode project, and a new one is checked with a
  // native build first.
  assert.equal(packageJson.dependencies["@bacons/apple-targets"], "5.0.0");
  // Its own native module (ExtensionStorage, App Group storage) needs iOS 16.4
  // and is not used: no App Group. Left out, so the app keeps iOS 15.1.
  assert.deepEqual(packageJson.expo?.autolinking?.exclude, ["@bacons/apple-targets"]);
}

console.log("Store build configuration passed.");
