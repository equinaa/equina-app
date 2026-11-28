import { Platform } from "react-native";
import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { activateKeepAwakeAsync, deactivateKeepAwake } from "expo-keep-awake";
import type { AudioPlayer } from "expo-audio";
import type { RideAlert } from "./ride-plan";
import { notificationRoutes } from "../notifications/notification-routes";

/**
 * How the phone tells a rider the phase changed: a chime and a buzz. The rider
 * is on a horse with the phone in a pocket, so nothing here asks them to look.
 * Nothing is said out loud; the screen names the phase. A new phase and the
 * end of the last one each have their own chime, so the end is heard as the
 * end without looking.
 *
 * Sound is a native module a build from before the ride setup does not have.
 * It loads when a ride opens; without it the ride still buzzes. With the phone
 * locked, JavaScript stops: notifications scheduled for each phase change take
 * over (`scheduleRideAlerts`), with the same two chimes as their sound. While
 * the app is open they stay silent and the chime plays instead: the
 * notification handler (useNotificationTaps, `showsWhileOpen`) shows only the
 * reminders, and nothing at all during a ride.
 */

type AudioModule = typeof import("expo-audio");

type CueKind = "phase" | "done";

let audio: AudioModule | null = null;
let chimes: Record<CueKind, AudioPlayer> | null = null;
// A browser plays a page's sound only once the rider's own tap has played it:
// these are the chimes that were, if any. A page reloaded mid-ride makes new
// ones, silent until a tap plays them (`unlockRideCues`).
let tappedChimes: Record<CueKind, AudioPlayer> | null = null;
// Just past the longer chime (0.81 s, the end): the music the chime turned
// down comes back here.
const chimeOnlyMs = 1000;
let unduckTimer: ReturnType<typeof setTimeout> | null = null;
// The files ship inside the app (app.json, expo-notifications `sounds`), so a
// locked phone plays them too. Their names are what a notification asks for,
// and Android takes only lowercase letters, digits and underscores in them.
const chimeSounds = {
  phase: { file: "ride_phase.wav", asset: require("../../../assets/sounds/ride_phase.wav") },
  done: { file: "ride_done.wav", asset: require("../../../assets/sounds/ride_done.wav") }
} as const;
// Android fixes a channel's sound when it is first made, and the first
// channel played the system sound. New ids carry the chimes; the old one goes.
const alertChannels: Record<CueKind, { id: string; name: string }> = {
  phase: { id: "ride-phase-chime", name: "Ride phases" },
  done: { id: "ride-done-chime", name: "Ride finished" }
};
const retiredAlertChannel = "ride-phases";
const alertRoute = notificationRoutes.ridePhase;

export async function prepareRideCues() {
  audio ??= await import("expo-audio").catch(() => null);
  if (!audio) return;
  if (Platform.OS !== "web") {
    // Heard with the ring switch on silent, and played over the rider's music
    // by turning it down for a moment instead of stopping it.
    await audio.setAudioModeAsync({ playsInSilentMode: true, interruptionMode: "duckOthers" }).catch(() => undefined);
  }
  if (!chimes) {
    try {
      // Kept from closing the audio session on its own when it ends: unduck
      // and releaseRideCues close it, so the music comes back in one place.
      chimes = {
        phase: audio.createAudioPlayer(chimeSounds.phase.asset, { keepAudioSessionActive: true }),
        done: audio.createAudioPlayer(chimeSounds.done.asset, { keepAudioSessionActive: true })
      };
    } catch {
      chimes = null;
    }
  }
}

export function releaseRideCues() {
  if (unduckTimer) clearTimeout(unduckTimer);
  unduckTimer = null;
  chimes?.phase.remove();
  chimes?.done.remove();
  chimes = null;
  tappedChimes = null;
  if (audio && Platform.OS !== "web") {
    // Back to what iOS gives an app that has not asked for anything.
    if (Platform.OS === "ios") void audio.setIsAudioActiveAsync(false).catch(() => undefined);
    void audio.setAudioModeAsync({ playsInSilentMode: false, interruptionMode: "doNotMix" }).catch(() => undefined);
  }
}

const buzz = (kind: CueKind) => {
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

// A browser lets a page play each sound only after a tap has played that same
// sound, so the tap that rings one chime also starts the other one silently.
const prime = (player: AudioPlayer) => {
  try {
    player.volume = 0;
    player.play();
    setTimeout(() => {
      try {
        player.pause();
        player.seekTo(0).catch(() => undefined);
      } finally {
        player.volume = 1;
      }
    }, 60);
  } catch {
    // Not primed: that chime stays silent in this tab until the next tap.
  }
};

const ring = (kind: CueKind, tapped: boolean) => {
  if (!chimes) return;
  const chime = chimes[kind];
  try {
    chime.volume = 1;
    chime.seekTo(0).catch(() => undefined);
    chime.play();
    if (tapped) {
      if (Platform.OS === "web" && tappedChimes !== chimes) prime(chimes[kind === "phase" ? "done" : "phase"]);
      tappedChimes = chimes;
    }
  } catch {
    // A chime that cannot play leaves the buzz.
  }
};

// The chime turns the rider's music down while it plays; this gives it back.
// iOS only: on Android the same call switches expo-audio off for the app, and
// every chime after it would be silent.
function unduck() {
  if (audio && Platform.OS === "ios") void audio.setIsAudioActiveAsync(false).catch(() => undefined);
}

/**
 * A phase begins, or the last one ends. `tapped` when the rider's own tap plays
 * it -- Start training, Skip phase -- which is what lets a browser play the
 * chime at all, then and at every phase change after it.
 */
export function cuePhaseChange(kind: CueKind, tapped = false) {
  buzz(kind);
  ring(kind, tapped);
  // Only the latest chime gives the music back: closing the session pauses
  // every player, so an earlier cue's timer would cut a newer chime short.
  if (unduckTimer) clearTimeout(unduckTimer);
  unduckTimer = setTimeout(() => {
    unduckTimer = null;
    unduck();
  }, chimeOnlyMs);
}

/** Whether the phase changes ahead will be heard without a tap first. Always, on a phone. */
export const rideCuesUnlocked = () => Platform.OS !== "web" || (chimes !== null && chimes === tappedChimes);

/**
 * The rider's tap on "Turn the chime on", for a ride whose page was reloaded
 * (or whose sound had not loaded at Start training): the chime alone, which
 * lets the browser play it at the phase changes ahead. False while the sound
 * has not loaded yet.
 */
export function unlockRideCues() {
  if (Platform.OS !== "web") return true;
  ring("phase", true);
  return rideCuesUnlocked();
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
    await Notifications.deleteNotificationChannelAsync(retiredAlertChannel).catch(() => undefined);
    for (const kind of ["phase", "done"] as const) {
      await Notifications.setNotificationChannelAsync(alertChannels[kind].id, {
        name: alertChannels[kind].name,
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: kind === "done" ? [0, 250, 120, 250, 120, 450] : [0, 300, 140, 300],
        sound: chimeSounds[kind].file
      }).catch(() => undefined);
    }
  }
  const ids: string[] = [];
  for (const alert of alerts) {
    const kind: CueKind = alert.phaseIndex === null ? "done" : "phase";
    try {
      ids.push(await Notifications.scheduleNotificationAsync({
        content: { title: alert.title, body: alert.body, sound: chimeSounds[kind].file, data: { route: alertRoute } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: alert.inSeconds,
          channelId: alertChannels[kind].id
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
