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

**Club photos** (202610060004) are handled in two places. The app redraws every
photo as a JPEG of at most 2048 px (`src/features/club/club-photo.ts`), which drops
the original's EXIF. On iOS the redrawn file still carries a small EXIF header of
its own (orientation, resolution, colour space; no location, time or device, checked
on the simulator) and an empty IPTC block, so the server step below is what
guarantees a clean file. `create-upload-ticket` accepts only `image/jpeg` for a
Club post, up to 15 MB, and `complete-upload` takes out every APP1 (EXIF, XMP),
APP3-APP13 (IPTC), APP15 and comment segment, keeping only JFIF, Adobe and ICC
colour data, then writes the cleaned file over the upload before the media row
exists (`_shared/image-metadata.ts`, `tests/image-metadata.test.ts`). The compressed
picture is copied byte for byte, so nothing about how it looks changes.

Other uploads (listing photos, record files, avatars) still go through the full
processor below before they can be public.

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
