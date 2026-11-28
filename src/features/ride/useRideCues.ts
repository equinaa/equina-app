import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";
import {
  cancelRideAlerts,
  cancelStaleRideAlerts,
  cuePhaseChange,
  holdScreenAwake,
  prepareRideCues,
  releaseRideCues,
  scheduleRideAlerts
} from "./ride-cues";
import {
  isRunning,
  nextRideCue,
  rideScheduleKey,
  syncRun,
  upcomingRideAlerts,
  watchRideCues,
  type RideCueWatch,
  type RidePlan,
  type RideRun
} from "./ride-plan";

/**
 * The phase cues of the ride in progress, owned by the app rather than the
 * ride screen. The tab dock stays up during a ride, and another tab unmounts
 * the ride screen: when it owned them, its cleanup cancelled the alerts for a
 * locked phone and its clock stopped chiming, so a rider who looked at the
 * Stable mid-ride heard nothing for the rest of it. Here they last exactly as
 * long as the ride, on every tab:
 *
 * - the notifications for a locked phone, scheduled at the start, rebuilt on
 *   a pause, a resume or a skip, and cancelled once at the end: Finish, End
 *   ride without saving, or signing out;
 * - the chime and the buzz when the clock moves to a new phase with the app
 *   open (a skip rings inside its own tap, on the ride screen);
 * - the screen held on when no notification can reach a locked phone.
 *
 * `run` is the ride as last handed over, which the ride screen moves on only
 * while it is up. Nothing here trusts its phase index: the alerts are
 * scheduled from where the clock has the ride now (`syncRun`), and the chime
 * follows the ride's own clock through the changes it planned
 * (`nextRideCue`).
 */

const tickMs = 250;
// A gap this long between looks means the phone slept. On a phone, a phase
// that began meanwhile was already announced by its notification, so it is
// not said again. A browser sends none: there the chime waits for the page.
const sleptMs = 2_500;

export function useRideCues(rideActive: boolean, ridePlan: RidePlan | null, rideRun: RideRun | null) {
  const live = rideActive && ridePlan !== null && rideRun !== null;
  const planRef = useRef(ridePlan);
  planRef.current = ridePlan;
  const runRef = useRef(rideRun);
  runRef.current = rideRun;
  const liveRef = useRef(live);
  liveRef.current = live;
  const alertIds = useRef<string[]>([]);
  // Scheduling and cancelling wait their turn, so an end that comes while
  // alerts are still being scheduled cancels those too.
  const alertQueue = useRef<Promise<void>>(Promise.resolve());
  const watch = useRef<RideCueWatch | null>(null);
  const lastLook = useRef(0);
  // A chime owed by a phase that changed while the page was hidden. Browsers
  // send no notification, so it plays when the rider looks again.
  const owedCue = useRef<"phase" | "done" | null>(null);

  const queueAlerts = (job: () => Promise<void>) => {
    alertQueue.current = alertQueue.current.catch(() => undefined).then(job);
  };

  // The ride's life. Alerts left by an earlier launch go first, so a ride
  // brought back never has its phases called twice.
  useEffect(() => {
    if (!live) return;
    void prepareRideCues();
    queueAlerts(cancelStaleRideAlerts);
    const releaseScreen = holdScreenAwake();
    return () => {
      releaseScreen();
      releaseRideCues();
      watch.current = null;
      owedCue.current = null;
      queueAlerts(async () => {
        const ids = alertIds.current;
        alertIds.current = [];
        await cancelRideAlerts(ids);
      });
    };
  }, [live]);

  // What a locked phone is told: every phase change still ahead. The key
  // moves only when the times ahead do (a start, a pause, a resume, a skip),
  // whether or not the run handed over has caught up with the clock, so a
  // phase running out on time never cancels the alert about to tell of it.
  const phases = ridePlan?.phases;
  const scheduleKey = rideActive && ridePlan && rideRun ? rideScheduleKey(rideRun, ridePlan.phases) : "stopped";
  useEffect(() => {
    if (!live) return;
    queueAlerts(async () => {
      const previous = alertIds.current;
      alertIds.current = [];
      await cancelRideAlerts(previous);
      const plan = planRef.current;
      const run = runRef.current;
      if (!liveRef.current || !plan || !run) return;
      const now = Date.now();
      alertIds.current = await scheduleRideAlerts(upcomingRideAlerts(syncRun(run, plan.phases, now).run, plan.phases, now));
    });
  }, [live, scheduleKey, phases]);

  // The chime with the app open. Time comes from timestamps; the interval
  // only wakes to notice when a phase's minutes are up. Nothing is set in
  // state, so the app does not render on every look.
  const running = rideRun !== null && isRunning(rideRun);
  useEffect(() => {
    if (!live) return;
    const look = (now: number) => {
      const plan = planRef.current;
      const run = runRef.current;
      if (!plan || !run) return;
      const slept = now - lastLook.current > sleptMs;
      lastLook.current = now;
      const step = nextRideCue(watch.current ?? watchRideCues(run, now), run, plan.phases, now);
      watch.current = step.watch;
      const hidden = AppState.currentState === "background";
      if (Platform.OS === "web") {
        // A hidden tab or a locked phone hears nothing from a browser; the
        // cue is kept for the moment the page is seen again.
        if (hidden) {
          if (step.cue) owedCue.current = step.cue;
          return;
        }
        const owed = step.cue ?? owedCue.current;
        owedCue.current = null;
        if (owed) cuePhaseChange(owed);
        return;
      }
      // Out of sight -- locked, or another app in front -- the notification
      // already told the rider; a second chime from the background would not.
      // "inactive" (Control Center pulled down) still runs and still chimes.
      if (!step.cue || slept || hidden) return;
      cuePhaseChange(step.cue);
    };
    lastLook.current = Date.now();
    look(lastLook.current);
    const interval = running ? setInterval(() => look(Date.now()), tickMs) : null;
    // Back in front: a browser plays the chime a hidden phase change owed.
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") look(Date.now());
    });
    return () => {
      if (interval) clearInterval(interval);
      subscription.remove();
    };
  }, [live, running]);
}
