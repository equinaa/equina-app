import assert from "node:assert/strict";
import { createHmac, createVerify, generateKeyPairSync } from "node:crypto";
import {
  isMuxId,
  muxPlaybackToken,
  muxPlaylistUrl,
  muxVideoChange,
  verifyMuxSignature
} from "../supabase/functions/_shared/mux";

// --- Signed playback -----------------------------------------------------------

// Mux hands signing keys over as base64 of a PKCS#1 PEM. The token is checked
// here the way Mux checks it: RS256 over header.claims, with the public key.
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs1", format: "pem" }
});
const muxStyleKey = Buffer.from(privateKey).toString("base64");
const signingKeyId = "Kq0123SigningKeyId";
const playbackId = "qxb01i6T202018GFS02vp9RIe01icTcDCjVzQpmaB00CUisJ4";
const expiresAt = 1791000000;

const decodeSegment = (segment: string) => JSON.parse(Buffer.from(segment, "base64url").toString("utf8"));
const verifiesWith = (token: string, key: string) => {
  const [header = "", claims = "", signature = ""] = token.split(".");
  return createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(key, Buffer.from(signature, "base64url"));
};

const playlist = new URL(await muxPlaylistUrl({ signingKeyId, signingKey: muxStyleKey, playbackId, expiresAt }));
assert.equal(playlist.origin, "https://stream.mux.com");
assert.equal(playlist.pathname, `/${playbackId}.m3u8`);
assert.deepEqual([...playlist.searchParams.keys()], ["token"], "Mux wants the token and nothing else in the query.");
const token = playlist.searchParams.get("token") ?? "";
const [headerSegment = "", claimsSegment = ""] = token.split(".");
assert.deepEqual(decodeSegment(headerSegment), { alg: "RS256", typ: "JWT", kid: signingKeyId });
assert.deepEqual(decodeSegment(claimsSegment), { sub: playbackId, aud: "v", exp: expiresAt, kid: signingKeyId });
assert.ok(verifiesWith(token, publicKey), "The token must verify with the signing key's public half.");

// The same key as PKCS#8, or pasted as the PEM itself, signs the same way.
const pkcs8 = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" }
});
const pkcs8Token = await muxPlaybackToken({ signingKeyId, signingKey: pkcs8.privateKey, playbackId, audience: "t", expiresAt });
assert.ok(verifiesWith(pkcs8Token, pkcs8.publicKey), "A PKCS#8 PEM must work as well.");
assert.equal(decodeSegment(pkcs8Token.split(".")[1] ?? "").aud, "t", "Thumbnails are signed for their own audience.");

await assert.rejects(
  muxPlaylistUrl({ signingKeyId, signingKey: muxStyleKey, playbackId: "../other", expiresAt }),
  /unexpected shape/,
  "A playback id that could change the URL must be refused."
);
await assert.rejects(muxPlaylistUrl({ signingKeyId, signingKey: muxStyleKey, playbackId, expiresAt: 1.5 }), /UNIX time/);
await assert.rejects(muxPlaylistUrl({ signingKeyId, signingKey: "bm90IGEga2V5", playbackId, expiresAt }), /not a PEM/);

// --- Webhook signatures ----------------------------------------------------------

const secret = "mux-webhook-test-secret";
const body = JSON.stringify({ type: "video.asset.ready", data: { id: "asset1" } });
const sentAt = 1791000000;
const sign = (payload: string, key = secret, at = sentAt) =>
  `t=${at},v1=${createHmac("sha256", key).update(`${at}.${payload}`).digest("hex")}`;

assert.equal(await verifyMuxSignature({ secret, header: sign(body), body, now: sentAt + 10 }), true);
assert.equal(await verifyMuxSignature({ secret, header: sign(body), body: body.replace("asset1", "asset2"), now: sentAt }), false,
  "A body changed after signing must be refused.");
assert.equal(await verifyMuxSignature({ secret, header: sign(body, "another-secret"), body, now: sentAt }), false,
  "A signature made with another secret must be refused.");
assert.equal(await verifyMuxSignature({ secret, header: sign(body), body, now: sentAt + 301 }), false,
  "A request replayed more than five minutes later must be refused.");
assert.equal(await verifyMuxSignature({ secret, header: sign(body), body, now: sentAt - 301 }), false);
assert.equal(await verifyMuxSignature({ secret, header: null, body, now: sentAt }), false);
assert.equal(await verifyMuxSignature({ secret, header: `t=${sentAt}`, body, now: sentAt }), false);
assert.equal(await verifyMuxSignature({ secret: "", header: sign(body), body, now: sentAt }), false,
  "Without a configured secret nothing verifies.");
assert.equal(
  await verifyMuxSignature({ secret, header: `${sign(body, "rotated-out")},v1=${sign(body).split("v1=")[1]}`, body, now: sentAt }),
  true,
  "Any one matching v1 signature is enough, as during a secret rotation."
);

// --- What each event changes --------------------------------------------------------

assert.equal(isMuxId("abc123"), true);
assert.equal(isMuxId("abc-123"), false);

assert.deepEqual(
  muxVideoChange({ type: "video.upload.asset_created", data: { id: "upload1", asset_id: "asset1" } }),
  { kind: "asset_created", uploadId: "upload1", assetId: "asset1" }
);
assert.deepEqual(
  muxVideoChange({
    type: "video.asset.ready",
    data: {
      id: "asset1",
      upload_id: "upload1",
      duration: 865.42,
      passthrough: "a0000000-0000-4000-8000-000000000001",
      playback_ids: [{ id: "public1", policy: "public" }, { id: "signed1", policy: "signed" }]
    }
  }),
  { kind: "ready", uploadId: "upload1", assetId: "asset1", playbackId: "signed1", durationSeconds: 866 },
  "Only the signed playback id is used, and the length rounds up to whole seconds."
);
assert.deepEqual(
  muxVideoChange({ type: "video.asset.ready", data: { id: "asset1", upload_id: "upload1", playback_ids: [{ id: "public1", policy: "public" }] } }),
  { kind: "failed", uploadId: "upload1", assetId: "asset1", reason: "Mux finished the video without a signed playback id." },
  "A video that could only be played publicly is a failure, not a lesson."
);
assert.deepEqual(
  muxVideoChange({ type: "video.asset.errored", data: { id: "asset1", upload_id: "upload1", errors: { messages: ["The input file is not a video."] } } }),
  { kind: "failed", uploadId: "upload1", assetId: "asset1", reason: "The input file is not a video." }
);
assert.deepEqual(
  muxVideoChange({ type: "video.upload.cancelled", data: { id: "upload1" } }),
  { kind: "failed", uploadId: "upload1", assetId: null, reason: "The upload was cancelled." }
);
assert.equal(muxVideoChange({ type: "video.asset.ready", data: { id: "asset1", playback_ids: [] } }), null,
  "An asset that did not come from one of our uploads is not ours to track.");
assert.equal(muxVideoChange({ type: "video.asset.created", data: { id: "asset1" } }), null);
assert.equal(muxVideoChange({ type: "video.upload.asset_created", data: { id: "up'; drop", asset_id: "asset1" } }), null);
assert.equal(muxVideoChange(null), null);

console.log("Mux rules passed.");
