import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRecord } from "./contracts";
import { signedUrlsFor } from "./signed-urls";

/**
 * The rider's own profile with its photo's signed URL, as the account snapshot
 * carries it. The profile handed back after an avatar upload or a profile save
 * replaces the one on screen: without the URL the new photo showed as initials
 * and a saved name took the old photo away until the next launch. A photo that
 * cannot be signed is left out, never fatal.
 */
export async function withAvatarUrl(client: SupabaseClient, profile: ProfileRecord): Promise<ProfileRecord> {
  if (!profile.avatarPath) return profile;
  const { urls } = await signedUrlsFor(client, "avatars", [profile.avatarPath]);
  return { ...profile, avatarUrl: urls.get(profile.avatarPath) };
}
