import { handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

// Every account can schedule its own deletion: App Store guideline 5.1.1(v)
// requires it, so it is not behind the account_settings rollout flag.
//
// There is no "signed in within ten minutes" check any more. It read the
// token's iat, which every hourly refresh resets, so it passed or failed by
// chance, and the app had no way to re-authenticate when it failed. What
// protects the rider instead: a signed-in session, an explicit confirmation,
// a fourteen-day window in which signing in and tapping "Keep my account"
// cancels everything, and an audit event for each step.

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const body = await readJson<{ reason?: unknown }>(request);
    const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : null;
    const requestedAt = new Date().toISOString();
    const scheduledFor = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    const admin = createAdminClient();
    const { data, error } = await admin.from("account_deletion_requests").upsert({
      user_id: user.id,
      reason,
      requested_at: requestedAt,
      scheduled_for: scheduledFor,
      canceled_at: null,
      completed_at: null,
      // A request scheduled again after a cancel starts fresh. Otherwise it
      // inherits the old attempt count and backoff, and one that had used up
      // its 20 attempts would never be picked up by the worker again.
      attempts: 0,
      next_attempt_at: requestedAt,
      lease_token: null,
      lease_expires_at: null,
      processing_started_at: null,
      last_error_code: null,
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
