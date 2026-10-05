import { HttpError } from "./http.ts";
import { isMuxId } from "./mux.ts";

// Calls to the Mux Video API, with the access token kept in Supabase secrets.
// A missing token is a host that cannot take uploads right now, not a crash.
const muxSetting = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(503, "Video uploads are not available right now.", "video_host_unavailable");
  return value;
};

const muxRequest = async (path: string, init: RequestInit = {}) => {
  const credentials = btoa(`${muxSetting("MUX_TOKEN_ID")}:${muxSetting("MUX_TOKEN_SECRET")}`);
  return await fetch(`https://api.mux.com${path}`, {
    ...init,
    headers: { Authorization: `Basic ${credentials}`, "Content-Type": "application/json", ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
};

// A direct upload: the admin's browser sends the file straight to Mux, so the
// video never passes through an edge function. The lesson id rides along as
// passthrough, and the asset is created with signed playback only.
export const createMuxUpload = async ({ lessonId, corsOrigin }: { lessonId: string; corsOrigin: string }) => {
  const response = await muxRequest("/video/v1/uploads", {
    method: "POST",
    body: JSON.stringify({
      cors_origin: corsOrigin,
      // Six hours to finish sending the file; a long lesson on hotel Wi-Fi
      // takes a while.
      timeout: 6 * 60 * 60,
      new_asset_settings: {
        playback_policies: ["signed"],
        video_quality: "basic",
        passthrough: lessonId,
      },
    }),
  });
  const body = await response.json().catch(() => null) as { data?: { id?: unknown; url?: unknown } } | null;
  const id = body?.data?.id;
  const url = body?.data?.url;
  if (!response.ok || !isMuxId(id) || typeof url !== "string" || !url.startsWith("https://")) {
    throw new HttpError(502, "Mux did not accept the upload. Try again in a moment.", "video_host_error");
  }
  return { uploadId: id, uploadUrl: url };
};

// Deleting is how the free plan's ten videos stay ten: a replaced or orphaned
// video would otherwise keep a slot. Already gone counts as done.
export const deleteMuxAsset = async (assetId: string) => {
  if (!isMuxId(assetId)) return;
  const response = await muxRequest(`/video/v1/assets/${assetId}`, { method: "DELETE" });
  if (!response.ok && response.status !== 404) {
    throw new HttpError(502, "Mux did not delete the old video. Try again in a moment.", "video_host_error");
  }
};
