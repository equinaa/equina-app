import { z } from "npm:zod@3.24.1";
import { handleOptions, HttpError, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireFeature, requireUser } from "../_shared/supabase.ts";

const inputSchema = z.object({
  token: z.string().trim().min(12).max(512),
  platform: z.enum(["ios", "android"]),
  appVersion: z.string().trim().min(1).max(40),
});

const sha256 = async (value: string) => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user, token: authToken } = await requireUser(request);
    await requireFeature(authToken, "push_notifications");
    const input = inputSchema.parse(await readJson<unknown>(request));
    if (!/^ExponentPushToken\[[^\]]+\]$|^ExpoPushToken\[[^\]]+\]$/.test(input.token)) {
      throw new HttpError(400, "Push token is invalid.", "invalid_push_token");
    }
    const admin = createAdminClient();
    const tokenHash = await sha256(input.token);
    const { data: existing, error: existingError } = await admin.from("push_devices")
      .select("id,user_id").eq("token_hash", tokenHash).maybeSingle();
    if (existingError) throw existingError;
    if (existing && existing.user_id !== user.id) {
      throw new HttpError(409, "This device is already linked to another account.", "push_token_owned");
    }

    const { data, error } = await admin.from("push_devices").upsert({
      id: existing?.id,
      user_id: user.id,
      token_hash: tokenHash,
      expo_push_token: input.token,
      platform: input.platform,
      app_version: input.appVersion,
      last_seen_at: new Date().toISOString(),
      disabled_reason: null,
      revoked_at: null,
    }, { onConflict: "token_hash" }).select("id,platform,app_version,last_seen_at").single();
    if (error || !data) throw error ?? new Error("Push device could not be registered.");
    await admin.from("account_audit_events").insert({
      user_id: user.id,
      event_type: "push_device_registered",
      detail: { deviceId: data.id, platform: input.platform },
    });
    return json({ device: data });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: "Push device input is invalid.", code: "invalid_request" }, 400);
    }
    return respondToError(error);
  }
});
