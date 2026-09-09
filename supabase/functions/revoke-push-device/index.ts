import { z } from "npm:zod@3.24.1";
import { handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

const inputSchema = z.object({
  deviceId: z.string().uuid().optional(),
  all: z.boolean().optional(),
}).refine((value) => Boolean(value.deviceId) !== Boolean(value.all), {
  message: "Choose one device or all devices.",
});

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const input = inputSchema.parse(await readJson<unknown>(request));
    const admin = createAdminClient();
    let query = admin.from("push_devices").update({
      revoked_at: new Date().toISOString(),
      disabled_reason: "signed_out",
    }).eq("user_id", user.id).is("revoked_at", null);
    if (input.deviceId) query = query.eq("id", input.deviceId);
    const { data, error } = await query.select("id");
    if (error) throw error;
    await admin.from("account_audit_events").insert({
      user_id: user.id,
      event_type: "push_device_revoked",
      detail: { deviceCount: data?.length ?? 0 },
    });
    return json({ revoked: data?.length ?? 0 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return json({ error: "Push revoke input is invalid.", code: "invalid_request" }, 400);
    }
    return respondToError(error);
  }
});
