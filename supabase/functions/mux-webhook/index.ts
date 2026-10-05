import { HttpError, json, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { deleteMuxAsset } from "../_shared/mux-api.ts";
import { muxVideoChange, verifyMuxSignature } from "../_shared/mux.ts";
import { createAdminClient } from "../_shared/supabase.ts";

// Mux reports here when an upload becomes a video, when the video is ready to
// play, and when either fails. Nothing is read unless it carries our webhook
// signature, and nothing changes unless a lesson is waiting for that upload.
//
// Mux retries until it gets a 2xx and does not promise order, so every change
// below can be applied twice or late: a late "asset created" never turns a
// ready video back into processing, and a failure never replaces a video that
// is already ready.

const waitingStatuses = ["uploading", "processing"];

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  try {
    requireMethod(request, "POST");
    const secret = Deno.env.get("MUX_WEBHOOK_SECRET")?.trim();
    if (!secret) throw new HttpError(503, "Video webhooks are not configured.", "video_host_unavailable");

    const body = await request.text();
    if (body.length > 1_000_000) throw new HttpError(413, "Request body is too large.", "request_too_large");
    if (!await verifyMuxSignature({ secret, header: request.headers.get("mux-signature"), body })) {
      throw new HttpError(401, "The webhook signature does not match.", "invalid_signature");
    }

    let event: unknown;
    try {
      event = JSON.parse(body);
    } catch {
      throw new HttpError(400, "Request body must be valid JSON.", "invalid_json");
    }
    const change = muxVideoChange(event);
    if (!change) return json({ received: true });

    const admin = createAdminClient();
    const { data: waiting, error: lookupError } = await admin.from("academy_videos")
      .select("lesson_id").eq("upload_id", change.uploadId).maybeSingle();
    if (lookupError) throw lookupError;

    // No lesson is waiting for this upload: it was replaced, or its lesson was
    // deleted. Its video would hold one of the free plan's ten slots forever.
    if (!waiting) {
      if (change.assetId) await deleteMuxAsset(change.assetId);
      return json({ received: true });
    }

    if (change.kind === "asset_created") {
      const { error } = await admin.from("academy_videos")
        .update({ asset_id: change.assetId, status: "processing" })
        .eq("upload_id", change.uploadId).in("status", waitingStatuses);
      if (error) throw error;
    } else if (change.kind === "ready") {
      const { error } = await admin.from("academy_videos")
        .update({ asset_id: change.assetId, playback_id: change.playbackId, status: "ready", failure_reason: null })
        .eq("upload_id", change.uploadId);
      if (error) throw error;
      // The lesson is as long as its video. Uploads are only for drafts, so
      // no rider is mid-lesson when this changes.
      if (change.durationSeconds) {
        const { error: lengthError } = await admin.from("academy_lessons")
          .update({ duration_seconds: change.durationSeconds }).eq("id", waiting.lesson_id);
        if (lengthError) throw lengthError;
      }
    } else {
      const { data: failed, error } = await admin.from("academy_videos")
        .update({ asset_id: null, status: "failed", failure_reason: change.reason })
        .eq("upload_id", change.uploadId).neq("status", "ready").select("lesson_id");
      if (error) throw error;
      // The failed video can never play; keeping it would only hold a slot.
      if (failed?.length && change.assetId) await deleteMuxAsset(change.assetId);
    }

    return json({ received: true });
  } catch (error) {
    return respondToError(error, requestId, "mux-webhook");
  }
});
