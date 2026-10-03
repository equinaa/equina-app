import { bunnyPlaylistUrl } from "./bunny-stream.ts";
import { HttpError } from "./http.ts";

// Every lesson link is minted here. The app and the admin ask for "a link to
// this lesson that works until this time" and never learn which host holds
// the video, so moving a lesson between hosts is a different `provider` on
// its academy_videos row. Cloudflare Stream is the second host to evaluate;
// it arrives as a provider value in the migration and a case below.

// A missing secret is a host that cannot serve right now, not a crash: the
// rider is told the video is unavailable, and the failure is the 503 status
// rather than an internal error.
const hostSetting = (name: string) => {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new HttpError(503, "Lesson videos are not available right now.", "video_host_unavailable");
  return value;
};

export const playbackUrlFor = async (provider: string, assetId: string, expiresAt: number): Promise<string> => {
  switch (provider) {
    case "bunny":
      return await bunnyPlaylistUrl({
        cdnHostname: hostSetting("BUNNY_STREAM_CDN_HOSTNAME"),
        tokenKey: hostSetting("BUNNY_STREAM_TOKEN_KEY"),
        assetId,
        expiresAt
      });
    default:
      throw new HttpError(503, "Lesson videos are not available right now.", "video_host_unavailable");
  }
};
