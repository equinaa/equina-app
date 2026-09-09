import { HttpError, handleOptions, json, readJson, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { queueStorageCleanup } from "../_shared/storage-cleanup.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const { recordId } = await readJson<{ recordId: string }>(request);
    const admin = createAdminClient();
    const { data: record } = await admin.from("horse_records").select("id,horse_id,horses(owner_id)").eq("id", recordId).single();
    if (!record) throw new HttpError(404, "Record not found.", "record_not_found");
    const ownerId = (record.horses as { owner_id?: string } | null)?.owner_id;
    const { data: collaborator } = ownerId === user.id ? { data: null } : await admin.from("horse_collaborators")
      .select("user_id").eq("horse_id", record.horse_id).eq("user_id", user.id)
      .eq("access_role", "editor").not("accepted_at", "is", null).maybeSingle();
    if (ownerId !== user.id && !collaborator) throw new HttpError(404, "Record not found.", "record_not_found");

    const { data: files, error: filesError } = await admin.from("horse_record_files").select("object_path").eq("record_id", recordId);
    if (filesError) throw filesError;
    const paths = (files ?? []).map((file) => file.object_path as string);
    const { error: deleteError } = await admin.from("horse_records").delete().eq("id", recordId);
    if (deleteError) throw deleteError;
    const cleanup = await queueStorageCleanup(admin, "horse-records", paths);
    return json(
      { recordId, deleted: true, cleanupPending: cleanup.pending },
      200,
      { "x-request-id": requestId },
    );
  } catch (error) {
    return respondToError(error, requestId, "delete-horse-record");
  }
});
