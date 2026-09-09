import { handleOptions, HttpError, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireFeature, requireUser } from "../_shared/supabase.ts";

const tokenIssuedAt = (token: string) => {
  try {
    const payload = token.split(".")[1];
    if (!payload) return 0;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const parsed = JSON.parse(atob(normalized)) as { iat?: unknown };
    return typeof parsed.iat === "number" ? parsed.iat * 1000 : 0;
  } catch {
    return 0;
  }
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user, token } = await requireUser(request);
    await requireFeature(token, "account_settings");
    if (Date.now() - tokenIssuedAt(token) > 10 * 60 * 1000) {
      throw new HttpError(401, "Verify your email again before deleting your account.", "recent_auth_required");
    }
    const body = await readJson<{ reason?: unknown }>(request);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
    const scheduledFor = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const admin = createAdminClient();
    const { data, error } = await admin.from("account_deletion_requests").upsert({
      user_id: user.id,
      reason,
      requested_at: new Date().toISOString(),
      scheduled_for: scheduledFor,
      canceled_at: null,
      completed_at: null,
    }, { onConflict: "user_id" }).select("*").single();
    if (error || !data) throw error ?? new Error("Deletion could not be scheduled.");
    await admin.from("account_audit_events").insert({
      user_id: user.id,
      event_type: "deletion_scheduled",
      request_id: data.id,
      detail: { scheduledFor },
    });
    return json({ request: data });
  } catch (error) {
    return respondToError(error);
  }
});
