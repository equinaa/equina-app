import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import type {
  OnboardingDiscipline,
  RiderLevel
} from "./OnboardingScreen";

const draftKey = "equina.onboarding.draft.v1";
const disciplines: readonly OnboardingDiscipline[] = ["Dressage", "Jumping", "Eventing", "Trail"];
const levels: readonly RiderLevel[] = ["Beginner", "Intermediate", "Advanced", "Pro"];
const secureOptions: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY
};

export type OnboardingDraft = {
  name: string;
  email: string;
  discipline: OnboardingDiscipline;
  level: RiderLevel;
  hasHorse: boolean;
  horsePhoto: string;
  horseName: string;
  horseBreed: string;
};

const storage = {
  getItem: () =>
    Platform.OS === "web"
      ? AsyncStorage.getItem(draftKey)
      : SecureStore.getItemAsync(draftKey, secureOptions),
  setItem: (value: string) =>
    Platform.OS === "web"
      ? AsyncStorage.setItem(draftKey, value)
      : SecureStore.setItemAsync(draftKey, value, secureOptions),
  removeItem: () =>
    Platform.OS === "web"
      ? AsyncStorage.removeItem(draftKey)
      : SecureStore.deleteItemAsync(draftKey, secureOptions)
};

const isDraft = (value: unknown): value is OnboardingDraft => {
  if (!value || typeof value !== "object") return false;
  const draft = value as Record<string, unknown>;
  return typeof draft.name === "string" &&
    typeof draft.email === "string" &&
    disciplines.includes(draft.discipline as OnboardingDiscipline) &&
    levels.includes(draft.level as RiderLevel) &&
    typeof draft.hasHorse === "boolean" &&
    typeof draft.horsePhoto === "string" &&
    typeof draft.horseName === "string" &&
    typeof draft.horseBreed === "string";
};

export async function saveOnboardingDraft(draft: OnboardingDraft) {
  await storage.setItem(JSON.stringify(draft));
}

export async function readOnboardingDraft(): Promise<OnboardingDraft | null> {
  const raw = await storage.getItem();
  if (!raw) return null;
  try {
    const draft: unknown = JSON.parse(raw);
    return isDraft(draft) ? draft : null;
  } catch {
    return null;
  }
}

export async function clearOnboardingDraft() {
  await storage.removeItem();
}
