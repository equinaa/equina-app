import { requireAutomationSecret } from "../_shared/automation.ts";
import { handleOptions, json, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { queueStorageCleanup } from "../_shared/storage-cleanup.ts";

const requireSuccess = async (
  query: PromiseLike<{ error: { message?: string } | null }>,
) => {
  const { error } = await query;
  if (error) throw error;
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    await requireAutomationSecret(
      request,
      "ACCOUNT_AUTOMATION_SECRET",
      "x-automation-secret",
    );
    const admin = createAdminClient();
    const now = new Date().toISOString();
    const { data: requests, error } = await admin.rpc("claim_account_deletions", {
      batch_size: 25,
      lease_seconds: 900,
    });
    if (error) throw error;

    const completed: string[] = [];
    const failed: Array<{ requestId: string; code: string }> = [];
    for (const deletion of requests ?? []) {
      const userId = String(deletion.user_id);
      try {
        const [
          { data: profile, error: profileError },
          { data: horses, error: horsesError },
          { data: posts, error: postsError },
          { data: exports, error: exportsError },
        ] = await Promise.all([
          admin.from("profiles").select("avatar_path").eq("id", userId).maybeSingle(),
          admin.from("horses").select("id,photo_path").eq("owner_id", userId),
          admin.from("club_posts").select("id").eq("author_id", userId),
          admin.from("data_export_requests").select("id,object_path").eq("user_id", userId),
        ]);
        if (profileError || horsesError || postsError || exportsError) {
          throw profileError ?? horsesError ?? postsError ?? exportsError;
        }

        const horseIds = (horses ?? []).map((horse) => String(horse.id));
        const postIds = (posts ?? []).map((post) => String(post.id));
        const { data: records, error: recordsError } = horseIds.length
          ? await admin.from("horse_records").select("id").in("horse_id", horseIds)
          : { data: [], error: null };
        if (recordsError) throw recordsError;
        const recordIds = (records ?? []).map((record) => String(record.id));
        const [
          { data: recordFiles, error: recordFilesError },
          { data: postMedia, error: postMediaError },
        ] = await Promise.all([
          recordIds.length
            ? admin.from("horse_record_files").select("id,object_path").in("record_id", recordIds)
            : Promise.resolve({ data: [], error: null }),
          postIds.length
            ? admin.from("club_post_media").select("id,object_path").in("post_id", postIds)
            : Promise.resolve({ data: [], error: null }),
        ]);
        if (recordFilesError || postMediaError) throw recordFilesError ?? postMediaError;

        await Promise.all([
          queueStorageCleanup(
            admin,
            "avatars",
            typeof profile?.avatar_path === "string" ? [profile.avatar_path] : [],
          ),
          queueStorageCleanup(
            admin,
            "horse-media",
            (horses ?? []).flatMap((horse) =>
              typeof horse.photo_path === "string" ? [horse.photo_path] : []
            ),
          ),
          queueStorageCleanup(
            admin,
            "horse-records",
            (recordFiles ?? []).map((file) => String(file.object_path)),
          ),
          queueStorageCleanup(
            admin,
            "club-media",
            (postMedia ?? []).map((media) => String(media.object_path)),
          ),
          queueStorageCleanup(
            admin,
            "account-exports",
            (exports ?? []).flatMap((item) =>
              typeof item.object_path === "string" ? [item.object_path] : []
            ),
          ),
        ]);

        const postMediaIds = (postMedia ?? []).map((media) => String(media.id));
        if (postMediaIds.length) {
          const { error: deleteMediaError } = await admin.from("club_post_media").delete().in("id", postMediaIds);
          if (deleteMediaError) throw deleteMediaError;
        }
        const { error: deleteHorsesError } = await admin.from("horses").delete().eq("owner_id", userId);
        if (deleteHorsesError) throw deleteHorsesError;
        const { error: deleteExportsError } = await admin.from("data_export_requests").delete().eq("user_id", userId);
        if (deleteExportsError) throw deleteExportsError;

        await requireSuccess(admin.from("push_devices").delete().eq("user_id", userId));
        await requireSuccess(admin.from("notification_outbox").delete().eq("recipient_id", userId));
        await requireSuccess(admin.from("coach_conversations").delete().eq("user_id", userId));
        await requireSuccess(admin.from("coach_usage_events").delete().eq("user_id", userId));
        await requireSuccess(admin.from("upload_tickets").delete().eq("user_id", userId));
        await requireSuccess(admin.from("club_memberships").delete().eq("user_id", userId));
        await requireSuccess(admin.from("club_reactions").delete().eq("user_id", userId));
        await requireSuccess(admin.from("saved_listings").delete().eq("user_id", userId));
        await requireSuccess(admin.from("club_posts").update({
          body: "[Deleted by rider]",
          moderation_status: "deleted",
        }).eq("author_id", userId));
        await requireSuccess(admin.from("club_comments").update({
          body: "[Deleted by rider]",
          moderation_status: "deleted",
        }).eq("author_id", userId));
        await requireSuccess(admin.from("marketplace_messages").update({
          body: "[Deleted by rider]",
          deleted_at: now,
        }).eq("sender_id", userId));
        await requireSuccess(admin.from("user_blocks").delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`));
        await requireSuccess(admin.from("profiles").update({
          display_name: "Deleted rider",
          avatar_path: null,
          location: null,
          discipline: null,
          skill_level: null,
          bio: null,
        }).eq("id", userId));
        await requireSuccess(admin.from("user_preferences").delete().eq("user_id", userId));
        await requireSuccess(admin.from("notification_preferences").delete().eq("user_id", userId));

        const { error: authError } = await admin.auth.admin.deleteUser(userId, true);
        if (authError) throw authError;
        await requireSuccess(admin.from("account_deletion_requests").update({
          completed_at: now,
          lease_token: null,
          lease_expires_at: null,
        }).eq("id", deletion.id).eq("lease_token", deletion.lease_token));
        await requireSuccess(admin.from("account_audit_events").insert({
          user_id: userId,
          event_type: "deletion_completed",
          request_id: deletion.id,
          detail: { retainedMarketplaceLegalRecords: true, softDeletedAuthIdentity: true },
        }));
        completed.push(String(deletion.id));
      } catch (itemError) {
        const attempts = Number(deletion.attempts ?? 1);
        const retryMinutes = Math.min(1440, 5 * 2 ** Math.min(attempts, 8));
        await admin.from("account_deletion_requests").update({
          next_attempt_at: new Date(Date.now() + retryMinutes * 60_000).toISOString(),
          lease_token: null,
          lease_expires_at: null,
          last_error_code: "deletion_failed",
        }).eq("id", deletion.id).eq("lease_token", deletion.lease_token);
        failed.push({
          requestId: String(deletion.id),
          code: itemError && typeof itemError === "object" && "code" in itemError
            ? String((itemError as { code?: unknown }).code ?? "deletion_failed")
            : "deletion_failed",
        });
      }
    }

    return json({ processed: (requests ?? []).length, completed, failed });
  } catch (error) {
    return respondToError(error);
  }
});
