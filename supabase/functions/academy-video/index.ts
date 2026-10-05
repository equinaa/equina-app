import { HttpError, handleOptions, json, readJson, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { createMuxUpload, deleteMuxAsset } from "../_shared/mux-api.ts";
import { createAdminClient, createUserClient, requireUser } from "../_shared/supabase.ts";

// Staff open an upload for a draft lesson's video, or remove that video. The
// admin calls this with the staff member's own session, and the database
// decides whether they may (staff_prepare_lesson_video: staff, second factor,
// draft). Only then does this function reach for the service role and the
// Mux token.

const lessonIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The admin's own address. Mux accepts the file only from this origin.
const uploadOrigin = (value: unknown) => {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    const local = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    return url.protocol === "https:" || local ? url.origin : null;
  } catch {
    return null;
  }
};

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  const requestId = requestIdFor(request);
  try {
    requireMethod(request, "POST");
    const { token } = await requireUser(request);
    const { action, lessonId, origin } = await readJson<{ action?: unknown; lessonId?: unknown; origin?: unknown }>(request);
    if (typeof lessonId !== "string" || !lessonIdPattern.test(lessonId)) {
      throw new HttpError(400, "Choose a lesson.", "invalid_lesson");
    }
    if (action !== "upload" && action !== "remove") {
      throw new HttpError(400, "Choose to upload or remove the video.", "invalid_action");
    }

    const { error: refused } = await createUserClient(token).rpc("staff_prepare_lesson_video", { target_lesson: lessonId });
    if (refused) {
      if (refused.code === "42501") throw new HttpError(403, "A staff session with a second factor is required.", "staff_required");
      if (refused.code === "P0002") throw new HttpError(404, "This lesson no longer exists.", "lesson_not_found");
      if (refused.code === "P0001") throw new HttpError(409, refused.message, "lesson_published");
      throw refused;
    }

    const admin = createAdminClient();
    const { data: previous, error: previousError } = await admin.from("academy_videos")
      .select("provider, asset_id").eq("lesson_id", lessonId).maybeSingle();
    if (previousError) throw previousError;
    const previousMuxAsset = previous?.provider === "mux" && previous.asset_id ? String(previous.asset_id) : null;

    if (action === "remove") {
      // Mux first: a row deleted while its video stays at Mux would hold one
      // of the free plan's ten slots with nothing pointing at it.
      if (previousMuxAsset) await deleteMuxAsset(previousMuxAsset);
      const { error } = await admin.from("academy_videos").delete().eq("lesson_id", lessonId);
      if (error) throw error;
      return json({ removed: Boolean(previous) });
    }

    const corsOrigin = uploadOrigin(origin);
    if (!corsOrigin) throw new HttpError(400, "Send the admin's address with the request.", "invalid_origin");

    const upload = await createMuxUpload({ lessonId, corsOrigin });
    const { error: saveError } = await admin.from("academy_videos").upsert({
      lesson_id: lessonId,
      provider: "mux",
      upload_id: upload.uploadId,
      asset_id: null,
      playback_id: null,
      status: "uploading",
      failure_reason: null,
    }, { onConflict: "lesson_id" });
    if (saveError) throw saveError;

    // The draft's earlier video goes once the new upload is on record. If Mux
    // refuses, the slot stays used, but the lesson never points at nothing.
    if (previousMuxAsset) {
      await deleteMuxAsset(previousMuxAsset).catch(() => {
        console.error("Replaced Mux asset was not deleted", { request_id: requestId, asset_id: previousMuxAsset });
      });
    }
    return json({ uploadUrl: upload.uploadUrl });
  } catch (error) {
    return respondToError(error, requestId, "academy-video");
  }
});
