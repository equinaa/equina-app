import type { RideSource } from "../../backend";

/**
 * What the recap says about how long a ride lasted. Pure, so the limits and
 * the wording are tested without a phone.
 *
 * Only the two ends have a message so far: a very short ride and a very long
 * one. Everything in between returns null and the recap keeps its own text.
 */

// The two limits, in minutes. Change them here and nowhere else.
/** A ride under this many minutes gets the short-ride message. */
export const SHORT_RIDE_MAX_MINUTES = 15;
/** A ride of this many minutes or more gets the long-session message. */
export const LONG_RIDE_MIN_MINUTES = 90;

export type RideRecapMessageKind = "short" | "long";

export type RideRecapMessage = {
  kind: RideRecapMessageKind;
  /** The opening line, shown where the recap has its title. */
  title: string;
  /** The advice, shown under it. */
  body: string;
  /** Title and body as one text, word for word as it was given to us. */
  text: string;
};

// The founder's copy. It is split only so the recap can set the first line as
// its title: title and body, joined by a space, are her text unchanged.
const copy: Record<RideRecapMessageKind, { title: string; body: string }> = {
  short: {
    title: "Short ride today!",
    body: "Remember, consistency and enough time in the saddle are key to progress. Try to give yourself a little more time next session."
  },
  long: {
    title: "That was a long session!",
    body: "Remember, more isn't always better. Give your horse enough time to rest and recover, and try to keep your next training session more balanced."
  }
};

const message = (kind: RideRecapMessageKind): RideRecapMessage => ({
  kind,
  ...copy[kind],
  text: `${copy[kind].title} ${copy[kind].body}`
});

/**
 * The message for a ride that just finished, or null when the recap should
 * say what it always said.
 *
 * `elapsedSeconds` is the time the clock ran, pauses left out. An activity
 * logged by hand never gets a message: its minutes were typed in afterwards,
 * and "Short ride today!" on something entered for last Thursday reads wrong.
 * A ride with no source is live, as in the journal.
 */
export const rideRecapMessage = (ride: {
  elapsedSeconds: number;
  source?: RideSource;
}): RideRecapMessage | null => {
  if (ride.source === "manual") return null;
  if (!Number.isFinite(ride.elapsedSeconds)) return null;
  if (ride.elapsedSeconds < SHORT_RIDE_MAX_MINUTES * 60) return message("short");
  if (ride.elapsedSeconds >= LONG_RIDE_MIN_MINUTES * 60) return message("long");
  return null;
};
