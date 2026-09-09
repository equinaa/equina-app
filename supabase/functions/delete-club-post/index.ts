import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { queueStorageCleanup } from "../_shared/storage-cleanup.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const { postId } = await readJson<{ postId: string }>(request);
    const admin = createAdminClient();
    const { data: post } = await admin.from("club_posts").select("id,author_id").eq("id", postId).single();
    if (!post || post.author_id !== user.id) throw new HttpError(404, "Post not found.", "post_not_found");
    const { data: media, error: mediaError } = await admin.from("club_post_media").select("object_path").eq("post_id", postId);
    if (mediaError) throw mediaError;
    const paths = (media ?? []).map((entry) => entry.object_path as string);
    const { error: postError } = await admin.from("club_posts").update({ body: "[deleted]", moderation_status: "deleted" }).eq("id", postId);
    if (postError) throw postError;
    const { error: mediaDeleteError } = await admin.from("club_post_media").delete().eq("post_id", postId);
    if (mediaDeleteError) throw mediaDeleteError;
    const { error: moderationError } = await admin.from("content_moderation_jobs").update({
      status: "approved", result: { deleted: true }, completed_at: new Date().toISOString(), last_error: null,
    }).eq("target_type", "club_post").eq("target_id", postId);
    if (moderationError) throw moderationError;
    const cleanup = await queueStorageCleanup(admin, "club-media", paths);
    return json({ postId, deleted: true, cleanupPending: cleanup.pending });
  } catch (error) {
    return respondToError(error);
  }
});
