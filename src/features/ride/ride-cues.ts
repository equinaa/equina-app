import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import type { AudioPlayer } from "expo-audio";
import type { RideAlert } from "./ride-plan";

/**
 * How the phone tells a rider the phase changed: a chime, a buzz, and the next
 * phase said out loud. The rider is on a horse with the phone in a pocket, so
 * nothing here asks them to look.
 *
 * Speech and sound are native modules a build from before the ride setup does
 * not have. They load when a ride opens; without them the ride still buzzes.
 * With the phone locked, JavaScript stops: notifications scheduled for each
 * phase change take over (`scheduleRideAlerts`). No notification handler is
 * set, so while the app is open they stay silent and the voice speaks instead.
 */

type SpeechModule = typeof import("expo-speech");
type AudioModule = typeof import("expo-audio");

let speech: SpeechModule | null = null;
let audio: AudioModule | null = null;
let chime: AudioPlayer | null = null;
const speechDelayMs = 450;
// Just past the 0.62 s chime: when nothing is said after it, the music comes back here.
const chimeOnlyMs = 800;
const alertChannel = "ride-phases";
const alertRoute = "ride-phase";

export async function prepareRideCues() {
  speech ??= await import("expo-speech").catch(() => null);
  audio ??= await import("expo-audio").catch(() => null);
  if (!audio) return;
  if (Platform.OS !== "web") {
    // Heard with the ring switch on silent, and spoken over the rider's music
    // by turning it down for a moment instead of stopping it.
    await audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "duckOthers" }).catch(() => undefined);
  }
  if (!chime) {
    try {
      // Kept from closing the audio session when it ends: by default expo-audio
      // closes it 0.1 s after the chime, which cut the voice off mid-sentence.
      // The voice and releaseRideCues close it instead.
      chime = audio.createAudioPlayer(require("../../../assets/sounds/ride-phase.wav"), { keepAudioSessionActive: true });
    } catch {
      chime = null;
    }
  }
}

export function releaseRideCues() {
  void speech?.stop().catch(() => undefined);
  chime?.remove();
  chime = null;
  if (audio && Platform.OS !== "web") {
    // Back to what iOS gives an app that has not asked for anything.
    void audio.setIsAudioActiveAsync(false).catch(() => undefined);
    void audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "doNotMix" }).catch(() => undefined);
  }
}

const buzz = (kind: "phase" | "done") => {
  if (Platform.OS === "web") {
    // Android browsers vibrate; Safari has no vibration and skips it.
    const navigatorWithVibrate = globalThis.navigator as { vibrate?: (pattern: number[]) => boolean } | undefined;
    try {
      navigatorWithVibrate?.vibrate?.(kind === "done" ? [250, 120, 250, 120, 450] : [300, 140, 300]);
    } catch {
      // Vibration is a bonus, never a failure.
    }
    return;
  }
  void Haptics.notificationAsync(
    kind === "done" ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Warning
  ).catch(() => undefined);
  // One pattern is easy to miss at the trot; a second makes it a signal.
  setTimeout(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => undefined);
  }, 420);
};

const ring = () => {
  if (!chime) return;
  try {
    chime.seekTo(0).catch(() => undefined);
    chime.play();
  } catch {
    // A chime that cannot play leaves the buzz and the voice.
  }
};

// Each utterance gives the music back only if it is still the one speaking:
// stopping the last words to say new ones must not close the session the new
// ones are about to use.
let currentUtterance = 0;

const say = (text: string) => {
  if (!speech) return;
  const mine = ++currentUtterance;
  const finished = () => {
    if (mine === currentUtterance) unduck();
  };
  try {
    void speech.stop().catch(() => undefined);
    speech.speak(text, {
      language: "en-GB",
      // A touch slower than normal: heard over hooves and wind.
      rate: 0.95,
      onDone: finished,
      onStopped: finished,
      onError: finished
    });
  } catch {
    // The chime and the buzz already said it.
  }
};

// The voice turns the rider's music down while it speaks; this gives it back.
function unduck() {
  if (audio && Platform.OS !== "web") void audio.setIsAudioActiveAsync(false).catch(() => undefined);
}

/**
 * The rider's own tap on Start: Safari only lets a page speak if the first
 * words come straight from a tap, so these are said at once, without waiting
 * for the chime.
 */
export function cueFromTap(text: string, voice: boolean) {
  buzz("phase");
  ring();
  if (voice) say(text);
  else setTimeout(unduck, chimeOnlyMs);
}

/** A phase change the clock made. The chime first, then the words. */
export function cueFromClock(text: string, voice: boolean, kind: "phase" | "done") {
  buzz(kind);
  ring();
  if (voice) setTimeout(() => say(text), speechDelayMs);
  else setTimeout(unduck, chimeOnlyMs);
}

/**
 * Turning the voice back on is a tap, and Safari only lets a page speak from
 * one: saying so here keeps the next phase change audible in the browser.
 */
export function cueVoiceOn() {
  say("Voice on.");
}

export function silenceRideCues() {
  void speech?.stop().catch(() => undefined);
}

// Locked phone ---------------------------------------------------------------

/** Whether alerts can reach a locked phone. Asks once, from the setup sheet, never mid-ride. */
export async function rideAlertsAllowed(ask: boolean) {
  if (Platform.OS === "web") return false;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    if (!ask || !current.canAskAgain) return false;
    return (await Notifications.requestPermissionsAsync()).granted;
  } catch {
    return false;
  }
}

export async function scheduleRideAlerts(alerts: RideAlert[]): Promise<string[]> {
  if (Platform.OS === "web" || alerts.length === 0 || !(await rideAlertsAllowed(false))) return [];
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(alertChannel, {
      name: "Ride phases",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 300, 140, 300],
      sound: "default"
    }).catch(() => undefined);
  }
  const ids: string[] = [];
  for (const alert of alerts) {
    try {
      ids.push(await Notifications.scheduleNotificationAsync({
        content: { title: alert.title, body: alert.body, sound: true, data: { route: alertRoute } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: alert.inSeconds,
          channelId: alertChannel
        }
      }));
    } catch {
      // One alert that could not be scheduled does not stop the others.
    }
  }
  return ids;
}

export async function cancelRideAlerts(ids: string[]) {
  if (Platform.OS === "web") return;
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined)));
}

/** Alerts left behind by a ride the app never finished -- closed mid-ride, or a crash. */
export async function cancelStaleRideAlerts() {
  if (Platform.OS === "web") return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await cancelRideAlerts(
      scheduled.filter((request) => request.content.data?.route === alertRoute).map((request) => request.identifier)
    );
  } catch {
    // Nothing scheduled, or nothing to read it with.
  }
}

// Browser --------------------------------------------------------------------

type WakeLockSentinel = { release: () => Promise<void> };
type WakeLockNavigator = { wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> } };
type VisibilityDocument = {
  visibilityState?: string;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};

/**
 * Without notifications a locked phone says nothing, so the screen stays on
 * while the ride runs: always in a browser, and on a phone when the rider
 * said no to notifications. With them allowed the phone may lock as usual --
 * a screen left on in a pocket gets tapped. Returns the release.
 */
export function holdScreenAwake(): () => void {
  if (Platform.OS !== "web") {
    const tag = "equina-ride";
    let held = false;
    let released = false;
    void rideAlertsAllowed(false).then(async (allowed) => {
      if (allowed || released) return;
      await activateKeepAwakeAsync(tag);
      held = true;
      if (released) void deactivateKeepAwake(tag).catch(() => undefined);
    }).catch(() => undefined);
    return () => {
      released = true;
      if (held) void deactivateKeepAwake(tag).catch(() => undefined);
    };
  }
  // Browsers drop the lock when the tab is hidden; it is taken again when the
  // rider comes back.
  const wakeLock = (globalThis.navigator as WakeLockNavigator | undefined)?.wakeLock;
  const page = (globalThis as { document?: VisibilityDocument }).document;
  if (!wakeLock || !page) return () => undefined;
  let sentinel: WakeLockSentinel | null = null;
  let released = false;
  const acquire = async () => {
    try {
      const next = await wakeLock.request("screen");
      if (released) void next.release().catch(() => undefined);
      else sentinel = next;
    } catch {
      // Low battery mode, or a browser that says no: the ride runs anyway.
    }
  };
  const onVisible = () => {
    if (page.visibilityState === "visible") void acquire();
  };
  void acquire();
  page.addEventListener?.("visibilitychange", onVisible);
  return () => {
    released = true;
    page.removeEventListener?.("visibilitychange", onVisible);
    void sentinel?.release().catch(() => undefined);
  };
}
