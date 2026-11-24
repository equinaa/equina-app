/**
 * What a binary says about itself: the store version and the native build
 * number. Either can be missing: the web has no build number, and a value the
 * platform does not report is left out rather than guessed.
 */
export type InstalledVersion = { version: string | null; build: string | null };

const clean = (value: string | null | undefined) => (typeof value === "string" ? value.trim() : "");

/**
 * The one line the app prints about itself, the same on the error screen and
 * in Account, so a tester's screenshot says which build they are on:
 * "Version 1.0.0 (12)". Empty when nothing is known, and the line is not shown.
 */
export const appVersionLine = (installed: InstalledVersion): string => {
  const version = clean(installed.version);
  const build = clean(installed.build);
  if (version && build) return `Version ${version} (${build})`;
  if (version) return `Version ${version}`;
  return build ? `Build ${build}` : "";
};
