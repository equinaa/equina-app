import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireStaff, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const roles = await requireStaff(user.id);
    if (!roles.includes("admin")) throw new HttpError(403, "An administrator account is required.", "admin_required");
    const { sanctionId } = await readJson<{ sanctionId: string }>(request);
    const admin = createAdminClient();
    const { data, error } = await admin.from("user_sanctions").update({
      lifted_at: new Date().toISOString(), lifted_by: user.id,
    }).eq("id", sanctionId).is("lifted_at", null).select("id,user_id,lifted_at").maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, "Active sanction not found.", "sanction_not_found");
    return json({ sanction: data });
  } catch (error) {
    return respondToError(error);
  }
});
