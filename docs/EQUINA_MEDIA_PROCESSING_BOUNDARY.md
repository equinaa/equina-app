# Equina Media Processing Boundary

## Current Gate

`complete-upload` verifies the authenticated owner/editor, ticket expiry,
bucket/path ownership, declared size and MIME type, magic bytes, and content hash
where duplicate detection is required. It then calls a private malware-scanning
adapter before creating any active media reference.

The adapter receives a short-lived signed download URL, MIME type, byte size, and
the SHA-256 hash when already calculated. It must return:

```json
{ "verdict": "clean" }
```

`malicious` is rejected and queued for private Storage cleanup. Provider failures
fail closed when `MALWARE_SCAN_REQUIRED=true`. Scanner credentials are Edge
Function secrets and must never enter Expo, Vercel client variables, logs, or
documentation.

## Image Metadata Processing

EXIF removal and image normalization are not implemented in the current worker.
Until the processor below exists, image upload is approved only for named internal
users and public Club/listing publishing remains disabled.

Required processor contract:

1. Claim a database job with a lease token.
2. Download the private source object through a service-generated signed URL.
3. Decode and re-encode JPEG/PNG/HEIC into an approved output format.
4. Remove EXIF, GPS, device, author, thumbnail, and free-text metadata.
5. Enforce maximum dimensions and recompute MIME type, byte size, and SHA-256.
6. Write to a new immutable object path.
7. Atomically replace the active media reference and queue the source for cleanup.
8. Complete using the same lease token; stale workers cannot publish output.

Video uploads additionally require transcoding, metadata removal, duration and
codec limits, thumbnail generation, and moderation before Club can be public.

## Activation Evidence

Before setting `MALWARE_SCAN_REQUIRED=true` and expanding beyond internal users:

- clean, EICAR-style test, timeout, malformed response, and provider 5xx pass;
- no signed URL or scanner token appears in logs;
- rejected objects are removed by the cleanup scheduler;
- image GPS/EXIF removal is proven with before/after fixtures;
- public media cannot become visible while scan or processing is pending.
