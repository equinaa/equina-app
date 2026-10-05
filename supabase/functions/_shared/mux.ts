// Mux: signed playback links, webhook signatures, and what each webhook
// event means for a lesson's video.
//
// This file has no imports, so the Node test suite can check it against
// node:crypto as well as Deno running it in the edge functions.

const encoder = new TextEncoder();

// Mux playback, asset and upload ids are letters and digits. Anything else
// would be spliced into a URL or a query.
const muxIdPattern = /^[A-Za-z0-9]{1,100}$/;
export const isMuxId = (value: unknown): value is string => typeof value === "string" && muxIdPattern.test(value);

const base64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const base64UrlJson = (value: unknown) => base64Url(encoder.encode(JSON.stringify(value)));
const base64Bytes = (value: string) => Uint8Array.from(atob(value), (char) => char.charCodeAt(0));

// --- Signing keys ------------------------------------------------------------

// Mux hands a signing key over as base64 of a PEM file, and the PEM holds an
// RSA key in PKCS#1 ("BEGIN RSA PRIVATE KEY"). WebCrypto imports only PKCS#8,
// so a PKCS#1 key is wrapped in the PKCS#8 envelope -- the same key, with
// "this is RSA" stated in front of it.
const derLength = (length: number) =>
  length < 0x80 ? [length]
    : length < 0x100 ? [0x81, length]
    : length < 0x10000 ? [0x82, length >> 8, length & 0xff]
    : [0x83, length >> 16, (length >> 8) & 0xff, length & 0xff];

const der = (tag: number, content: Uint8Array) => {
  const length = derLength(content.length);
  const out = new Uint8Array(1 + length.length + content.length);
  out[0] = tag;
  out.set(length, 1);
  out.set(content, 1 + length.length);
  return out;
};

const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
};

// AlgorithmIdentifier { rsaEncryption (1.2.840.113549.1.1.1), NULL }
const rsaAlgorithm = Uint8Array.of(0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00);
const pkcs1ToPkcs8 = (pkcs1: Uint8Array) =>
  der(0x30, concat(Uint8Array.of(0x02, 0x01, 0x00), rsaAlgorithm, der(0x04, pkcs1)));

const signingKeys = new Map<string, Promise<CryptoKey>>();

export const muxSigningKey = (privateKey: string): Promise<CryptoKey> => {
  const cached = signingKeys.get(privateKey);
  if (cached) return cached;
  const imported = (async () => {
    const trimmed = privateKey.trim();
    // Accept the PEM itself as well as Mux's base64 of it.
    const pem = trimmed.startsWith("-----BEGIN") ? trimmed : atob(trimmed);
    const match = /-----BEGIN (RSA )?PRIVATE KEY-----([\s\S]+?)-----END (?:RSA )?PRIVATE KEY-----/.exec(pem);
    if (!match) throw new Error("The Mux signing key is not a PEM private key.");
    const body = base64Bytes((match[2] ?? "").replace(/\s+/g, ""));
    return await crypto.subtle.importKey(
      "pkcs8",
      match[1] ? pkcs1ToPkcs8(body) : body,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"]
    );
  })();
  signingKeys.set(privateKey, imported);
  return imported;
};

// --- Playback ----------------------------------------------------------------

// A token is a JWT naming one playback id, one kind of use ("v" for video,
// "t" for a thumbnail) and an expiry. The token on the playlist URL is enough:
// Mux carries it to every rendition and segment the player asks for next.
export const muxPlaybackToken = async ({
  signingKeyId,
  signingKey,
  playbackId,
  audience,
  expiresAt
}: {
  signingKeyId: string;
  /** Base64 of the PEM private key, as Mux returns it. */
  signingKey: string;
  playbackId: string;
  audience: "v" | "t";
  /** UNIX time, in seconds, after which Mux refuses the token. */
  expiresAt: number;
}) => {
  if (!isMuxId(playbackId)) throw new Error("Mux playback id has an unexpected shape.");
  if (!isMuxId(signingKeyId)) throw new Error("Mux signing key id has an unexpected shape.");
  if (!Number.isInteger(expiresAt) || expiresAt <= 0) throw new Error("Expiry must be a UNIX time in seconds.");
  const header = base64UrlJson({ alg: "RS256", typ: "JWT", kid: signingKeyId });
  const claims = base64UrlJson({ sub: playbackId, aud: audience, exp: expiresAt, kid: signingKeyId });
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    await muxSigningKey(signingKey),
    encoder.encode(`${header}.${claims}`)
  );
  return `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
};

export const muxPlaylistUrl = async (options: {
  signingKeyId: string;
  signingKey: string;
  playbackId: string;
  expiresAt: number;
}) => {
  const token = await muxPlaybackToken({ ...options, audience: "v" });
  return `https://stream.mux.com/${options.playbackId}.m3u8?token=${token}`;
};

// --- Webhooks ----------------------------------------------------------------

// Mux-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">.
// Five minutes either way, as Mux's own SDKs allow, keeps a captured request
// from being replayed later.
const webhookTolerance = 5 * 60;

const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const sameText = (a: string, b: string) => {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) difference |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return difference === 0;
};

export const verifyMuxSignature = async ({
  secret,
  header,
  body,
  now = Math.floor(Date.now() / 1000)
}: {
  secret: string;
  header: string | null;
  body: string;
  now?: number;
}) => {
  if (!secret || !header) return false;
  const parts = header.split(",").map((part) => part.trim().split("="));
  const timestamp = Number(parts.find(([key]) => key === "t")?.[1]);
  const signatures = parts.filter(([key]) => key === "v1").map(([, value]) => value ?? "");
  if (!Number.isInteger(timestamp) || !signatures.length) return false;
  if (Math.abs(now - timestamp) > webhookTolerance) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const expected = hex(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${body}`))));
  return signatures.some((signature) => sameText(signature, expected));
};

// --- Events ------------------------------------------------------------------

// What a webhook event changes. Every change is matched on the upload the
// admin opened (academy_videos.upload_id), so an event for an upload that was
// since replaced changes nothing -- its asset is deleted instead.
export type MuxVideoChange =
  | { kind: "asset_created"; uploadId: string; assetId: string }
  | { kind: "ready"; uploadId: string; assetId: string; playbackId: string; durationSeconds: number | null }
  | { kind: "failed"; uploadId: string; assetId: string | null; reason: string };

type Payload = Record<string, unknown>;
const record = (value: unknown): Payload => (value && typeof value === "object" ? (value as Payload) : {});

const failureReason = (data: Payload, fallback: string) => {
  const messages = record(data.errors).messages;
  const text = Array.isArray(messages) ? messages.filter((message) => typeof message === "string").join(" ") : "";
  return (text.trim() || fallback).slice(0, 300);
};

export const muxVideoChange = (event: unknown): MuxVideoChange | null => {
  const { type, data: rawData } = record(event);
  const data = record(rawData);
  switch (type) {
    // Upload events carry the upload; asset events carry the asset, which
    // names the upload it came from.
    case "video.upload.asset_created":
      return isMuxId(data.id) && isMuxId(data.asset_id)
        ? { kind: "asset_created", uploadId: data.id, assetId: data.asset_id }
        : null;
    case "video.upload.errored":
    case "video.upload.cancelled":
      return isMuxId(data.id)
        ? {
            kind: "failed",
            uploadId: data.id,
            assetId: null,
            reason: type === "video.upload.cancelled" ? "The upload was cancelled." : failureReason(data, "The upload failed.")
          }
        : null;
    case "video.asset.ready": {
      if (!isMuxId(data.id) || !isMuxId(data.upload_id)) return null;
      // Lessons are created with signed playback only; a public playback id
      // would be a link anyone could share, so it is never used.
      const playbackIds = Array.isArray(data.playback_ids) ? data.playback_ids.map(record) : [];
      const signed = playbackIds.find((playback) => playback.policy === "signed" && isMuxId(playback.id));
      if (!signed) {
        return { kind: "failed", uploadId: data.upload_id, assetId: data.id, reason: "Mux finished the video without a signed playback id." };
      }
      const duration = Number(data.duration);
      return {
        kind: "ready",
        uploadId: data.upload_id,
        assetId: data.id,
        playbackId: signed.id as string,
        durationSeconds: Number.isFinite(duration) && duration > 0 ? Math.min(86400, Math.ceil(duration)) : null
      };
    }
    case "video.asset.errored":
      return isMuxId(data.id) && isMuxId(data.upload_id)
        ? { kind: "failed", uploadId: data.upload_id, assetId: data.id, reason: failureReason(data, "Mux could not process the video.") }
        : null;
    default:
      return null;
  }
};
