import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  cleanStoredPhotos,
  storedPhotoBuckets,
  storedPhotoReport,
  type StoredPhotoStore
} from "../scripts/clean-stored-photos";
import { cleanedUploadKinds, stripPhotoMetadata } from "../supabase/functions/_shared/image-metadata";

// The pictures stored before complete-upload cleaned them are cleaned by a
// script the owner runs. It writes to production storage, so what it may and
// may not do is pinned here against a stand-in for Supabase.

const text = (value: string) => [...value].map((char) => char.charCodeAt(0));
const segment = (marker: number, payload: number[]) => [0xff, marker, (payload.length + 2) >> 8, (payload.length + 2) & 0xff, ...payload];
const picture = [...segment(0xdb, [0, ...Array(64).fill(1)]), ...segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]), ...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34, 0xff, 0xd9];
const jpegWithGps = Uint8Array.from([0xff, 0xd8, ...segment(0xe1, text("Exif\0\0MM\0*GPSLatitude 38.0N")), ...segment(0xfe, text("at the yard")), ...picture]);
const cleanJpeg = Uint8Array.from([0xff, 0xd8, ...picture]);
const pngChunk = (type: string, data: number[]) => [0, 0, 0, data.length, ...text(type), ...data, 0, 0, 0, 0];
const pngStart = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...pngChunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0])];
const pngRest = [...pngChunk("IDAT", [0x78, 0x9c, 0x63]), ...pngChunk("IEND", [])];
const pngWithText = Uint8Array.from([...pngStart, ...pngChunk("tEXt", text("Author\0Rider Name")), ...pngRest]);
const heic = Uint8Array.from([0, 0, 0, 24, ...text("ftypheic"), ...text("GPS inside")]);
const brokenJpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3]);

const standIn = (files: Record<string, Uint8Array>, unreadable: string[] = []) => {
  const storage = new Map(Object.entries(files));
  const writes: Array<{ key: string; contentType: string }> = [];
  const store: StoredPhotoStore = {
    // In no particular order, and the same path twice: handled once, in order.
    paths: async (bucket) => {
      const paths = [...storage.keys()].filter((key) => key.startsWith(`${bucket}/`)).map((key) => key.slice(bucket.length + 1));
      return [...paths.reverse(), ...paths.slice(0, 1)];
    },
    read: async (bucket, path) => (unreadable.includes(`${bucket}/${path}`) ? null : storage.get(`${bucket}/${path}`) ?? null),
    write: async (bucket, path, bytes, contentType) => {
      writes.push({ key: `${bucket}/${path}`, contentType });
      storage.set(`${bucket}/${path}`, bytes);
    }
  };
  return { store, storage, writes };
};

const stored = () => standIn(
  {
    "avatars/rider-a/gps.jpg": jpegWithGps,
    "avatars/rider-b/clean.jpg": cleanJpeg,
    "avatars/rider-c/text.png": pngWithText,
    "avatars/rider-d/photo.heic": heic,
    "avatars/rider-e/broken.jpg": brokenJpeg,
    "avatars/rider-f/slow.jpg": jpegWithGps,
    // Left by an upload that never finished: no profile points at it, and
    // whoever can read the bucket can still read it.
    "avatars/rider-z/unfinished.jpg": jpegWithGps,
    "horse-media/rider-a/horse-1/portrait.jpg": jpegWithGps,
    // Buckets the script has no business in.
    "club-media/rider-a/post-1/photo.jpg": jpegWithGps,
    "horse-records/rider-a/horse-1/vet.jpg": jpegWithGps,
    "dispute-evidence/rider-a/dispute-1/box.jpg": jpegWithGps
  },
  ["avatars/rider-f/slow.jpg"]
);

// It works on the buckets of the uploads complete-upload cleans and registers
// by path alone. A listing photo's row also holds a size and a hash, and a
// Club photo has been cleaned since the day it could be posted.
assert.deepEqual(storedPhotoBuckets.map((entry) => entry.bucket), ["avatars", "horse-media"]);
const ticketRules = readFileSync(join(process.cwd(), "supabase", "functions", "create-upload-ticket", "index.ts"), "utf8");
assert.match(ticketRules, /\n  avatar: \{ bucket: "avatars",/);
assert.match(ticketRules, /\n  horse_photo: \{ bucket: "horse-media",/);
assert.ok(cleanedUploadKinds.includes("avatar") && cleanedUploadKinds.includes("horse_photo"));

{
  // Without --apply nothing is written, and the report says what would be.
  const { store, storage, writes } = stored();
  const before = new Map(storage);
  const outcomes = await cleanStoredPhotos(store, { apply: false });
  assert.deepEqual(writes, []);
  assert.deepEqual([...storage], [...before]);
  assert.deepEqual(
    outcomes.map((outcome) => [outcome.bucket, outcome.path, outcome.result]),
    [
      ["avatars", "rider-a/gps.jpg", "to clean"],
      ["avatars", "rider-b/clean.jpg", "clean"],
      ["avatars", "rider-c/text.png", "to clean"],
      ["avatars", "rider-d/photo.heic", "cannot clean"],
      ["avatars", "rider-e/broken.jpg", "cannot clean"],
      ["avatars", "rider-f/slow.jpg", "not read"],
      ["avatars", "rider-z/unfinished.jpg", "to clean"],
      ["horse-media", "rider-a/horse-1/portrait.jpg", "to clean"]
    ]
  );
  assert.equal(outcomes[0]?.detail, "exif, comment", "The report names the parts, never their contents.");
  assert.equal(outcomes[2]?.detail, "tEXt");
  const report = storedPhotoReport(outcomes, false);
  assert.equal(report[0], "profile photos (avatars): 7 stored, 1 already clean, 3 to clean, 2 cannot be cleaned, 1 not read");
  assert.ok(report.includes("horse portraits (horse-media): 1 stored, 0 already clean, 1 to clean, 0 cannot be cleaned, 0 not read"));
  assert.equal(report.at(-1), "Nothing was written. Run again with --apply to write the cleaned files.");
  assert.ok(!report.join("\n").includes("38.0N") && !report.join("\n").includes("Rider Name"));
}

{
  // With --apply, the pictures that change are written over themselves, as the
  // cleaner leaves them. Everything else is untouched: the clean one, the ones
  // that cannot be cleaned, and every other bucket.
  const { store, storage, writes } = stored();
  const outcomes = await cleanStoredPhotos(store, { apply: true });
  assert.deepEqual(writes, [
    { key: "avatars/rider-a/gps.jpg", contentType: "image/jpeg" },
    { key: "avatars/rider-c/text.png", contentType: "image/png" },
    { key: "avatars/rider-z/unfinished.jpg", contentType: "image/jpeg" },
    { key: "horse-media/rider-a/horse-1/portrait.jpg", contentType: "image/jpeg" }
  ]);
  assert.deepEqual([...(storage.get("avatars/rider-a/gps.jpg") ?? [])], [...stripPhotoMetadata("image/jpeg", jpegWithGps).bytes]);
  assert.deepEqual([...(storage.get("avatars/rider-a/gps.jpg") ?? [])], [...cleanJpeg]);
  assert.deepEqual([...(storage.get("avatars/rider-c/text.png") ?? [])], [...pngStart, ...pngRest]);
  assert.deepEqual([...(storage.get("avatars/rider-z/unfinished.jpg") ?? [])], [...cleanJpeg]);
  assert.deepEqual([...(storage.get("horse-media/rider-a/horse-1/portrait.jpg") ?? [])], [...cleanJpeg]);
  assert.equal(storage.get("avatars/rider-b/clean.jpg"), cleanJpeg);
  assert.equal(storage.get("avatars/rider-d/photo.heic"), heic);
  assert.equal(storage.get("avatars/rider-e/broken.jpg"), brokenJpeg);
  assert.equal(storage.get("avatars/rider-f/slow.jpg"), jpegWithGps, "A file that could not be read is not written over.");
  for (const other of ["club-media/rider-a/post-1/photo.jpg", "horse-records/rider-a/horse-1/vet.jpg", "dispute-evidence/rider-a/dispute-1/box.jpg"]) {
    assert.equal(storage.get(other), jpegWithGps, `${other} is not the script's to touch.`);
  }
  assert.equal(storage.size, 11, "Nothing is added and nothing is deleted.");
  assert.deepEqual(
    outcomes.map((outcome) => outcome.result),
    ["cleaned", "clean", "cleaned", "cannot clean", "cannot clean", "not read", "cleaned", "cleaned"]
  );
  const report = storedPhotoReport(outcomes, true);
  assert.equal(report[0], "profile photos (avatars): 7 stored, 1 already clean, 3 cleaned, 0 not confirmed, 2 cannot be cleaned, 1 not read");
  assert.ok(!report.some((line) => line.includes("--apply to write")));

  // Run again: there is nothing left to do, and nothing is written.
  writes.length = 0;
  const again = await cleanStoredPhotos(store, { apply: true });
  assert.deepEqual(writes, []);
  assert.deepEqual(
    again.map((outcome) => outcome.result),
    ["clean", "clean", "clean", "cannot clean", "cannot clean", "not read", "clean", "clean"]
  );
}

{
  // A write that storage did not keep is said so, not counted as cleaned, and
  // the pictures after it are still handled.
  const { store, storage } = stored();
  const forgetful: StoredPhotoStore = {
    ...store,
    write: async (bucket, path, bytes) => {
      if (path !== "rider-a/gps.jpg") storage.set(`${bucket}/${path}`, bytes);
    }
  };
  const outcomes = await cleanStoredPhotos(forgetful, { apply: true });
  assert.deepEqual(
    outcomes.map((outcome) => outcome.result),
    ["not confirmed", "clean", "cleaned", "cannot clean", "cannot clean", "not read", "cleaned", "cleaned"]
  );
  assert.match(storedPhotoReport(outcomes, true)[0] ?? "", /2 cleaned, 1 not confirmed/);
}

// The script reads its key from the environment, never prints it, and has no
// way to delete a file or to read or change a row.
const script = readFileSync(join(process.cwd(), "scripts", "clean-stored-photos.ts"), "utf8");
assert.match(script, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(script, /console\.\w+\([^)]*serviceRoleKey/);
assert.doesNotMatch(script, /\.remove\(|\.delete\(|\.update\(|\.insert\(|\.upsert\(|\.rpc\(|client\.from\(/);
assert.match(script, /const apply = process\.argv\.includes\("--apply"\);/);

console.log("Stored photo cleaning passed.");
