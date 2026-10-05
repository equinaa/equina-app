import { bunnyPlaylistUrl } from "./bunny-stream.ts";
import { HttpError } from "./http.ts";
import { muxPlaylistUrl } from "./mux.ts";

// Every lesson link is minted here. The app and the admin ask for "a link to
// this lesson that works until this time" and never learn which host holds
// the video, so moving a lesson between hosts is a different `provider` on
// its academy_videos row. Mux holds lesson videos today; Bunny Stream stays
// signable for any video placed there.

// A missing secret is a host that cannot serve right now, not a crash: the
// rider is told the video is unavailable, and the failure is the 503 status
// rather than an internal error.
const hostSetting = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(503, "Lesson videos are not available right now.", "video_host_unavailable");
  return value;
};

export type VideoSource = {
  provider: string;
  assetId: string | null;
  /** Mux serves by playback id; Bunny by its video id, and leaves this null. */
  playbackId: string | null;
};

export const playbackUrlFor = async (source: VideoSource, expiresAt: number): Promise<string> => {
  switch (source.provider) {
    case "mux":
      if (!source.playbackId) break;
      return await muxPlaylistUrl({
        signingKeyId: hostSetting("MUX_SIGNING_KEY_ID"),
        signingKey: hostSetting("MUX_SIGNING_KEY_PRIVATE"),
        playbackId: source.playbackId,
        expiresAt
      });
    case "bunny":
      if (!source.assetId) break;
      return await bunnyPlaylistUrl({
        cdnHostname: hostSetting("BUNNY_STREAM_CDN_HOSTNAME"),
        tokenKey: hostSetting("BUNNY_STREAM_TOKEN_KEY"),
        assetId: source.assetId,
        expiresAt
      });
  }
  throw new HttpError(503, "Lesson videos are not available right now.", "video_host_unavailable");
};
