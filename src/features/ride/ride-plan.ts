import type { RidePhaseEntry } from "../../backend";
import type { OnboardingDiscipline } from "../onboarding/OnboardingScreen";

/**
 * A ride as the rider sets it up before getting on: which horse, what kind of
 * training, and the phases with their minutes. Everything here is pure, so the
 * clock and the phase changes are tested without a phone.
 */

/** One block of the ride: "Warm-up", "Trot", 7 minutes. */
export type RidePhasePlan = {
  id: string;
  title: string;
  /** The gait or the work, said after the title: "Walk", "Trot & walk", "Dressage". */
  detail: string;
  minutes: number;
};

export type RideTrainingType = {
  /** What a saved ride keeps, so a label can change and a type can be added without a migration. */
  id: string;
  label: string;
  /** The journal's discipline for this training, where one fits. Otherwise the horse's. */
  discipline?: OnboardingDiscipline;
};

export type RidePlan = {
  horseId?: string;
  horseName: string;
  trainingType: RideTrainingType;
  phases: RidePhasePlan[];
};

export const rideTrainingTypes: readonly RideTrainingType[] = [
  { id: "dressage", label: "Dressage", discipline: "Dressage" },
  { id: "jumping", label: "Jumping", discipline: "Jumping" },
  { id: "flatwork", label: "Flatwork", discipline: "Dressage" },
  { id: "pole-work", label: "Pole work", discipline: "Jumping" },
  { id: "cross-country", label: "Cross-country", discipline: "Eventing" },
  { id: "hack", label: "Hack", discipline: "Trail" },
  { id: "hunting", label: "Hunting", discipline: "Trail" },
  { id: "lunging", label: "Lunging" },
  { id: "groundwork", label: "Groundwork" }
];

export const ridePhaseLimits = {
  minMinutes: 1,
  maxMinutes: 90,
  maxPhases: 8,
  titleLength: 40,
  detailLength: 40
} as const;

const defaultTypeByDiscipline: Record<OnboardingDiscipline, string> = {
  Dressage: "dressage",
  Jumping: "jumping",
  Eventing: "cross-country",
  Trail: "hack"
};

export const rideTrainingTypeById = (id: string | undefined) => rideTrainingTypes.find((type) => type.id === id);

/** A rider's discipline picks the first suggestion. It never limits what they can choose. */
export const defaultTrainingType = (discipline: OnboardingDiscipline): RideTrainingType =>
  rideTrainingTypeById(defaultTypeByDiscipline[discipline]) ?? rideTrainingTypes[0]!;

/** A saved ride's training, by its id. A type the app no longer lists still reads as words. */
export const rideTrainingLabel = (id: string | undefined) => {
  if (!id) return undefined;
  const known = rideTrainingTypeById(id);
  if (known) return known.label;
  const words = id.replace(/-/g, " ");
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
};

/** The yard's usual shape: walk in, trot, the work itself, then bring the horse down. */
export const defaultRidePhases = (training: RideTrainingType): RidePhasePlan[] => [
  { id: "pre-warm-up", title: "Pre warm-up", detail: "Walk", minutes: 10 },
  { id: "warm-up", title: "Warm-up", detail: "Trot", minutes: 7 },
  { id: "training", title: "Training", detail: training.label, minutes: 20 },
  { id: "cool-down", title: "Cool-down", detail: "Trot & walk", minutes: 15 }
];

const clampMinutes = (minutes: number) =>
  Math.min(ridePhaseLimits.maxMinutes, Math.max(ridePhaseLimits.minMinutes, Math.round(minutes)));

export const setPhaseMinutes = (phases: RidePhasePlan[], id: string, minutes: number) =>
  phases.map((phase) => (phase.id === id ? { ...phase, minutes: clampMinutes(minutes) } : phase));

export const editPhase = (phases: RidePhasePlan[], id: string, patch: { title?: string; detail?: string }) =>
  phases.map((phase) =>
    phase.id === id
      ? {
          ...phase,
          ...(patch.title !== undefined ? { title: patch.title.slice(0, ridePhaseLimits.titleLength) } : {}),
          ...(patch.detail !== undefined ? { detail: patch.detail.slice(0, ridePhaseLimits.detailLength) } : {})
        }
      : phase
  );

/** Added blank, so the rider types the name straight in; Start waits until it has one. */
export const addPhase = (phases: RidePhasePlan[], id: string): RidePhasePlan[] =>
  phases.length >= ridePhaseLimits.maxPhases
    ? phases
    : [...phases, { id, title: "", detail: "", minutes: 5 }];

/** A ride keeps at least one phase. */
export const removePhase = (phases: RidePhasePlan[], id: string) =>
  phases.length <= 1 ? phases : phases.filter((phase) => phase.id !== id);

export const movePhaseUp = (phases: RidePhasePlan[], id: string) => {
  const index = phases.findIndex((phase) => phase.id === id);
  if (index <= 0) return phases;
  const next = [...phases];
  [next[index - 1], next[index]] = [next[index]!, next[index - 1]!];
  return next;
};

export const plannedMinutes = (phases: RidePhasePlan[]) => phases.reduce((sum, phase) => sum + phase.minutes, 0);

/** What stops the rider from starting, in their words. Null when the plan is ready. */
export const ridePlanProblem = (phases: RidePhasePlan[]) => {
  if (phases.length === 0) return "Add at least one phase.";
  if (phases.some((phase) => !phase.title.trim())) return "Give every phase a name.";
  return null;
};

/** Trimmed for the ride: a blank detail is no detail. */
export const cleanPhases = (phases: RidePhasePlan[]): RidePhasePlan[] =>
  phases.map((phase) => ({ ...phase, title: phase.title.trim(), detail: phase.detail.trim(), minutes: clampMinutes(phase.minutes) }));

// The clock ---------------------------------------------------------------

/**
 * Ride time is kept as timestamps, never as ticks: a phone that sleeps in a
 * pocket stops JavaScript timers, and counting ticks would lose that time.
 * On waking, `syncRun` moves the ride on to wherever the clock now is.
 */
export type RideRun = {
  /** Wall-clock ms of the rider's first start. Null while the ride waits for them. */
  startedAt: number | null;
  /** Ride time banked before the current stretch, in ms. */
  bankedMs: number;
  /** Wall-clock ms the clock last started running. Null while paused or not started. */
  runningSince: number | null;
  phaseIndex: number;
  /** Ride time, in ms, at which each phase reached so far began. */
  phaseStarts: number[];
  /** Every phase has had its time. The clock still runs until the rider finishes. */
  phasesDone: boolean;
};

const minuteMs = 60_000;

export const readyRun = (): RideRun => ({
  startedAt: null,
  bankedMs: 0,
  runningSince: null,
  phaseIndex: 0,
  phaseStarts: [],
  phasesDone: false
});

export const rideElapsedMs = (run: RideRun, now: number) =>
  run.bankedMs + (run.runningSince === null ? 0 : Math.max(0, now - run.runningSince));

export const isRunning = (run: RideRun) => run.runningSince !== null;

export const startRun = (run: RideRun, now: number): RideRun =>
  run.startedAt !== null ? run : { ...run, startedAt: now, runningSince: now, phaseStarts: [0] };

export const pauseRun = (run: RideRun, now: number): RideRun =>
  run.runningSince === null ? run : { ...run, bankedMs: rideElapsedMs(run, now), runningSince: null };

export const resumeRun = (run: RideRun, now: number): RideRun =>
  run.startedAt === null || run.runningSince !== null ? run : { ...run, runningSince: now };

const phaseEnd = (run: RideRun, phases: RidePhasePlan[], index: number) =>
  (run.phaseStarts[index] ?? 0) + (phases[index]?.minutes ?? 0) * minuteMs;

/**
 * The ride moved on to where the clock is. `entered` is the phase the rider is
 * in now when one began -- one cue for it, however many passed while the phone
 * slept -- and `finished` is true when the last phase's time just ran out.
 */
export const syncRun = (
  run: RideRun,
  phases: RidePhasePlan[],
  now: number
): { run: RideRun; entered: number | null; finished: boolean } => {
  if (run.runningSince === null || run.phasesDone || phases.length === 0) return { run, entered: null, finished: false };
  const elapsed = rideElapsedMs(run, now);
  const starts = [...run.phaseStarts];
  let index = run.phaseIndex;
  let entered: number | null = null;
  let finished = false;
  while (elapsed >= phaseEnd({ ...run, phaseStarts: starts }, phases, index)) {
    if (index >= phases.length - 1) {
      finished = true;
      break;
    }
    // The next phase begins where this one was planned to end, not when the
    // phone noticed, so a locked screen does not stretch the plan.
    starts[index + 1] = phaseEnd({ ...run, phaseStarts: starts }, phases, index);
    index += 1;
    entered = index;
  }
  if (entered === null && !finished) return { run, entered: null, finished: false };
  return { run: { ...run, phaseIndex: index, phaseStarts: starts, phasesDone: finished }, entered, finished };
};

/** The rider moves on before the phase's time is up. Past the last phase, the phases are done. */
export const skipPhase = (run: RideRun, phases: RidePhasePlan[], now: number): RideRun => {
  if (run.startedAt === null || run.phasesDone) return run;
  if (run.phaseIndex >= phases.length - 1) return { ...run, phasesDone: true };
  const next = run.phaseIndex + 1;
  const starts = [...run.phaseStarts];
  starts[next] = rideElapsedMs(run, now);
  return { ...run, phaseIndex: next, phaseStarts: starts };
};

/** Time left in the current phase. Before the start, the first phase's full time. */
export const phaseRemainingMs = (run: RideRun, phases: RidePhasePlan[], now: number) => {
  if (run.phasesDone) return 0;
  if (run.startedAt === null) return (phases[0]?.minutes ?? 0) * minuteMs;
  return Math.max(0, phaseEnd(run, phases, run.phaseIndex) - rideElapsedMs(run, now));
};

/** How full each segment of the phase track is, 0 to 1. */
export const phaseProgress = (run: RideRun, phases: RidePhasePlan[], now: number) =>
  phases.map((phase, index) => {
    if (run.startedAt === null) return 0;
    if (run.phasesDone || index < run.phaseIndex) return 1;
    if (index > run.phaseIndex) return 0;
    const into = rideElapsedMs(run, now) - (run.phaseStarts[index] ?? 0);
    return Math.min(1, Math.max(0, into / (phase.minutes * minuteMs)));
  });

/**
 * Changes only when the times still ahead change: a start, a pause, a resume,
 * a skip. A phase running out on time moves nothing ahead of it, so the alerts
 * already scheduled stay -- rebuilding them at that moment would cancel the
 * very alert that is about to tell a locked phone.
 */
export const rideScheduleKey = (run: RideRun, phases: RidePhasePlan[]) => {
  if (run.runningSince === null || run.phasesDone) return "stopped";
  const end = phases
    .slice(run.phaseIndex)
    .reduce((sum, phase) => sum + phase.minutes * minuteMs, run.phaseStarts[run.phaseIndex] ?? 0);
  return `${run.runningSince}|${run.bankedMs}|${end}`;
};

// Cues ----------------------------------------------------------------------

const spokenMinutes = (minutes: number) => (minutes === 1 ? "1 minute" : `${minutes} minutes`);

/** What the phone says as a phase begins: "Warm-up. Trot. 7 minutes." */
export const phaseAnnouncement = (phase: RidePhasePlan) =>
  `${[phase.title, phase.detail, spokenMinutes(phase.minutes)].filter((part) => part.trim()).join(". ")}.`;

export const phasesDoneAnnouncement = "All phases done. Finish the ride when you're ready.";

export type RideAlert = {
  /** The phase that begins, or null for the end of the last one. */
  phaseIndex: number | null;
  inSeconds: number;
  title: string;
  body: string;
};

/**
 * Every phase change still ahead, as seconds from now: the notifications that
 * stand in for the voice while the phone is locked. Nothing while paused.
 */
export const upcomingRideAlerts = (run: RideRun, phases: RidePhasePlan[], now: number): RideAlert[] => {
  if (run.runningSince === null || run.phasesDone || phases.length === 0) return [];
  const elapsed = rideElapsedMs(run, now);
  let boundary = phaseEnd(run, phases, run.phaseIndex);
  const alerts: RideAlert[] = [];
  for (let next = run.phaseIndex + 1; next <= phases.length; next += 1) {
    const inSeconds = Math.max(1, Math.round((boundary - elapsed) / 1000));
    const phase = phases[next];
    if (!phase) {
      alerts.push({ phaseIndex: null, inSeconds, title: "All phases done", body: "Finish the ride in Equina when you're ready." });
      break;
    }
    alerts.push({
      phaseIndex: next,
      inSeconds,
      title: `${phase.title} · ${phase.minutes} min`,
      body: phase.detail || `Phase ${next + 1} of ${phases.length}`
    });
    boundary += phase.minutes * minuteMs;
  }
  return alerts;
};

// Saving --------------------------------------------------------------------

/** Each phase as planned and as ridden. A phase the ride never reached has no time. */
export const ridePhaseEntries = (run: RideRun, phases: RidePhasePlan[], finishedAtMs: number): RidePhaseEntry[] =>
  phases.map((phase, index) => {
    const start = run.phaseStarts[index];
    const end = run.phaseStarts[index + 1] ?? finishedAtMs;
    return {
      title: phase.title,
      ...(phase.detail ? { detail: phase.detail } : {}),
      plannedSeconds: phase.minutes * 60,
      ...(start === undefined ? {} : { actualSeconds: Math.max(0, Math.round((end - start) / 1000)) })
    };
  });

/** Phases the rider reached, the way the journal has always counted them. */
export const reachedPhases = (run: RideRun) => (run.startedAt === null ? 0 : run.phaseIndex + 1);

// Remembering ---------------------------------------------------------------

/** The last setup, kept on the phone so the next ride starts from it. */
export type RideSetupMemory = {
  trainingTypeId: string;
  horseId?: string;
  phasesByType: Record<string, RidePhasePlan[]>;
};

const isPhase = (value: unknown): value is RidePhasePlan => {
  if (!value || typeof value !== "object") return false;
  const phase = value as Record<string, unknown>;
  return typeof phase.id === "string"
    && typeof phase.title === "string"
    && typeof phase.detail === "string"
    && typeof phase.minutes === "number"
    && Number.isFinite(phase.minutes);
};

/** Whatever was stored, or null. A setup from an older app version is dropped, not trusted. */
export const parseRideSetupMemory = (raw: string | null | undefined): RideSetupMemory | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || typeof value.trainingTypeId !== "string") return null;
    const phasesByType: Record<string, RidePhasePlan[]> = {};
    if (value.phasesByType && typeof value.phasesByType === "object") {
      for (const [type, phases] of Object.entries(value.phasesByType as Record<string, unknown>)) {
        if (!Array.isArray(phases) || phases.length === 0 || phases.length > ridePhaseLimits.maxPhases) continue;
        if (!phases.every(isPhase)) continue;
        phasesByType[type] = cleanPhases(phases);
      }
    }
    return {
      trainingTypeId: value.trainingTypeId,
      ...(typeof value.horseId === "string" && value.horseId ? { horseId: value.horseId } : {}),
      phasesByType
    };
  } catch {
    return null;
  }
};

/** The phases to offer for a training: the rider's own from last time, or the yard's default. */
export const phasesFor = (memory: RideSetupMemory | null, training: RideTrainingType) =>
  memory?.phasesByType[training.id] ?? defaultRidePhases(training);

export const rememberSetup = (memory: RideSetupMemory | null, plan: RidePlan): RideSetupMemory => ({
  trainingTypeId: plan.trainingType.id,
  ...(plan.horseId ? { horseId: plan.horseId } : {}),
  phasesByType: { ...(memory?.phasesByType ?? {}), [plan.trainingType.id]: cleanPhases(plan.phases) }
});
