import { useCallback, useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type {
  AccountSnapshot,
  BlockedAccountRecord,
  DataExportRecord,
  EquinaBackend,
  NotificationPreferencesRecord,
  ProfileRecord,
  UploadAsset,
  UserPreferencesRecord
} from "../../backend";
import type { Discipline } from "../../domain/types";
import type { AccountMode } from "./account-types";

const demoStorageKey = "@equina/demo-account-v1";

const createDemoSnapshot = (input: {
  displayName: string;
  email: string;
  horseName?: string;
  discipline: Discipline;
  skillLevel: NonNullable<ProfileRecord["skillLevel"]>;
}): AccountSnapshot => ({
  userId: "demo-rider",
  email: input.email,
  emailVerified: false,
  profile: {
    id: "demo-rider",
    displayName: input.displayName,
    locale: "en",
    discipline: input.discipline,
    skillLevel: input.skillLevel,
    onboardingCompletedAt: new Date(0).toISOString()
  },
  primaryHorse: input.horseName
    ? {
        id: "demo-horse",
        ownerId: "demo-rider",
        name: input.horseName,
        breed: "Warmblood",
        discipline: input.discipline,
        isPrimary: true,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString()
      }
    : undefined,
  preferences: {
    userId: "demo-rider",
    academyDiscipline: input.discipline,
    academyLevel: input.skillLevel,
    academyFocus: "Rhythm",
    useRiderProfile: true,
    useSelectedHorse: true,
    useRideHistory: true,
    reducedPersonalization: false,
    version: 1,
    updatedAt: new Date(0).toISOString()
  },
  notifications: {
    userId: "demo-rider",
    humanMessages: true,
    orderChanges: true,
    horseReminders: false,
    academyReminders: false,
    messagePreviews: false,
    quietHoursTimezone: "Europe/Bucharest",
    updatedAt: new Date(0).toISOString()
  }
});

export function useAccount({
  mode,
  backend,
  connectedSnapshot,
  fallback,
  onConnectedSnapshot,
  onSignOut,
  onClearDemoCoach
}: {
  mode: AccountMode;
  backend: EquinaBackend | null;
  connectedSnapshot: AccountSnapshot | null;
  fallback: {
    displayName: string;
    email: string;
    horseName?: string;
    discipline: Discipline;
    skillLevel: NonNullable<ProfileRecord["skillLevel"]>;
  };
  onConnectedSnapshot: (snapshot: AccountSnapshot) => void;
  onSignOut: () => Promise<void> | void;
  onClearDemoCoach: () => void;
}) {
  const fallbackSnapshot = useMemo(
    () => createDemoSnapshot(fallback),
    [fallback.discipline, fallback.displayName, fallback.email, fallback.horseName, fallback.skillLevel]
  );
  const [demoSnapshot, setDemoSnapshot] = useState(fallbackSnapshot);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [blocked, setBlocked] = useState<BlockedAccountRecord[]>([]);
  const snapshot = mode === "connected" ? connectedSnapshot ?? fallbackSnapshot : demoSnapshot;

  useEffect(() => {
    if (mode !== "demo") return;
    let active = true;
    void AsyncStorage.getItem(demoStorageKey).then((raw) => {
      if (!active) return;
      // Nothing saved yet: show the demo profile as it is now. The initial
      // state was built on the first render, before demo mode filled it in.
      if (!raw) {
        setDemoSnapshot(fallbackSnapshot);
        return;
      }
      try {
        setDemoSnapshot(JSON.parse(raw) as AccountSnapshot);
      } catch {
        void AsyncStorage.removeItem(demoStorageKey);
      }
    });
    return () => { active = false; };
  }, [fallbackSnapshot, mode]);

  const saveDemo = useCallback(async (next: AccountSnapshot) => {
    setDemoSnapshot(next);
    await AsyncStorage.setItem(demoStorageKey, JSON.stringify(next));
  }, []);

  const saveProfile = useCallback(async (input: {
    displayName: string;
    locale: string;
    discipline: Discipline;
    skillLevel: NonNullable<ProfileRecord["skillLevel"]>;
  }) => {
    const previous = snapshot;
    const optimistic: AccountSnapshot = {
      ...snapshot,
      profile: {
        ...snapshot.profile,
        displayName: input.displayName.trim(),
        locale: input.locale,
        discipline: input.discipline,
        skillLevel: input.skillLevel
      }
    };
    setError("");
    setBusy("profile");
    try {
      if (mode === "demo") {
        await saveDemo(optimistic);
      } else {
        if (!backend) throw new Error("Account backend is unavailable.");
        const profile = await backend.account.updateProfile(input);
        const next = { ...snapshot, profile };
        onConnectedSnapshot(next);
      }
    } catch {
      if (mode === "demo") setDemoSnapshot(previous);
      else onConnectedSnapshot(previous);
      setError("Profile changes could not be saved. Try again.");
      throw new Error("profile_save_failed");
    } finally {
      setBusy("");
    }
  }, [backend, mode, onConnectedSnapshot, saveDemo, snapshot]);

  const uploadAvatar = useCallback(async (asset: UploadAsset) => {
    setBusy("avatar");
    setError("");
    try {
      if (mode === "demo") {
        await saveDemo({
          ...snapshot,
          profile: { ...snapshot.profile, avatarUrl: asset.uri }
        });
        return;
      }
      if (!backend) throw new Error("Account backend is unavailable.");
      const profile = await backend.account.uploadAvatar(asset);
      onConnectedSnapshot({ ...snapshot, profile });
    } catch {
      setError("Profile photo could not be uploaded.");
      throw new Error("avatar_upload_failed");
    } finally {
      setBusy("");
    }
  }, [backend, mode, onConnectedSnapshot, saveDemo, snapshot]);

  const savePreferences = useCallback(async (
    patch: Partial<Omit<UserPreferencesRecord, "userId" | "version" | "updatedAt">>
  ) => {
    const previous = snapshot;
    const optimistic: AccountSnapshot = {
      ...snapshot,
      preferences: { ...snapshot.preferences, ...patch }
    };
    setError("");
    setBusy("preferences");
    if (mode === "demo") {
      await saveDemo(optimistic);
      setBusy("");
      return;
    }
    onConnectedSnapshot(optimistic);
    try {
      if (!backend) throw new Error("Account backend is unavailable.");
      const preferences = await backend.account.updatePreferences(patch);
      onConnectedSnapshot({ ...optimistic, preferences });
    } catch {
      onConnectedSnapshot(previous);
      setError("Personalization could not be updated. Your previous choice was restored.");
      throw new Error("preference_save_failed");
    } finally {
      setBusy("");
    }
  }, [backend, mode, onConnectedSnapshot, saveDemo, snapshot]);

  const saveNotifications = useCallback(async (
    patch: Partial<Omit<NotificationPreferencesRecord, "userId" | "updatedAt">>
  ) => {
    const previous = snapshot;
    const optimistic: AccountSnapshot = {
      ...snapshot,
      notifications: { ...snapshot.notifications, ...patch }
    };
    setError("");
    setBusy("notifications");
    if (mode === "demo") {
      await saveDemo(optimistic);
      setBusy("");
      return;
    }
    onConnectedSnapshot(optimistic);
    try {
      if (!backend) throw new Error("Account backend is unavailable.");
      const notifications = await backend.account.updateNotifications(patch);
      onConnectedSnapshot({ ...optimistic, notifications });
    } catch {
      onConnectedSnapshot(previous);
      setError("Notification settings could not be updated. Your previous choice was restored.");
      throw new Error("notification_save_failed");
    } finally {
      setBusy("");
    }
  }, [backend, mode, onConnectedSnapshot, saveDemo, snapshot]);

  const loadBlocked = useCallback(async () => {
    if (mode === "demo" || !backend) {
      setBlocked([]);
      return;
    }
    setBusy("blocked");
    setError("");
    try {
      setBlocked(await backend.account.blockedAccounts());
    } catch {
      setError("Blocked accounts could not be loaded.");
    } finally {
      setBusy("");
    }
  }, [backend, mode]);

  const unblock = useCallback(async (userId: string) => {
    if (!backend || mode === "demo") return;
    setBusy(`unblock:${userId}`);
    try {
      await backend.account.unblock(userId);
      setBlocked((current) => current.filter((entry) => entry.id !== userId));
    } catch {
      setError("That account could not be unblocked.");
    } finally {
      setBusy("");
    }
  }, [backend, mode]);

  const requestExport = useCallback(async (): Promise<DataExportRecord | null> => {
    if (!backend || mode === "demo") {
      setError("Data export is available after connecting a verified account.");
      return null;
    }
    setBusy("export");
    setError("");
    try {
      return await backend.account.requestDataExport();
    } catch {
      setError("Your data export could not be prepared. Try again.");
      return null;
    } finally {
      setBusy("");
    }
  }, [backend, mode]);

  const clearCoachHistory = useCallback(async () => {
    setBusy("coach-history");
    setError("");
    try {
      if (mode === "demo") onClearDemoCoach();
      else {
        if (!backend) throw new Error("Coach backend is unavailable.");
        await backend.coach.clearHistory();
      }
    } catch {
      setError("Ralf history could not be deleted.");
      throw new Error("coach_history_delete_failed");
    } finally {
      setBusy("");
    }
  }, [backend, mode, onClearDemoCoach]);

  const scheduleDeletion = useCallback(async (reason?: string) => {
    if (!backend || mode === "demo") {
      setError("Account deletion is available after connecting and verifying an account.");
      return null;
    }
    setBusy("delete-account");
    setError("");
    try {
      const deletionRequest = await backend.account.scheduleDeletion(reason);
      onConnectedSnapshot({ ...snapshot, deletionRequest });
      return deletionRequest;
    } catch (cause) {
      const recentAuth = cause instanceof Error && "code" in cause &&
        (cause as Error & { code?: string }).code === "recent_auth_required";
      setError(recentAuth
        ? "Verify your email again before scheduling account deletion."
        : "Account deletion could not be scheduled.");
      return null;
    } finally {
      setBusy("");
    }
  }, [backend, mode, onConnectedSnapshot, snapshot]);

  const cancelDeletion = useCallback(async () => {
    if (!backend || mode === "demo") return;
    setBusy("cancel-deletion");
    setError("");
    try {
      await backend.account.cancelDeletion();
      onConnectedSnapshot({ ...snapshot, deletionRequest: undefined });
    } catch {
      setError("The deletion request could not be canceled.");
    } finally {
      setBusy("");
    }
  }, [backend, mode, onConnectedSnapshot, snapshot]);

  return {
    snapshot,
    busy,
    error,
    blocked,
    saveProfile,
    uploadAvatar,
    savePreferences,
    saveNotifications,
    loadBlocked,
    unblock,
    requestExport,
    clearCoachHistory,
    scheduleDeletion,
    cancelDeletion,
    signOut: onSignOut
  };
}
