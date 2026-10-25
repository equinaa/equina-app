import type { TrainingPlanDay } from "../../backend";
import { rideTrainingLabel } from "./ride-plan";

/** One planned ride in the rider's words: "Dressage with Daimon", or "Dressage" with no horse. */
export const plannedRideLabel = (entry: Pick<TrainingPlanDay, "trainingType" | "horseId">, horseNames: Record<string, string>) => {
  const training = rideTrainingLabel(entry.trainingType) ?? "Training";
  const horse = entry.horseId ? horseNames[entry.horseId] : undefined;
  return horse ? `${training} with ${horse}` : training;
};

/** A day's planned rides: "Dressage with Daimon and Jumping with Luna". */
export const plannedRidesLabel = (entries: readonly Pick<TrainingPlanDay, "trainingType" | "horseId">[], horseNames: Record<string, string>) => {
  const labels = entries.map((entry) => plannedRideLabel(entry, horseNames));
  if (labels.length <= 1) return labels[0] ?? "";
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
};

/**
 * Which of today's planned rides Start ride opens on: the one on Home's
 * horse when there is one, else the first.
 */
export const plannedRideFor = <T extends Pick<TrainingPlanDay, "horseId">>(entries: readonly T[], homeHorseId?: string): T | undefined =>
  entries.find((entry) => homeHorseId && entry.horseId === homeHorseId) ?? entries[0];
