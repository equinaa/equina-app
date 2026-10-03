// Signed playback links for Bunny Stream.
//
// Bunny's CDN token authentication, HMAC-SHA256 form ("HS256-"), as Bunny's
// own signer builds it (BunnyWay/BunnyCDN.TokenAuthentication, July 2026):
//
//   token = "HS256-" + base64url(HMAC-SHA256(key, signaturePath + expires + signingData))
//
// An HLS stream is a playlist plus one request per segment and quality, so a
// token for the playlist file alone would fail on the first segment. A
// directory token signs `token_path` instead: one token covers every file
// under the video's own directory, and nothing outside it -- a link to one
// lesson never opens another.
//
// No IP is signed. Riders move between Wi-Fi at the yard and 4G in the
// arena mid-lesson, and an IP-locked link would die at the handover.
//
// This file has no imports, so the Node test suite can check it against
// Bunny's reference signer as well as Deno running it in the edge function.

const encoder = new TextEncoder();

// Bunny video ids are GUIDs. Anything else would be spliced into a URL path.
const assetIdPattern = /^[A-Za-z0-9][A-Za-z0-9-]{0,99}$/;

const base64Url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export const bunnyPlaylistUrl = async ({
  cdnHostname,
  tokenKey,
  assetId,
  expiresAt
}: {
  /** The library's CDN hostname, e.g. vz-1a2b3c4d-5e6.b-cdn.net. */
  cdnHostname: string;
  /** The library's token authentication key, from Bunny's dashboard. */
  tokenKey: string;
  assetId: string;
  /** UNIX time, in seconds, after which Bunny refuses the link. */
  expiresAt: number;
}): Promise<string> => {
  if (!assetIdPattern.test(assetId)) throw new Error("Bunny video id has an unexpected shape.");
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) throw new Error("Expiry must be a UNIX time in seconds.");

  const tokenPath = `/${assetId}/`;
  // Bunny folds the signed parameters in sorted, with raw values. token_path
  // is the only one, so the sort is trivial -- but it is still signed, which
  // is what stops a token for one directory being replayed on another.
  const signingData = `token_path=${tokenPath}`;
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(tokenKey),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(`${tokenPath}${expiresAt}${signingData}`));
  const token = `HS256-${base64Url(new Uint8Array(digest))}`;

  // The token rides in the path rather than the query string, so the
  // relative segment URLs inside the playlist inherit it.
  return `https://${cdnHostname}/bcdn_token=${token}&token_path=${encodeURIComponent(tokenPath)}` +
    `&expires=${expiresAt}${tokenPath}playlist.m3u8`;
};
