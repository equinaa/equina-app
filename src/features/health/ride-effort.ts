import type { RidePhaseEntry } from "../../backend";
import type { RidePhaseWindows, RideWindow } from "../ride/ride-plan";

/**
 * The rider's effort during one ride, worked out from what Apple Health
 * holds for the ride's time: heart-rate readings, and active calories.
 * Pure, so every number and every word on the "Your effort" card is tested.
 *
 * Nothing here is kept: the readings are read on the phone when a ride
 * opens and live in memory only (useRideEffort.ts). The numbers are the
 * rider's, never the horse's, and the words say so where it could be unclear.
 */

/** One heart-rate reading, at a moment on the wall clock (epoch ms). */
export type HeartRateReading = { at: number; bpm: number };

/** Active energy recorded over a stretch of the wall clock, from one source. */
export type EnergyReading = { start: number; end: number; kcal: number };

/** A workout from the watch (dense readings) or the readings Apple Health had anyway. */
export type EffortCapture = "watch-workout" | "samples";

/** What Apple Health gave for a ride's time, before any arithmetic. */
export type RideEffortReading = {
  capture: EffortCapture;
  /** "Apple Watch", "Oura": a device or an app, never a person's device name. */
  sourceLabel?: string;
  heartRate: readonly HeartRateReading[];
  /** A total for the ride when Apple Health has one: a workout's, or the sum over the ride. */
  activeKcal?: number;
  /**
   * Who estimated those calories, when one source did: the workout's app or
   * device ("Apple Watch", "Equilab"). Unset for Apple Health's sum over the
   * ride, which counts every source (the iPhone, a ring, a watch) once.
   */
  kcalSource?: string;
  /** Energy readings, prorated by their overlap with the ride when there is no total. */
  energy?: readonly EnergyReading[];
};

export type RidePhaseEffort = {
  phaseIndex: number;
  avgBpm: number | null;
  maxBpm: number | null;
  /** Readings that count towards this phase. */
  readings: number;
  /** Time of the phase with a reading within a minute. */
  coveredMs: number;
  /** Time the phase was ridden (its windows, pauses left out). */
  riddenMs: number;
};

export type RideEffortPoint = { at: number; bpm: number };

export type RideEffort = {
  capture: EffortCapture;
  sourceLabel?: string;
  /** Who estimated the calories, when one source did (RideEffortReading). */
  kcalSource?: string;
  /** The ride, start to end on the wall clock. */
  window: RideWindow;
  /** Readings that count: inside the ridden time, or within a minute of it. */
  readings: number;
  avgBpm: number | null;
  maxBpm: number | null;
  /** When the highest reading was, for the chart's marker. */
  maxAt: number | null;
  minBpm: number | null;
  activeKcal: number | null;
  /** Share of the ridden time with a reading within a minute, 0 to 1. */
  coverage: number;
  /** The usual time between two readings; null below two. */
  typicalGapMs: number | null;
  /** About one reading a minute or more often: a workout on the watch. */
  dense: boolean;
  phases: RidePhaseEffort[];
  /** The line to draw, in runs: a run ends where the readings stopped. */
  series: RideEffortPoint[][];
  /** The longest stretch of riding with no reading, and the phase most of it fell in. */
  longestGap: { ms: number; phaseIndex: number | null } | null;
};

/** What the card can show. */
export type RideEffortState =
  /** Nothing at all for the ride's time. */
  | "none"
  /** A few readings, or calories alone: the numbers, no chart. */
  | "few"
  /** Readings minutes apart (no workout running): dots, and a word that short efforts may not show. */
  | "sparse"
  /** A workout's readings, seconds apart: the full line. */
  | "dense";

/** A reading stands for the minute on either side of it, never more. */
export const READING_REACH_MS = 60_000;
/** Readings this close together, or closer, draw a line; further apart, dots. */
export const DENSE_GAP_MS = 60_000;
/** Below this many readings there is no chart: a line through three dots says more than they do. */
export const MIN_CHART_READINGS = 6;
/** About one point every 2 pt on a phone-wide chart. */
export const MAX_SERIES_POINTS = 240;
const MIN_STEP_MS = 15_000;
/** A gap this long in a workout's readings is named under the chart. */
export const GAP_NOTE_MS = 3 * 60_000;
/** A watch syncs a little after the ride: until then "nothing yet" is not "nothing". */
export const WATCH_WAIT_MS = 60 * 60_000;
const MIN_BPM = 25;
const MAX_BPM = 250;

const overlap = (a: RideWindow, b: RideWindow) => Math.max(0, Math.min(a.end, b.end) - Math.max(a.start, b.start));
const overlapWith = (a: RideWindow, windows: readonly RideWindow[]) =>
  windows.reduce((sum, window) => sum + overlap(a, window), 0);

/** Windows in time order, touching or overlapping ones joined. */
export const mergeWindows = (windows: readonly RideWindow[]): RideWindow[] => {
  const sorted = windows.filter((window) => window.end > window.start).sort((a, b) => a.start - b.start);
  const merged: RideWindow[] = [];
  for (const window of sorted) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  return merged;
};

/**
 * The time the ride was ridden: its phases' windows, inside the ride. A ride
 * without phases (from before ride setup) was ridden from start to end.
 */
export const riddenWindows = (window: RideWindow, phases: readonly RidePhaseWindows[]): RideWindow[] => {
  const clipped = phases.flatMap((phase) =>
    phase.windows
      .map((each) => ({ start: Math.max(each.start, window.start), end: Math.min(each.end, window.end) }))
      .filter((each) => each.end > each.start)
  );
  if (clipped.length) return mergeWindows(clipped);
  return window.end > window.start ? [{ ...window }] : [];
};

/** A moment belongs to the phase that starts at it, not the one that ends there. */
const takenIn = (windows: readonly RideWindow[], at: number) =>
  windows.some((window) => at >= window.start && at < window.end);

const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
};

/** Readings in time order, plausible ones only; two at the same moment become their average. */
const cleanReadings = (readings: readonly HeartRateReading[]): HeartRateReading[] => {
  const sorted = readings
    .filter((reading) => Number.isFinite(reading.at) && Number.isFinite(reading.bpm) && reading.bpm >= MIN_BPM && reading.bpm <= MAX_BPM)
    .sort((a, b) => a.at - b.at);
  const merged: Array<{ at: number; sum: number; count: number }> = [];
  for (const reading of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.at === reading.at) {
      last.sum += reading.bpm;
      last.count += 1;
    } else merged.push({ at: reading.at, sum: reading.bpm, count: 1 });
  }
  return merged.map(({ at, sum, count }) => ({ at, bpm: sum / count }));
};

/** Active calories over the ride: the total when there is one, else the readings prorated by overlap. */
const kcalOf = (reading: RideEffortReading, window: RideWindow) => {
  if (reading.activeKcal !== undefined && Number.isFinite(reading.activeKcal) && reading.activeKcal > 0) return Math.round(reading.activeKcal);
  const energy = reading.energy ?? [];
  const sum = energy.reduce((total, each) => {
    if (!Number.isFinite(each.kcal) || each.kcal <= 0) return total;
    if (each.end <= each.start) return each.start >= window.start && each.start <= window.end ? total + each.kcal : total;
    return total + (each.kcal * overlap(each, window)) / (each.end - each.start);
  }, 0);
  return sum >= 1 ? Math.round(sum) : null;
};

const weightedAverage = (pairs: Array<{ weight: number; bpm: number }>) => {
  const weight = pairs.reduce((sum, pair) => sum + pair.weight, 0);
  return weight > 0 ? Math.round(pairs.reduce((sum, pair) => sum + pair.weight * pair.bpm, 0) / weight) : null;
};

/** One point per step of the clock, the readings in it averaged. */
const downsample = (readings: HeartRateReading[], start: number, step: number): RideEffortPoint[] => {
  if (step <= 0) return readings.map((reading) => ({ at: reading.at, bpm: Math.round(reading.bpm) }));
  const buckets = new Map<number, { at: number; bpm: number; count: number }>();
  for (const reading of readings) {
    const key = Math.floor((reading.at - start) / step);
    const bucket = buckets.get(key) ?? { at: 0, bpm: 0, count: 0 };
    bucket.at += reading.at;
    bucket.bpm += reading.bpm;
    bucket.count += 1;
    buckets.set(key, bucket);
  }
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, bucket]) => ({ at: Math.round(bucket.at / bucket.count), bpm: Math.round(bucket.bpm / bucket.count) }));
};

/**
 * The effort of one ride. Each reading stands for the stretch of riding
 * nearest to it, up to a minute either side: that is what the averages are
 * weighted by and what the coverage counts, so a phase's average is over the
 * time that was measured, the ride's average agrees with its phases', and a
 * pause (not ridden) counts for nothing. The true highest reading is kept
 * apart from the chart's points, so thinning the line never hides the peak.
 */
export const summarizeRideEffort = (
  reading: RideEffortReading,
  window: RideWindow,
  phases: readonly RidePhaseWindows[],
  {
    exact = true
  }: {
    /**
     * The phases' windows are the clock's own (timed on this phone). False
     * when they are only each phase's minutes laid back to back from the
     * start: a break then sits somewhere unknown, so the whole ride counts as
     * ridden, and the windows only say which phase a reading belongs to.
     */
    exact?: boolean;
  } = {}
): RideEffort => {
  const ridden = exact ? riddenWindows(window, phases) : window.end > window.start ? [{ ...window }] : [];
  const riddenMs = ridden.reduce((sum, each) => sum + (each.end - each.start), 0);
  const phaseWindows = phases.map((phase) => ({
    phaseIndex: phase.phaseIndex,
    windows: mergeWindows(phase.windows.map((each) => ({ start: Math.max(each.start, window.start), end: Math.min(each.end, window.end) })))
  }));

  const clean = cleanReadings(reading.heartRate);
  // The stretch each reading stands for: halfway to its neighbours, a minute at most.
  const reach = clean.map((each, index) => ({
    reading: each,
    span: {
      start: Math.max(each.at - READING_REACH_MS, index > 0 ? (clean[index - 1]!.at + each.at) / 2 : Number.NEGATIVE_INFINITY),
      end: Math.min(each.at + READING_REACH_MS, index < clean.length - 1 ? (each.at + clean[index + 1]!.at) / 2 : Number.POSITIVE_INFINITY)
    }
  }));
  const counted = reach
    .map((each) => ({ ...each, weight: overlapWith(each.span, ridden) }))
    .filter((each) => each.weight > 0);

  const coveredMs = counted.reduce((sum, each) => sum + each.weight, 0);
  const avgBpm = weightedAverage(counted.map((each) => ({ weight: each.weight, bpm: each.reading.bpm })));
  const highest = counted.reduce<HeartRateReading | null>((best, each) => (!best || each.reading.bpm > best.bpm ? each.reading : best), null);
  const lowest = counted.reduce<number | null>((low, each) => (low === null || each.reading.bpm < low ? each.reading.bpm : low), null);

  // A phase's numbers are the readings taken in it. The minute a reading
  // reaches across a phase change counts towards that phase's coverage, never
  // towards its average or its highest: the trot's first reading is not the walk's.
  const phaseEfforts: RidePhaseEffort[] = phaseWindows.map((phase) => {
    const taken = counted.filter((each) => takenIn(phase.windows, each.reading.at));
    return {
      phaseIndex: phase.phaseIndex,
      avgBpm: weightedAverage(taken.map((each) => ({ weight: each.weight, bpm: each.reading.bpm }))),
      maxBpm: taken.length ? Math.round(Math.max(...taken.map((each) => each.reading.bpm))) : null,
      readings: taken.length,
      coveredMs: counted.reduce((sum, each) => sum + overlapWith(each.span, phase.windows), 0),
      riddenMs: phase.windows.reduce((sum, each) => sum + (each.end - each.start), 0)
    };
  });

  const times = counted.map((each) => each.reading.at);
  const typicalGapMs = median(times.slice(1).map((at, index) => at - times[index]!));
  const dense = typicalGapMs !== null && typicalGapMs <= DENSE_GAP_MS && counted.length >= MIN_CHART_READINGS;

  // Thinned to a point every 15 s or more for a workout; readings minutes
  // apart are drawn as they are, unless a long ride has too many even so.
  const span = window.end - window.start;
  const step = dense
    ? Math.max(MIN_STEP_MS, Math.ceil(span / MAX_SERIES_POINTS / 5000) * 5000)
    : counted.length > MAX_SERIES_POINTS ? Math.ceil(span / MAX_SERIES_POINTS) : 0;
  const points = downsample(counted.map((each) => each.reading), window.start, step);
  // A workout's line breaks where the readings stop for over a minute;
  // readings minutes apart are joined unless one is missing (3 times the usual gap).
  const breakAfter = dense ? DENSE_GAP_MS : Math.max(DENSE_GAP_MS, 3 * (typicalGapMs ?? 0));
  const series: RideEffortPoint[][] = [];
  for (const point of points) {
    const run = series[series.length - 1];
    const last = run?.[run.length - 1];
    if (run && last && point.at - last.at <= breakAfter) run.push(point);
    else series.push([point]);
  }

  // Gaps in riding time: before the first reading, between two, after the last.
  let longestGap: RideEffort["longestGap"] = null;
  if (counted.length && riddenMs > 0) {
    const edges = [ridden[0]!.start, ...times, ridden[ridden.length - 1]!.end];
    for (let index = 1; index < edges.length; index += 1) {
      const gap = { start: edges[index - 1]!, end: edges[index]! };
      const ms = overlapWith(gap, ridden);
      if (!longestGap || ms > longestGap.ms) {
        const most = phaseWindows
          .map((phase) => ({ phaseIndex: phase.phaseIndex, ms: overlapWith(gap, phase.windows) }))
          .sort((a, b) => b.ms - a.ms)[0];
        // Without the clock's windows a gap may be the break itself: it is
        // named for no phase.
        longestGap = { ms, phaseIndex: exact && most && most.ms > 0 ? most.phaseIndex : null };
      }
    }
  }

  return {
    capture: reading.capture,
    ...(reading.sourceLabel ? { sourceLabel: reading.sourceLabel } : {}),
    ...(reading.kcalSource && kcalOf(reading, window) !== null ? { kcalSource: reading.kcalSource } : {}),
    window: { ...window },
    readings: counted.length,
    avgBpm,
    maxBpm: highest ? Math.round(highest.bpm) : null,
    maxAt: highest ? highest.at : null,
    minBpm: lowest === null ? null : Math.round(lowest),
    activeKcal: kcalOf(reading, window),
    coverage: riddenMs > 0 ? Math.min(1, coveredMs / riddenMs) : 0,
    typicalGapMs,
    dense,
    phases: phaseEfforts,
    series,
    longestGap
  };
};

/** Whether there is anything to show, and how much of it. */
export const rideEffortState = (effort: RideEffort): RideEffortState => {
  if (effort.readings === 0) return effort.activeKcal !== null ? "few" : "none";
  if (effort.readings < MIN_CHART_READINGS) return "few";
  return effort.dense ? "dense" : "sparse";
};

// Words ------------------------------------------------------------------------------

/** How the ride's phases were placed on the clock. */
export type PhasePlacement =
  /** Timed on this phone: each phase's windows as the clock ran. */
  | "timed"
  /** Timed on another phone, or before the timeline existed: each phase's minutes, back to back. */
  | "estimated"
  /** Added by hand: the minutes the rider typed. */
  | "typed";

const pad = (value: number) => String(value).padStart(2, "0");

/** "20:05", the phone's local time. */
export const clockLabel = (ms: number) => {
  const date = new Date(ms);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

/** What a phase is called on the card and to Ralf: "Walk" for the pre warm-up, the training's name for the training. */
export const effortPhaseName = (phase: Pick<RidePhaseEntry, "title" | "detail"> | undefined, index: number) =>
  phase?.detail?.trim() || phase?.title?.trim() || `Phase ${index + 1}`;

const minutesWord = (ms: number) => {
  const minutes = Math.max(1, Math.round(ms / 60_000));
  return `${minutes} min`;
};

export type EffortMessage = { title: string; body: string };

/**
 * The card with nothing to show. Equina cannot tell a refused read from no
 * data (Apple Health keeps that to itself), so the words cover both; right
 * after a ride, the watch may simply not have synced yet.
 */
export const noEffortMessage = ({
  window,
  manual,
  now
}: {
  window: RideWindow;
  manual: boolean;
  now: number;
}): EffortMessage & { waiting: boolean } => {
  const span = `${clockLabel(window.start)} to ${clockLabel(window.end)}`;
  // No reading at all, so no source to name: a watch, a strap or nothing.
  if (!manual && now >= window.end && now - window.end < WATCH_WAIT_MS) {
    return {
      title: "No heart rate yet",
      body: "It can take a few minutes to reach Apple Health after the ride.",
      waiting: true
    };
  }
  return manual
    ? { title: "No heart rate for this ride", body: `Added by hand, and Apple Health has nothing from ${span}.`, waiting: false }
    : {
        title: "No heart rate for this ride",
        body: `Apple Health has nothing from ${span}. If you wore your watch, check that Equina may read Heart Rate in the Apple Health app.`,
        waiting: false
      };
};

/** For readings minutes apart: how to get the full line next time. */
export const WORKOUT_TIP = "For the full line, start an Equestrian Sports workout on your Apple Watch when you ride, if you wear one.";
export const SPARSE_NOTE = "Measured every few minutes, so short efforts may not show.";
/** Apple Health's own sum over the ride: every source that recorded energy, the iPhone included. */
export const KCAL_NOTE = "Calories are an estimate from Apple Health.";

/** Whose estimate the calories are, by where they came from; never a guess that it was a watch. */
export const kcalNote = (kcalSource?: string) => {
  if (kcalSource === "Apple Watch") return "Calories are your Apple Watch's estimate.";
  if (kcalSource && kcalSource !== "Apple Health") return `Calories are ${kcalSource}'s estimate.`;
  return KCAL_NOTE;
};

/** What the ride's effort holds, in words: "heart rate and calories", "heart rate", or "calories". */
export const effortWords = (effort: Pick<RideEffort, "avgBpm" | "activeKcal">) =>
  effort.avgBpm !== null && effort.activeKcal !== null
    ? "heart rate and calories"
    : effort.avgBpm !== null
      ? "heart rate"
      : "calories";

/** The small print under the card: only the notes that apply. */
export const effortFootnotes = (
  effort: RideEffort,
  { placement, phases }: { placement: PhasePlacement; phases?: readonly RidePhaseEntry[] }
): string[] => {
  const state = rideEffortState(effort);
  const notes: string[] = [];
  if (effort.phases.length && placement === "typed") notes.push("Phase lines follow the minutes you typed, so they may be a little off.");
  if (effort.phases.length && placement === "estimated") notes.push("Phase lines follow each phase's minutes, so after a break they may be a little off.");
  if (state === "dense" && effort.longestGap && effort.longestGap.ms >= GAP_NOTE_MS) {
    const where = effort.longestGap.phaseIndex === null ? "" : ` during ${effortPhaseName(phases?.[effort.longestGap.phaseIndex], effort.longestGap.phaseIndex)}`;
    notes.push(`No reading for ${minutesWord(effort.longestGap.ms)}${where}.`);
  }
  if (state === "sparse") notes.push(SPARSE_NOTE);
  if (state === "sparse" || state === "few") notes.push(WORKOUT_TIP);
  if (effort.activeKcal !== null) notes.push(kcalNote(effort.kcalSource));
  return notes;
};

const phaseOfMoment = (effortPhases: readonly RidePhaseWindows[], at: number) =>
  effortPhases.find((phase) => takenIn(phase.windows, at))?.phaseIndex ?? null;

/** One neutral sentence under the chart: where the heart rate peaked. Never "better" or "worse". */
export const effortInsight = (
  effort: RideEffort,
  windows: readonly RidePhaseWindows[],
  phases?: readonly RidePhaseEntry[]
): string | null => {
  if (effort.maxBpm === null || effort.maxAt === null) return null;
  const phaseIndex = phaseOfMoment(windows, effort.maxAt);
  return phaseIndex === null
    ? `Your heart rate peaked at ${effort.maxBpm}.`
    : `Your heart rate peaked at ${effort.maxBpm} during ${effortPhaseName(phases?.[phaseIndex], phaseIndex)}.`;
};

/** The three numbers, as VoiceOver reads them: units spelled out, a missing one said as such. */
export const effortStatsSpoken = (effort: RideEffort) => ({
  avg: effort.avgBpm === null ? "Average heart rate, no reading" : `Average heart rate, ${effort.avgBpm} beats per minute`,
  max: effort.maxBpm === null ? "Highest heart rate, no reading" : `Highest heart rate, ${effort.maxBpm} beats per minute`,
  kcal: effort.activeKcal === null ? "Active calories, not recorded" : `Active calories, ${effort.activeKcal} kilocalories`
});

/**
 * What the chart says to VoiceOver, one step per swipe: the whole ride first,
 * then each phase with its minutes on the ride's clock.
 */
export const effortChartSteps = (
  effort: RideEffort,
  windows: readonly RidePhaseWindows[],
  phases?: readonly RidePhaseEntry[]
): string[] => {
  const minuteOf = (at: number) => Math.round((at - effort.window.start) / 60_000);
  const total = minuteOf(effort.window.end);
  const peakPhase = effort.maxAt === null ? null : phaseOfMoment(windows, effort.maxAt);
  const whole = [
    `Whole ride, ${total} ${total === 1 ? "minute" : "minutes"}:`,
    effort.avgBpm === null ? "no heart rate" : `average ${effort.avgBpm}, highest ${effort.maxBpm} beats per minute`,
    effort.maxAt === null
      ? ""
      : `${peakPhase === null ? "" : `in ${effortPhaseName(phases?.[peakPhase], peakPhase)} `}at minute ${minuteOf(effort.maxAt)}`
  ].filter(Boolean);
  const steps = [`${whole[0]} ${whole.slice(1).join(", ")}.`];
  for (const phase of effort.phases) {
    const placed = windows.find((each) => each.phaseIndex === phase.phaseIndex);
    const first = placed?.windows[0];
    const last = placed?.windows[placed.windows.length - 1];
    if (!first || !last) continue;
    const name = effortPhaseName(phases?.[phase.phaseIndex], phase.phaseIndex);
    const heart = phase.avgBpm === null
      ? "no reading"
      : `average ${phase.avgBpm}${phase.maxBpm !== null && phase.maxBpm !== phase.avgBpm ? `, highest ${phase.maxBpm}` : ""}`;
    steps.push(`${name}, minutes ${minuteOf(first.start)} to ${minuteOf(last.end)}: ${heart}.`);
  }
  return steps;
};

/** Ralf's one line stays short whatever the phase names are. */
export const RALF_EFFORT_LIMIT = 400;

/**
 * The ride's effort, in one plain line for Ralf: averages and each phase's
 * average, never the heart-rate line, the device or a time of day. It says
 * whose heart it is, so a reply never takes it for the horse's. It goes
 * beside the question, never inside it, and only after the rider said yes
 * (RALF_EFFORT_CONSENT); its words stay clear of the coach's health filter
 * all the same (tests/ride-effort.test.ts).
 */
export const effortForRalf = (
  effort: RideEffort,
  { phases, placement }: { phases?: readonly RidePhaseEntry[]; placement: PhasePlacement }
): string | null => {
  const state = rideEffortState(effort);
  if (state === "none") return null;
  const parts: string[] = [];
  if (effort.avgBpm !== null) parts.push(`average ${effort.avgBpm} bpm, highest ${effort.maxBpm} bpm`);
  if (effort.activeKcal !== null) parts.push(`active energy ${effort.activeKcal} kcal`);
  let line = `My heart rate from Apple Health (mine, not my horse's): ${parts.join(", ")}.`;
  if (effort.avgBpm === null) line = `My active energy from Apple Health (mine, not my horse's): ${effort.activeKcal} kcal.`;
  const byPhase = effort.phases
    .filter((phase) => phase.avgBpm !== null)
    .map((phase) => `${effortPhaseName(phases?.[phase.phaseIndex], phase.phaseIndex)} ${phase.avgBpm}`);
  if (byPhase.length && state !== "few") {
    line += ` By phase: ${byPhase.join(", ")} bpm.`;
    if (placement === "typed") line += " The phase heart rates follow minutes I typed afterwards.";
    if (placement === "estimated") line += " The phase heart rates follow each phase's minutes, not the clock, so after a pause they may be off.";
  }
  if (effort.readings > 0 && (state === "sparse" || state === "few")) line += " Measured every few minutes, not during a workout.";
  const single = line.replace(/\s+/g, " ").trim();
  return single.length > RALF_EFFORT_LIMIT ? `${single.slice(0, RALF_EFFORT_LIMIT - 3).trim()}...` : single;
};

/**
 * The Account switch's own words: the same promise as the question below.
 * The owner decided (2026-11-28) that the app never names the AI provider:
 * it is "the AI service that writes Ralf's answers" (tests/ralf-notice.test.ts).
 */
export const RALF_EFFORT_SWITCH_DETAIL = "From Apple Health, only in the rides you ask about. Sent to the AI service that writes Ralf's answers.";

/**
 * Asked the first time the rider asks Ralf about a ride with effort, before
 * anything is sent. It says that a third-party AI service receives the
 * numbers, as App Review 5.1.2(i) asks, without naming it, and what happens
 * to them: they go with that one question and Equina keeps none of them
 * (coach-chat hands them to the model, saves only the question, and takes
 * the sentences that hold them out of the reply before saving it). The answer is kept on this phone
 * (health-settings.ts) and Account › Privacy and Ralf changes it.
 */
export const RALF_EFFORT_CONSENT = {
  title: "Let Ralf use your heart rate?",
  message:
    "When you ask Ralf about a ride, Equina can add your heart rate and calories from it: the average, the highest and each phase's average, never the full line. " +
    "These numbers are sent with that one question to the AI service that writes Ralf's answers. " +
    "Equina does not save them: Ralf is asked not to repeat them, and Equina removes any that appear in his reply before saving it. " +
    "Ralf talks about training effort, not medical matters. You can change this anytime in Account, Privacy and Ralf.",
  allow: "Allow",
  // Kept as the answer, so the question is not asked again: "Don't allow"
  // says so, where "Not now" would promise to ask later.
  decline: "Don't allow"
} as const;
