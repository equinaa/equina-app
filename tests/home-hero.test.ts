import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { forgetSignedUrls, signedUrlsFor } from "../src/backend/signed-urls";
import { disciplineFromHorse, heroPhotoFor, heroPhotoPending } from "../src/features/home/home-hero";

// After sign-in, Home showed a stock picture and then swapped to the rider's
// own horse photo. These are the rules that keep the swap from happening.

// --- When the hero waits ----------------------------------------------------------------

{
  const waiting = { connected: true, authenticated: true, photoPath: "horse/1.jpg", photoUrl: "", horsesLoaded: false };
  assert.equal(heroPhotoPending(waiting), true, "A photo exists and has no URL yet: wait, show no stock picture.");
  assert.equal(heroPhotoPending({ ...waiting, photoUrl: "https://signed/1" }), false, "The URL is here: show the photo.");
  assert.equal(heroPhotoPending({ ...waiting, horsesLoaded: true }), false, "The horses are in, photo or not: never wait forever.");
  assert.equal(heroPhotoPending({ ...waiting, photoPath: undefined }), false, "A rider without a photo gets the stock picture at once.");
  assert.equal(heroPhotoPending({ ...waiting, connected: false }), false, "The demo has its own pictures.");
  assert.equal(heroPhotoPending({ ...waiting, authenticated: false }), false);
}

// --- Which picture shows ------------------------------------------------------------------

{
  const stock = "asset://jumping-home.jpg";
  assert.equal(heroPhotoFor({ pending: true, own: "", failed: "", stock }), "", "Pending: nothing on the stage.");
  assert.equal(heroPhotoFor({ pending: false, own: "https://signed/1", failed: "", stock }), "https://signed/1");
  assert.equal(heroPhotoFor({ pending: false, own: "", failed: "", stock }), stock);
  assert.equal(
    heroPhotoFor({ pending: false, own: "https://signed/1", failed: "https://signed/1", stock }),
    stock,
    "A photo that failed to load falls back to stock instead of a blank stage."
  );
  assert.equal(
    heroPhotoFor({ pending: false, own: "https://signed/2", failed: "https://signed/1", stock }),
    "https://signed/2",
    "A new URL gets its own chance."
  );
}

// --- Whose discipline Home shows ----------------------------------------------------------

{
  assert.equal(disciplineFromHorse("jumping", "dressage"), null, "The rider's profile wins over the horse's discipline.");
  assert.equal(disciplineFromHorse("dressage", undefined), null, "A horse without a discipline no longer turns the rider into Jumping.");
  assert.equal(disciplineFromHorse(undefined, "eventing"), "eventing", "The horse fills in only for a profile with none.");
  assert.equal(disciplineFromHorse(undefined, undefined), null);
}

// --- One signed URL per stored file --------------------------------------------------------

type SignCall = { bucket: string; paths: string[]; expiresIn: number };
const fakeClient = (calls: SignCall[], fail = false) => ({
  storage: {
    from: (bucket: string) => ({
      createSignedUrls: async (paths: string[], expiresIn: number) => {
        calls.push({ bucket, paths, expiresIn });
        if (fail) return { data: null, error: new Error("storage is down") };
        return {
          data: paths.map((path) => ({ path, signedUrl: `https://signed/${bucket}/${path}?token=${calls.length}` })),
          error: null
        };
      }
    })
  }
}) as unknown as SupabaseClient;

const t0 = 1_800_000_000_000;
{
  forgetSignedUrls();
  const calls: SignCall[] = [];
  const client = fakeClient(calls);

  const first = await signedUrlsFor(client, "horse-media", ["a.jpg", "b.jpg", "a.jpg"], t0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0]?.paths, ["a.jpg", "b.jpg"], "Each file is signed once, duplicates included.");
  assert.equal(calls[0]?.expiresIn, 3600);

  // The same file loaded again -- the account refresh, the Stable -- gets the
  // same URL, so the image cache hits and the photo does not flash.
  const again = await signedUrlsFor(client, "horse-media", ["a.jpg"], t0 + 30 * 60_000);
  assert.equal(calls.length, 1, "No new signature while the URL is good.");
  assert.equal(again.urls.get("a.jpg"), first.urls.get("a.jpg"));

  // Close to the end of its life, a URL is renewed rather than handed out to
  // an image that might still be loading when it expires.
  const late = await signedUrlsFor(client, "horse-media", ["a.jpg"], t0 + 56 * 60_000);
  assert.equal(calls.length, 2);
  assert.notEqual(late.urls.get("a.jpg"), first.urls.get("a.jpg"));

  // Buckets are separate: the same path in another bucket is another file.
  await signedUrlsFor(client, "avatars", ["a.jpg"], t0 + 56 * 60_000);
  assert.equal(calls.length, 3);
  assert.equal(calls[2]?.bucket, "avatars");

  // Signing out forgets everything, so the next account on the phone starts clean.
  forgetSignedUrls();
  await signedUrlsFor(client, "horse-media", ["a.jpg"], t0 + 57 * 60_000);
  assert.equal(calls.length, 4);
}

{
  forgetSignedUrls();
  const calls: SignCall[] = [];
  const result = await signedUrlsFor(fakeClient(calls, true), "horse-media", ["a.jpg"], t0);
  assert.ok(result.error, "A storage error reaches the caller.");
  assert.equal(result.urls.size, 0);
  const retried = await signedUrlsFor(fakeClient(calls), "horse-media", ["a.jpg"], t0 + 1000);
  assert.equal(retried.urls.size, 1, "A failure is not cached.");
  forgetSignedUrls();
}

console.log("Home hero photo rules passed.");
