import { handleOptions, HttpError, json, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireFeature, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user, token } = await requireUser(request);
    await requireFeature(token, "account_settings");
    const admin = createAdminClient();
    const { data, error } = await admin.from("account_deletion_requests").update({
      canceled_at: new Date().toISOString(),
    }).eq("user_id", user.id).is("completed_at", null).is("canceled_at", null).select("*").maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "No active deletion request was found.", "deletion_request_not_found");
    await admin.from("account_audit_events").insert({
      user_id: user.id,
      event_type: "deletion_canceled",
      request_id: data.id,
      detail: {},
    });
    return json({ request: data });
  } catch (error) {
    return respondToError(error);
  }
});
