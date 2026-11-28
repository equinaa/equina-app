import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { endRideActivities, showRideActivity } from "./ride-activity-native";
import { rideActivityAttributes, rideActivityContent, rideActivityId } from "./ride-live-activity";
import type { RidePlan, RideRun } from "./ride-plan";

/**
 * The ride in progress on the iPhone lock screen and in the Dynamic Island,
 * owned by the app like the phase cues (useRideCues) rather than by the ride
 * screen, which another tab unmounts mid-ride. It lasts exactly as long as
 * the ride:
 *
 * - shown at the start, or taken back when a ride comes back after a
 *   relaunch (an activity outlives a force quit);
 * - updated on a pause, a resume, a skip, every phase the clock begins while
 *   the app is open, and once the phases are done;
 * - ended at once on Finish (the recap is on screen), End ride without
 *   saving, or signing out.
 *
 * While the phone is locked no update can be sent, and none is needed to stay
 * true: the activity runs its clocks itself (ride-live-activity.ts). The
 * phase notifications stay as they are: they are the only sound a locked
 * phone makes at a phase change.
 *
 * Activities left by a ride that is not coming back are ended by App.tsx
 * where it drops that ride's alerts (`endRideActivities`).
 */
export function useRideLiveActivity(rideActive: boolean, ridePlan: RidePlan | null, rideRun: RideRun | null) {
  const rideId = rideActive && ridePlan && rideRun ? rideActivityId(rideRun) : null;
  // Bumped when the clock reaches the next phase, or the app comes back to
  // the front: the run handed over is not moved on while the ride screen is
  // on another tab, so the time itself has to ask for a new look.
  const [look, setLook] = useState(0);
  // The activity of the ride now: its id once shown, and whether the rider
  // or iOS has ended it (then it is left ended for this ride).
  const shown = useRef<{ rideId: string; id: string | null; gone: boolean } | null>(null);
  const sent = useRef("");
  const rideRef = useRef(rideId);
  rideRef.current = rideId;

  // The ride's life: whatever is showing ends with it.
  useEffect(() => {
    if (!rideId) return;
    return () => {
      shown.current = null;
      sent.current = "";
      void endRideActivities();
    };
  }, [rideId]);

  useEffect(() => {
    if (!rideId || !ridePlan || !rideRun) return;
    const now = Date.now();
    const attributes = rideActivityAttributes(ridePlan, rideRun);
    const content = rideActivityContent(ridePlan, rideRun, now);
    const own = shown.current?.rideId === rideId ? shown.current : null;
    const key = JSON.stringify(content);
    // The same content again (a render for something else) is not sent twice.
    if (attributes && !own?.gone && key !== sent.current) {
      sent.current = key;
      void showRideActivity(attributes, content, own?.id ?? null).then((result) => {
        // The ride ended, or another began, while the call was on its way.
        if (rideRef.current !== rideId) return;
        shown.current = { rideId, id: result.id, gone: result.gone };
        // Not shown this time (no activity yet, or it failed): the next look tries again.
        if (!result.id && !result.gone) sent.current = "";
      });
    }
    // Wake at the current phase's planned end, to show the next one.
    const wake = content.staleDateMs === null ? null : setTimeout(() => setLook((count) => count + 1), Math.max(0, content.staleDateMs - now) + 100);
    return () => {
      if (wake) clearTimeout(wake);
    };
  }, [rideId, ridePlan, rideRun, look]);

  // Back in front after the phone slept through phase changes: shown at once.
  useEffect(() => {
    if (!rideId) return;
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") setLook((count) => count + 1);
    });
    return () => subscription.remove();
  }, [rideId]);
}
