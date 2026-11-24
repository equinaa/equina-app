import type { OnboardingDiscipline } from "../onboarding/OnboardingScreen";
import {
  isPhase,
  plannedMinutes,
  rideElapsedMs,
  ridePhaseLimits,
  syncRun,
  type RidePhasePlan,
  type RidePlan,
  type RideRun,
  type RideTrainingType
} from "./ride-plan";

/**
 * The ride in progress, kept on the phone so it survives the app being
 * closed: iOS ends a suspended app when it needs the memory, and Safari
 * reloads a page that was frozen behind the lock screen. The run is
 * timestamps, so what was saved still says where the ride is now.
 * Everything here is pure; useActiveRide does the storing.
 */

/**
 * How old an interrupted ride may be and still come back. Longer than any
 * ride, shorter than a night: a ride left open yesterday is not today's.
 */
export const activeRideMaxAgeMs = 12 * 60 * 60_000;

export type ActiveRide = {
  v: 1;
  plan: RidePlan;
  run: RideRun;
  /** Wall-clock ms of the last write. */
  savedAt: number;
};

export const serializeActiveRide = (plan: RidePlan, run: RideRun, now: number) =>
  JSON.stringify({ v: 1, plan, run, savedAt: now } satisfies ActiveRide);

const disciplines: readonly OnboardingDiscipline[] = ["Dressage", "Jumping", "Eventing", "Trail"];
const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

const parseTraining = (value: unknown): RideTrainingType | null => {
  if (!value || typeof value !== "object") return null;
  const training = value as Record<string, unknown>;
  if (typeof training.id !== "string" || !training.id || typeof training.label !== "string") return null;
  const discipline = disciplines.find((option) => option === training.discipline);
  return { id: training.id, label: training.label, ...(discipline ? { discipline } : {}) };
};

const parsePlan = (value: unknown): RidePlan | null => {
  if (!value || typeof value !== "object") return null;
  const plan = value as Record<string, unknown>;
  const trainingType = parseTraining(plan.trainingType);
  if (!trainingType || typeof plan.horseName !== "string") return null;
  const phases = plan.phases;
  if (!Array.isArray(phases) || phases.length === 0 || phases.length > ridePhaseLimits.maxPhases) return null;
  if (!phases.every(isPhase)) return null;
  return {
    ...(typeof plan.horseId === "string" && plan.horseId ? { horseId: plan.horseId } : {}),
    horseName: plan.horseName,
    trainingType,
    phases: phases.map((phase: RidePhasePlan) => ({ id: phase.id, title: phase.title, detail: phase.detail, minutes: phase.minutes }))
  };
};

const parseRun = (value: unknown, phaseCount: number): RideRun | null => {
  if (!value || typeof value !== "object") return null;
  const run = value as Record<string, unknown>;
  const { startedAt, bankedMs, runningSince, phaseIndex, phaseStarts, phasesDone } = run;
  // A ride that never started has nothing to come back to.
  if (!finite(startedAt) || !finite(bankedMs) || bankedMs < 0) return null;
  if (runningSince !== null && !finite(runningSince)) return null;
  if (!finite(phaseIndex) || !Number.isInteger(phaseIndex) || phaseIndex < 0 || phaseIndex >= phaseCount) return null;
  if (!Array.isArray(phaseStarts) || phaseStarts.length <= phaseIndex || phaseStarts.length > phaseCount) return null;
  if (!phaseStarts.every((start) => finite(start) && start >= 0)) return null;
  if (typeof phasesDone !== "boolean") return null;
  return { startedAt, bankedMs, runningSince, phaseIndex, phaseStarts: [...phaseStarts], phasesDone };
};

/** What was stored, or null: unreadable, from another version, not started, or too old. */
export const parseActiveRide = (raw: string | null | undefined, now: number): ActiveRide | null => {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    if (!value || value.v !== 1 || !finite(value.savedAt)) return null;
    const plan = parsePlan(value.plan);
    if (!plan) return null;
    const run = parseRun(value.run, plan.phases.length);
    if (!run || run.startedAt === null) return null;
    if (now - run.startedAt > activeRideMaxAgeMs) return null;
    return { v: 1, plan, run, savedAt: value.savedAt };
  } catch {
    return null;
  }
};

/**
 * The run as it stands now, for a ride coming back after the app was closed.
 * The phases that ran out meanwhile are passed silently -- their notifications
 * already said so. Past the planned end, the clock stops at the planned total:
 * a ride the rider forgot to finish is saved as the ride it was, not as the
 * hours the phone spent in a pocket afterwards.
 */
export const restoreRun = (run: RideRun, phases: RidePhasePlan[], now: number): RideRun => {
  const synced = syncRun(run, phases, now).run;
  const totalMs = plannedMinutes(phases) * 60_000;
  if (rideElapsedMs(synced, now) <= totalMs) return synced;
  return { ...synced, bankedMs: totalMs, runningSince: null, phasesDone: true };
};
