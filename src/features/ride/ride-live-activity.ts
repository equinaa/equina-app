import { rideElapsedMs, syncRun, type RidePlan, type RideRun } from "./ride-plan";

/**
 * The ride on the iPhone lock screen and in the Dynamic Island (a Live
 * Activity), as data. The widget extension in targets/ride-activity draws
 * it; its RideActivityAttributes.swift decodes exactly these fields, so a
 * change here goes there too (and into the app's copy in
 * modules/ride-activity/ios). Everything here is pure: useRideLiveActivity
 * hands it to the phone.
 *
 * While the phone is locked no Equina code runs, so the activity is only
 * updated on a tap or while the app is open. What it shows has to stay true
 * without that: the ride clock and the phase countdown run by themselves from
 * clock times given here, and the phase name is right until the stale date,
 * the current phase's planned end. After it, the widget switches to the clock
 * times of the phases ahead, which hold whichever one is on.
 *
 * Times are epoch ms on the ride clock's own frame: `clockStartMs` is where
 * the ride clock reads zero with the pauses left out, and a phase at ride
 * time t is at `clockStartMs + t`. For the phase now and the ones ahead that
 * is the wall-clock time they start if the clock keeps running; for phases
 * already ridden it places them on the whole-ride bar, which counts ride time
 * as the ride screen does.
 */

/** What the activity is for, fixed when it starts. */
export type RideActivityAttributes = {
  /** The ride's start, epoch ms: how the app finds its activity again after a relaunch. */
  rideId: string;
  /** Empty for a ride with no horse. */
  horseName: string;
  training: string;
  phases: { title: string; detail: string; minutes: number }[];
};

/** What the activity shows now, updated on every change of the ride's clock. */
export type RideActivityState = {
  phaseIndex: number;
  /** Paused, or brought back after its planned end, the clock is stopped. */
  clockRunning: boolean;
  /** Every phase has had its time. The clock still runs until Finish. */
  phasesDone: boolean;
  clockStartMs: number;
  /** The ride clock while it is stopped. Zero while it runs. */
  elapsedMs: number;
  /** When each phase begins on the ride clock's frame, one for every phase. */
  phaseStartMs: number[];
  /** When the planned time runs out on that frame. */
  endMs: number;
};

export type RideActivityContent = {
  state: RideActivityState;
  /**
   * When what the activity says stops being certain: the current phase's
   * planned end, while the clock runs. Null when nothing moves by itself
   * (paused, or every phase done).
   */
  staleDateMs: number | null;
};

const minuteMs = 60_000;

/** The activity's id for a ride, or null for one not started. */
export const rideActivityId = (run: RideRun) => (run.startedAt === null ? null : String(run.startedAt));

export const rideActivityAttributes = (plan: RidePlan, run: RideRun): RideActivityAttributes | null => {
  const rideId = rideActivityId(run);
  if (!rideId) return null;
  return {
    rideId,
    horseName: plan.horseName.trim(),
    training: plan.trainingType.label,
    phases: plan.phases.map((phase) => ({
      title: phase.title,
      detail: phase.detail,
      // Whole minutes: the widget reads an integer, and a stored plan is not rounded.
      minutes: Math.round(phase.minutes)
    }))
  };
};

/**
 * The wall-clock moment a stopped clock stopped: the last pause, or the end of
 * a ride brought back after its planned time. A run kept by an app from before
 * the timeline has no marks; its stand-in is fixed, so the content does not
 * change from one look to the next.
 */
const stoppedAt = (run: RideRun) => {
  const marks = run.marks ?? [];
  for (let index = marks.length - 1; index >= 0; index -= 1) {
    const mark = marks[index]!;
    if (mark.kind === "pause" || mark.kind === "end") return mark.at;
  }
  return run.endedAt ?? (run.startedAt ?? 0) + run.bankedMs;
};

/**
 * The activity for the ride as the clock has it at `now`. The run handed over
 * may be behind the clock (the ride screen moves it on only while it is up),
 * so it is moved on first, as the alerts are.
 */
export const rideActivityContent = (plan: RidePlan, run: RideRun, now: number): RideActivityContent => {
  const phases = plan.phases;
  const current = syncRun(run, phases, now).run;
  const clockRunning = current.runningSince !== null;
  const elapsed = rideElapsedMs(current, now);
  // Ride time: where each phase began, then where the ones ahead begin if
  // the clock keeps running from where it is.
  const rideStarts: number[] = [];
  let at = 0;
  for (let index = 0; index < phases.length; index += 1) {
    const reached = index <= current.phaseIndex ? current.phaseStarts[index] : undefined;
    at = reached ?? at;
    rideStarts.push(at);
    at += (phases[index]?.minutes ?? 0) * minuteMs;
  }
  const rideEnd = at;
  const clockStartMs = clockRunning ? current.runningSince! - current.bankedMs : stoppedAt(current) - elapsed;
  const phasesDone = current.phasesDone;
  const nextStart = rideStarts[current.phaseIndex + 1] ?? rideEnd;
  return {
    state: {
      phaseIndex: current.phaseIndex,
      clockRunning,
      phasesDone,
      clockStartMs,
      elapsedMs: clockRunning ? 0 : elapsed,
      phaseStartMs: rideStarts.map((start) => clockStartMs + start),
      endMs: clockStartMs + rideEnd
    },
    staleDateMs: clockRunning && !phasesDone ? clockStartMs + nextStart : null
  };
};

/** The link the activity opens: the ride screen. */
export const rideActivityLink = "equina://ride";

/** Whether an incoming URL is the activity's own, to bring the ride in front. */
export const isRideActivityLink = (url: string | null | undefined) =>
  typeof url === "string" && /^equina:\/\/ride\/?(?:[?#].*)?$/i.test(url.trim());
