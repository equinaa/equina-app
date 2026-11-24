import { appVersionLine, type InstalledVersion } from "./app-version";

/**
 * Read from the binary itself (Info.plist on iOS, the package on Android), not
 * from app.json: the store build number is set when the binary is built, and
 * app.json can lag behind it. The web has neither, so it shows the version the
 * bundle was exported with.
 *
 * Both modules come with Expo (expo-notifications and expo-auth-session need
 * expo-application, expo itself needs expo-constants), so they are in every
 * build already. They are loaded inside a try all the same: this line is
 * printed by the error screen, which must not be the thing that fails.
 */
const readInstalledVersion = (): InstalledVersion => {
  let version: string | null = null;
  let build: string | null = null;
  try {
    const Application = require("expo-application") as typeof import("expo-application");
    version = Application.nativeApplicationVersion;
    build = Application.nativeBuildVersion;
  } catch {
    // No native module in this binary: it still starts, without a build number.
  }
  if (!version) {
    try {
      const Constants = (require("expo-constants") as typeof import("expo-constants")).default;
      version = Constants.expoConfig?.version ?? null;
    } catch {
      // Nothing to show is better than a guess.
    }
  }
  return { version, build };
};

/** "Version 1.0.0 (12)", or empty when the platform reports nothing. */
export const installedVersionLine = appVersionLine(readInstalledVersion());
