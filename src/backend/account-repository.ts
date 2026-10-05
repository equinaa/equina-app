import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Discipline } from "../domain/types";
import type {
  AccountDeletionRequestRecord,
  AccountSnapshot,
  BlockedAccountRecord,
  DataExportRecord,
  HorseRecord,
  NotificationPreferencesRecord,
  ProfileRecord,
  UploadAsset,
  UserPreferencesRecord
} from "./contracts";
import { EdgeClient } from "./edge-client";
import { backendError, requireData } from "./errors";
import { UploadRepository } from "./upload-repository";

type Row = Record<string, unknown>;

const optionalString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const mapProfile = (row: Row): ProfileRecord => ({
  id: String(row.id),
  displayName: String(row.display_name),
  avatarPath: optionalString(row.avatar_path),
  locale: String(row.locale),
  location: optionalString(row.location),
  discipline: optionalString(row.discipline) as Discipline | undefined,
  skillLevel: optionalString(row.skill_level) as ProfileRecord["skillLevel"],
  onboardingCompletedAt: optionalString(row.onboarding_completed_at)
});

const mapPreferences = (row: Row): UserPreferencesRecord => ({
  userId: String(row.user_id),
  academyDiscipline: optionalString(row.academy_discipline) as Discipline | undefined,
  academyLevel: optionalString(row.academy_level) as UserPreferencesRecord["academyLevel"],
  academyFocus: optionalString(row.academy_focus),
  useRiderProfile: Boolean(row.use_rider_profile),
  useSelectedHorse: Boolean(row.use_selected_horse),
  useRideHistory: Boolean(row.use_ride_history),
  reducedPersonalization: Boolean(row.reduced_personalization),
  version: Number(row.version),
  updatedAt: String(row.updated_at)
});

const mapNotifications = (row: Row): NotificationPreferencesRecord => ({
  userId: String(row.user_id),
  humanMessages: Boolean(row.human_messages),
  orderChanges: Boolean(row.order_changes),
  horseReminders: Boolean(row.horse_reminders),
  academyReminders: Boolean(row.academy_reminders),
  messagePreviews: Boolean(row.message_previews),
  quietHoursTimezone: String(row.quiet_hours_timezone),
  quietHoursStart: optionalString(row.quiet_hours_start),
  quietHoursEnd: optionalString(row.quiet_hours_end),
  updatedAt: String(row.updated_at)
});

const mapDeletionRequest = (row: Row): AccountDeletionRequestRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  reason: optionalString(row.reason),
  requestedAt: String(row.requested_at),
  scheduledFor: String(row.scheduled_for),
  canceledAt: optionalString(row.canceled_at),
  completedAt: optionalString(row.completed_at)
});

const mapHorse = (row: Row): HorseRecord => ({
  id: String(row.id),
  ownerId: String(row.owner_id),
  name: String(row.name),
  breed: optionalString(row.breed),
  discipline: optionalString(row.discipline) as Discipline | undefined,
  birthDate: optionalString(row.birth_date),
  sex: optionalString(row.sex) as HorseRecord["sex"],
  heightCm: row.height_cm === null || row.height_cm === undefined ? undefined : Number(row.height_cm),
  photoPath: optionalString(row.photo_path),
  isPrimary: Boolean(row.is_primary),
  archivedAt: optionalString(row.archived_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

export class AccountRepository {
  private readonly edge: EdgeClient;
  private readonly uploads: UploadRepository;

  constructor(private readonly client: SupabaseClient) {
    this.edge = new EdgeClient(client);
    this.uploads = new UploadRepository(client);
  }

  private async user(): Promise<User> {
    const { data, error } = await this.client.auth.getUser();
    if (error || !data.user) throw backendError(error, "Authentication is required.");
    return data.user;
  }

  async snapshot(): Promise<AccountSnapshot> {
    const user = await this.user();
    const [
      { data: profile, error: profileError },
      { data: preferences, error: preferencesError },
      { data: notifications, error: notificationsError },
      { data: deletion, error: deletionError },
      { data: primaryHorse, error: horseError }
    ] = await Promise.all([
      this.ownProfileRow(user.id),
      this.client.from("user_preferences").select("*").eq("user_id", user.id).single(),
      this.client.from("notification_preferences").select("*").eq("user_id", user.id).single(),
      this.client.from("account_deletion_requests").select("*").eq("user_id", user.id)
        .is("completed_at", null).is("canceled_at", null).maybeSingle(),
      this.client.from("horses").select("*").eq("owner_id", user.id)
        .eq("is_primary", true).is("archived_at", null).maybeSingle()
    ]);
    const mappedProfile = mapProfile(requireData(profile as Row | null, profileError, "Profile could not be loaded."));
    if (mappedProfile.avatarPath) {
      const { data } = await this.client.storage.from("avatars").createSignedUrl(mappedProfile.avatarPath, 900);
      mappedProfile.avatarUrl = data?.signedUrl;
    }
    return {
      userId: user.id,
      email: user.email ?? "",
      emailVerified: Boolean(user.email_confirmed_at),
      profile: mappedProfile,
      primaryHorse: primaryHorse
        ? mapHorse(requireData(primaryHorse as Row | null, horseError, "Primary horse could not be loaded."))
        : undefined,
      preferences: mapPreferences(requireData(preferences as Row | null, preferencesError, "Preferences could not be loaded.")),
      notifications: mapNotifications(requireData(notifications as Row | null, notificationsError, "Notification settings could not be loaded.")),
      deletionRequest: deletion
        ? mapDeletionRequest(requireData(deletion as Row | null, deletionError, "Deletion request could not be loaded."))
        : undefined
    };
  }

  async completeOnboarding(input: {
    displayName: string;
    locale: string;
    discipline: Discipline;
    skillLevel: NonNullable<ProfileRecord["skillLevel"]>;
    horseName?: string;
    horseBreed?: string;
    horsePhotoPath?: string;
  }): Promise<{ profileId: string; horseId?: string }> {
    const { data, error } = await this.client.rpc("complete_equina_onboarding", {
      display_name_input: input.displayName.trim(),
      locale_input: input.locale,
      discipline_input: input.discipline,
      skill_input: input.skillLevel,
      horse_name_input: input.horseName?.trim() || null,
      horse_breed_input: input.horseBreed?.trim() || null,
      horse_photo_path_input: input.horsePhotoPath?.trim() || null
    });
    const row = Array.isArray(data) ? data[0] as Row | undefined : data as Row | null;
    if (error || !row) throw backendError(error, "Account setup could not be completed.");
    return {
      profileId: String(row.profile_id),
      horseId: row.horse_id ? String(row.horse_id) : undefined
    };
  }

  async updateProfile(input: {
    displayName: string;
    locale: string;
    discipline?: Discipline;
    skillLevel?: NonNullable<ProfileRecord["skillLevel"]>;
  }): Promise<ProfileRecord> {
    const user = await this.user();
    const { data, error } = await this.client.from("profiles").update({
      display_name: input.displayName.trim(),
      locale: input.locale,
      discipline: input.discipline ?? null,
      skill_level: input.skillLevel ?? null
    }).eq("id", user.id).select("id").single();
    requireData(data as Row | null, error, "Profile could not be saved.");
    return await this.ownProfile(user.id, "Profile could not be saved.");
  }

  async uploadAvatar(asset: UploadAsset): Promise<ProfileRecord> {
    const user = await this.user();
    await this.uploads.upload("avatar", user.id, asset);
    return await this.ownProfile(user.id, "Avatar could not be saved.");
  }

  // Other accounts can read only a rider's name and photo (202610050002), so
  // the rider's own full profile comes from my_profile(), not the table.
  private async ownProfile(userId: string, failure: string): Promise<ProfileRecord> {
    const { data, error } = await this.ownProfileRow(userId);
    return mapProfile(requireData(data as Row | null, error, failure));
  }

  private async ownProfileRow(userId: string) {
    const result = await this.client.rpc("my_profile").single();
    // Before 202610050002 reaches a database the function does not exist yet
    // (PGRST202) and the table still returns the whole row. Remove once
    // production has the migration.
    if (result.error?.code === "PGRST202") {
      return await this.client.from("profiles").select("*").eq("id", userId).single();
    }
    return result;
  }

  async updatePreferences(
    patch: Partial<Omit<UserPreferencesRecord, "userId" | "version" | "updatedAt">>
  ): Promise<UserPreferencesRecord> {
    const user = await this.user();
    const payload: Record<string, unknown> = {};
    if ("academyDiscipline" in patch) payload.academy_discipline = patch.academyDiscipline ?? null;
    if ("academyLevel" in patch) payload.academy_level = patch.academyLevel ?? null;
    if ("academyFocus" in patch) payload.academy_focus = patch.academyFocus?.trim() || null;
    if ("useRiderProfile" in patch) payload.use_rider_profile = patch.useRiderProfile;
    if ("useSelectedHorse" in patch) payload.use_selected_horse = patch.useSelectedHorse;
    if ("useRideHistory" in patch) payload.use_ride_history = patch.useRideHistory;
    if ("reducedPersonalization" in patch) payload.reduced_personalization = patch.reducedPersonalization;
    const { data, error } = await this.client.from("user_preferences").update(payload)
      .eq("user_id", user.id).select("*").single();
    return mapPreferences(requireData(data as Row | null, error, "Preferences could not be saved."));
  }

  async updateNotifications(
    patch: Partial<Omit<NotificationPreferencesRecord, "userId" | "updatedAt">>
  ): Promise<NotificationPreferencesRecord> {
    const user = await this.user();
    const payload: Record<string, unknown> = {};
    if ("humanMessages" in patch) payload.human_messages = patch.humanMessages;
    if ("orderChanges" in patch) payload.order_changes = patch.orderChanges;
    if ("horseReminders" in patch) payload.horse_reminders = patch.horseReminders;
    if ("academyReminders" in patch) payload.academy_reminders = patch.academyReminders;
    if ("messagePreviews" in patch) payload.message_previews = patch.messagePreviews;
    if ("quietHoursTimezone" in patch) payload.quiet_hours_timezone = patch.quietHoursTimezone;
    if ("quietHoursStart" in patch) payload.quiet_hours_start = patch.quietHoursStart ?? null;
    if ("quietHoursEnd" in patch) payload.quiet_hours_end = patch.quietHoursEnd ?? null;
    const { data, error } = await this.client.from("notification_preferences").update(payload)
      .eq("user_id", user.id).select("*").single();
    return mapNotifications(requireData(data as Row | null, error, "Notification settings could not be saved."));
  }

  async blockedAccounts(): Promise<BlockedAccountRecord[]> {
    const user = await this.user();
    const { data: blocks, error: blocksError } = await this.client.from("user_blocks")
      .select("blocked_id,created_at").eq("blocker_id", user.id).order("created_at", { ascending: false });
    if (blocksError) throw backendError(blocksError, "Blocked accounts could not be loaded.");
    const ids = (blocks ?? []).map((row) => String(row.blocked_id));
    if (!ids.length) return [];
    const { data: profiles, error: profilesError } = await this.client.from("profiles")
      .select("id,display_name,avatar_path").in("id", ids);
    if (profilesError) throw backendError(profilesError, "Blocked profiles could not be loaded.");
    return ids.map((id) => {
      const profile = (profiles ?? []).find((entry) => entry.id === id);
      const block = (blocks ?? []).find((entry) => entry.blocked_id === id);
      return {
        id,
        displayName: profile?.display_name ? String(profile.display_name) : "Blocked rider",
        avatarPath: optionalString(profile?.avatar_path),
        blockedAt: String(block?.created_at ?? "")
      };
    });
  }

  async unblock(userId: string): Promise<void> {
    const user = await this.user();
    const { error } = await this.client.from("user_blocks").delete()
      .eq("blocker_id", user.id).eq("blocked_id", userId);
    if (error) throw backendError(error, "Account could not be unblocked.");
  }

  async requestDataExport(): Promise<DataExportRecord> {
    return await this.edge.invoke<DataExportRecord>("request-data-export");
  }

  async scheduleDeletion(reason?: string): Promise<AccountDeletionRequestRecord> {
    const response = await this.edge.invoke<{ request: Row }>("schedule-account-deletion", { reason });
    return mapDeletionRequest(response.request);
  }

  async cancelDeletion(): Promise<AccountDeletionRequestRecord> {
    const response = await this.edge.invoke<{ request: Row }>("cancel-account-deletion");
    return mapDeletionRequest(response.request);
  }
}
