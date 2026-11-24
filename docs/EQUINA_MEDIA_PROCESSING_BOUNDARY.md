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

The cleaner (`_shared/image-metadata.ts`, `tests/image-metadata.test.ts`) takes a
JPEG or a PNG apart into its labelled parts and copies only the ones needed to draw
the picture. Nothing is decoded: the compressed picture is copied byte for byte, so
nothing about how it looks changes.

- **JPEG.** Every APP1 (EXIF, XMP), APP3-APP13 (IPTC), APP15 and comment segment
  goes; JFIF, Adobe and ICC colour data stay. The file ends where its picture ends:
  a second picture with an EXIF of its own, the clip of a motion photo or a maker's
  block after it is not copied.
- **PNG.** Text, EXIF and time chunks go, and so does any chunk the cleaner does not
  know, and anything after the end of the file. Transparency, gamma, colour and
  animation chunks stay.
- **Orientation.** The one value kept from an EXIF is which way up the picture is,
  and only when it is stored turned: it is written back in an EXIF that holds
  nothing else. Without it, a photo sent as the camera wrote it would be shown lying
  down.
- **HEIC and HEIF** keep their metadata where the rest of the file points at it by
  position, so they cannot be cleaned without decoding. They are not accepted for a
  picture that gets cleaned.

**Club photos** (202610060004) are handled in two places. The app redraws every
photo as a JPEG of at most 2048 px (`src/features/club/club-photo.ts`), which drops
the original's EXIF. On iOS the redrawn file still carries a small EXIF header of
its own (orientation, resolution, colour space; no location, time or device, checked
on the simulator) and an empty IPTC block, so the server step is what guarantees a
clean file. `create-upload-ticket` accepts only `image/jpeg` for a Club post, up to
15 MB, and `complete-upload` runs the cleaner and writes the cleaned file over the
upload before the media row exists.

**Profile photos** are shown to every rider let into the app, beside their posts
and on their profile, and they arrive as the picker hands them over: cropped on a
phone (on Android the crop copies the original's EXIF, location included, onto the
new file) and the original file on the web. `complete-upload` runs the cleaner on
them as well, and `create-upload-ticket` issues a profile photo ticket for JPEG and
PNG only.

**Horse portraits** come from the same picker and are cleaned the same way. Only
the owner sees one today, because no screen shares a horse yet, but the database
already lets an owner share a horse with another rider (`set_horse_collaborator`),
and a portrait is usually taken where the horse lives.

**Listing photos** can be opened by anyone once the listing is visible, signed in
or not, so they are cleaned as well. The hash kept with a listing photo, which is
how the same picture is recognised on another listing, is the hash of the cleaned
file. Nothing uploads one yet: the marketplace is closed and the app has no screen
for it. When it gets one, the app has to send JPEG or PNG, as it does for the Club.

Which uploads are cleaned is one list, `cleanedUploadKinds`, decided by who can
open the file:

| Upload | Who can open it | Stored |
| --- | --- | --- |
| Profile photo (`avatar`) | every rider let into the app, and staff | cleaned |
| Club photo (`club_post`) | the Club's readers | cleaned |
| Horse portrait (`horse_photo`) | its owner, the riders the owner shares the horse with, and staff | cleaned |
| Listing photo (`listing_photo`) | anyone, once the listing is visible | cleaned |
| Record file (`horse_record`) | the horse's owner, the riders it is shared with, and staff | as sent, with its SHA-256 |
| Dispute evidence (`dispute_evidence`) | the buyer, the seller and staff | as sent, with its SHA-256 |

**A picture that cannot be cleaned is not stored.** A type the cleaner does not
handle is refused with `unsupported_file_type`, and a file that is not a well-formed
JPEG or PNG with `invalid_photo`. Either way the upload is removed from storage, the
ticket is canceled and nothing is registered, so the rider keeps the photo they had.
The cleaned file replaces the upload at the same path before any row points at it,
and the ticket then names the cleaned file's size, so completing the same ticket
twice finds the file it expects.

**Pictures stored before this rule** are not touched by a deploy.
`scripts/clean-stored-photos.ts` runs the same cleaner over every file in the
`avatars` and `horse-media` buckets and writes each cleaned picture over the stored
one at the same path. Every file, not only the ones a profile or a horse points at:
storage lets people read by folder, not by row, so a file left behind by an upload
that never finished can be read by the same people. Without `--apply` the script
only lists what it would do. It never deletes a file and never changes a row, and
it lists the pictures it cannot clean (a HEIC photo stored earlier), so the rider
can be asked to choose the photo again (`tests/clean-stored-photos.test.ts`).

Record files and dispute evidence are kept exactly as they were sent, because the
file is the record and its hash is stored with it. An image among them keeps its
metadata, and the people in the table above can read it. They, and anything the
cleaner cannot do (decode a picture, enforce its dimensions, read HEIC), still need
the full processor below before they can be public.

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
