/**
 * The iPhone has one audio session for the whole app, and two things here
 * set it: a ride's chimes (ride-cues.ts: heard on silent, over the rider's
 * music by turning it down) and Ralf's mic (useVoiceInput.ts: recording).
 * This is where they meet, with nothing native of its own: the mic says
 * when it listens, and a running ride says how to put its mode back.
 */

let micListening = false;
let rideMode: (() => Promise<void>) | null = null;

/** Ralf's mic starts or stops listening: while it does, a chime never switches the session away from it. */
export function setRideMicListening(listening: boolean) {
  micListening = listening;
}

export const rideMicListening = () => micListening;

/** Set by ride-cues.ts while a ride's chimes are loaded, and cleared as they go. */
export function registerRideAudioMode(apply: (() => Promise<void>) | null) {
  rideMode = apply;
}

/** The ride's mode again, when a ride is running and the mic is not listening. */
export async function applyRideAudioMode() {
  if (micListening || !rideMode) return;
  await rideMode();
}
