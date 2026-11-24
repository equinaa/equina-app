import assert from "node:assert/strict";
import {
  LONG_RIDE_MIN_MINUTES,
  SHORT_RIDE_MAX_MINUTES,
  rideRecapMessage
} from "../src/features/ride/ride-recap-message";

const minutes = (count: number, seconds = 0) => count * 60 + seconds;

// The limits as they were asked for. Every boundary below is written from the
// constants, so moving a limit means changing the module and these two lines.
assert.equal(SHORT_RIDE_MAX_MINUTES, 15);
assert.equal(LONG_RIDE_MIN_MINUTES, 90);

const shortText =
  "Short ride today! Remember, consistency and enough time in the saddle are key to progress. Try to give yourself a little more time next session.";
const longText =
  "That was a long session! Remember, more isn't always better. Give your horse enough time to rest and recover, and try to keep your next training session more balanced.";

// Short: under 15 minutes. 14:59 is short, 15:00 is not.
const justShort = rideRecapMessage({ elapsedSeconds: minutes(SHORT_RIDE_MAX_MINUTES) - 1 });
assert.equal(justShort?.kind, "short");
assert.equal(justShort?.text, shortText);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(14, 59) })?.kind, "short");
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(SHORT_RIDE_MAX_MINUTES) }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(15, 0) }), null);
// "Finish ride now" straight after the start is still a ride the clock timed.
assert.equal(rideRecapMessage({ elapsedSeconds: 0 })?.kind, "short");
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(5) })?.text, shortText);

// Long: 90 minutes or more. 89:59 is not long, 90:00 is.
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(LONG_RIDE_MIN_MINUTES) - 1 }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(89, 59) }), null);
const justLong = rideRecapMessage({ elapsedSeconds: minutes(LONG_RIDE_MIN_MINUTES) });
assert.equal(justLong?.kind, "long");
assert.equal(justLong?.text, longText);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(90, 0) })?.kind, "long");
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(180) })?.text, longText);

// In between there is no message yet: the recap keeps its own text.
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(16) }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(45) }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(75) }), null);

// A ride with no source is live, as in the journal. Saying so changes nothing.
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(5), source: "live" })?.text, shortText);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(120), source: "live" })?.text, longText);

// An activity logged by hand never gets a message, whatever minutes were typed.
assert.equal(rideRecapMessage({ elapsedSeconds: 0, source: "manual" }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(5), source: "manual" }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(14, 59), source: "manual" }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(45), source: "manual" }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(90), source: "manual" }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: minutes(240), source: "manual" }), null);

// A clock value that is not a number says nothing rather than guessing.
assert.equal(rideRecapMessage({ elapsedSeconds: Number.NaN }), null);
assert.equal(rideRecapMessage({ elapsedSeconds: Number.POSITIVE_INFINITY }), null);

// The recap sets the first line as its title and the advice under it. Read
// together they are the text as given: nothing added, nothing dropped.
assert.equal(justShort?.title, "Short ride today!");
assert.equal(
  justShort?.body,
  "Remember, consistency and enough time in the saddle are key to progress. Try to give yourself a little more time next session."
);
assert.equal(`${justShort?.title} ${justShort?.body}`, shortText);
assert.equal(justLong?.title, "That was a long session!");
assert.equal(
  justLong?.body,
  "Remember, more isn't always better. Give your horse enough time to rest and recover, and try to keep your next training session more balanced."
);
assert.equal(`${justLong?.title} ${justLong?.body}`, longText);

// "isn't" keeps the straight apostrophe (U+0027), not a typographic one an
// editor could slip in, and neither text carries a dash. The characters are
// named by code point so this file cannot be "corrected" the same way.
const straightApostrophe = String.fromCodePoint(0x27);
const curlyQuotes = [0x2018, 0x2019].map((point) => String.fromCodePoint(point));
const dashes = [0x2013, 0x2014].map((point) => String.fromCodePoint(point));
const bothTexts = `${justShort?.text}${justLong?.text}`;
assert.ok(justLong?.text.includes(`isn${straightApostrophe}t`));
assert.equal(justLong?.text.split(straightApostrophe).length, 2);
assert.ok(curlyQuotes.every((quote) => !bothTexts.includes(quote)));
assert.ok(dashes.every((dash) => !bothTexts.includes(dash)));
// Plain ASCII end to end: nothing invisible rides along with the copy.
assert.ok(/^[\x20-\x7E]+$/.test(bothTexts));

console.log("Ride recap message passed.");
