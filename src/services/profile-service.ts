import { z } from "zod";
import type { Horse, Profile } from "../domain/types";
import { createId } from "./id";
import type { EquinaStore } from "./store";

const profileSchema = z.object({
  userId: z.string(),
  displayName: z.string().min(2),
  location: z.string().min(2),
  discipline: z.enum(["dressage", "jumping", "eventing", "western", "endurance", "trail"]),
  skillLevel: z.enum(["beginner", "intermediate", "advanced", "pro"]),
  bio: z.string().max(600).optional(),
  avatarUrl: z.string().url().optional()
});

const horseSchema = z.object({
  ownerId: z.string(),
  name: z.string().min(2),
  breed: z.string().optional(),
  heightCm: z.number().positive().optional(),
  discipline: z.enum(["dressage", "jumping", "eventing", "western", "endurance", "trail"]),
  ageYears: z.number().int().min(0).optional(),
  measurements: z
    .object({
      witherHeightCm: z.number().positive().optional(),
      backLengthCm: z.number().positive().optional(),
      shoulderAngle: z.enum(["upright", "average", "sloped"]).optional()
    })
    .optional()
});

export class ProfileService {
  constructor(private readonly store: EquinaStore) {}

  upsertProfile(input: unknown): Profile {
    const profile = profileSchema.parse(input);
    const index = this.store.profiles.findIndex((candidate) => candidate.userId === profile.userId);

    if (index >= 0) {
      this.store.profiles[index] = profile;
    } else {
      this.store.profiles.push(profile);
    }

    return profile;
  }

  createHorse(input: unknown): Horse {
    const data = horseSchema.parse(input);
    const horse = { id: createId("horse"), ...data } satisfies Horse;
    this.store.horses.push(horse);
    return horse;
  }

  updateHorse(id: string, input: Partial<Horse>): Horse {
    const existing = this.store.horses.find((horse) => horse.id === id);
    if (!existing) throw new Error("Horse not found");
    Object.assign(existing, input);
    return existing;
  }

  deleteHorse(id: string): void {
    this.store.horses = this.store.horses.filter((horse) => horse.id !== id);
  }
}
