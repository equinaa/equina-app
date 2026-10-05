import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createUserClient, requireUser } from "../_shared/supabase.ts";
import { playbackUrlFor } from "../_shared/video-hosting.ts";

// Long enough to watch a lesson twice with a break in between; short enough
// that a copied link is dead by the evening. The app asks again when a link
// it holds is close to expiring, so riders never see the limit.
const linkLifetimeSeconds = 3 * 60 * 60;

const lessonIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { token } = await requireUser(request);
    const { lessonId } = await readJson<{ lessonId?: unknown }>(request);
    if (typeof lessonId !== "string" || !lessonIdPattern.test(lessonId)) {
      throw new HttpError(400, "Choose a lesson to watch.", "invalid_lesson");
    }

    // Asked with the rider's own session: whether they may watch is decided
    // in the database, the same rule the admin preview goes through.
    const { data, error } = await createUserClient(token).rpc("academy_playback_source", { target_lesson: lessonId });
    if (error) {
      if (error.code === "P0002") throw new HttpError(404, "This lesson is not available.", "lesson_not_found");
      // A paid lesson the rider's plan does not open (202610060001). The app
      // answers with the rider's picks and the plans, so this is not an error
      // to show as one.
      if (error.code === "PT402") throw new HttpError(402, "This lesson is not part of your plan.", "lesson_locked");
      throw error;
    }
    const source = (data as Array<{ provider: string; asset_id: string | null; playback_id: string | null; status: string }> | null)?.[0];
    if (!source || source.status !== "ready") {
      throw new HttpError(409, "This lesson's video is still being prepared.", "video_not_ready");
    }

    const expiresAt = Math.floor(Date.now() / 1000) + linkLifetimeSeconds;
    const url = await playbackUrlFor(
      { provider: source.provider, assetId: source.asset_id, playbackId: source.playback_id },
      expiresAt
    );
    return json({ url, expiresAt: new Date(expiresAt * 1000).toISOString() });
  } catch (error) {
    return respondToError(error);
  }
});
