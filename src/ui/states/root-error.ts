import { supportEmail } from "../../config/support-contact";

/**
 * Every word on the screen that replaces the app when it cannot draw itself.
 * There are no over-the-air updates, so these lines stay as they are for as
 * long as a build is installed.
 */
export const rootErrorCopy = {
  title: "Something went wrong",
  body: "Equina ran into a problem and could not continue.",
  // "Try again" starts the app over. When that fails as well, pressing it a
  // third time would only show the same screen: say what does help instead.
  repeatBody: `That did not fix it. Close Equina and open it again, and if it keeps happening, write to ${supportEmail}.`,
  retry: "Try again"
} as const;

/** A failure this soon after "Try again" is the same failure, not a new one. */
export const repeatWindowMs = 10_000;

export const failedAgain = (failedAt: number, retriedAt: number | null): boolean =>
  retriedAt !== null && failedAt - retriedAt < repeatWindowMs;

const detailLimit = 160;

/**
 * One line about what failed, for the screenshot a tester sends: the app has no
 * crash reporting, so this and the version are all the team gets. Only the
 * error's own name and first line; never a stack, which is unreadable in a
 * release build and would fill the screen.
 */
export const errorDetailLine = (error: unknown): string => {
  try {
    const raw =
      error instanceof Error
        ? [error.name, error.message].filter(Boolean).join(": ")
        : typeof error === "string"
          ? error
          : "";
    const line = (raw.split("\n")[0] ?? "").trim();
    return line.length > detailLimit ? `${line.slice(0, detailLimit - 3).trimEnd()}...` : line;
  } catch {
    // Whatever was thrown cannot even be described. The screen still shows.
    return "";
  }
};
