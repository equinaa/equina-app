import assert from "node:assert/strict";
import type { AcademyLesson } from "../src/backend/contracts";
import { EquinaBackendError, edgeFailure, networkUnreachable } from "../src/backend/errors";
import {
  academyCredit,
  academyPathFor,
  allLevelsLabel,
  formatChapterTime,
  formatLessonDuration,
  lessonProgressPercent,
  lessonVideoErrorMessage,
  liveLessonView,
  metaLine,
  pathProgress,
  recommendedLessonFor
} from "../src/features/academy/academy-catalog";
import { bunnyPlaylistUrl } from "../supabase/functions/_shared/bunny-stream";

// Signed links match Bunny's own signer byte for byte. These vectors came
// from BunnyWay/BunnyCDN.TokenAuthentication's Node signer (directory token,
// fixed expiry), so a drift in our HMAC input or encoding fails here rather
// than as a black player on a rider's phone.
{
  assert.equal(
    await bunnyPlaylistUrl({
      cdnHostname: "vz-1a2b3c4d-5e6.b-cdn.net",
      tokenKey: "4f1c7a9e-2d3b-4c5a-8e6f-0a1b2c3d4e5f",
      assetId: "8d2c1f3e-4b5a-4c6d-9e7f-1a2b3c4d5e6f",
      expiresAt: 1791000000
    }),
    "https://vz-1a2b3c4d-5e6.b-cdn.net/bcdn_token=HS256-VYCStcydqyQxUkY01c7SSneESRl7-3ARwGVQjs6rXh8" +
      "&token_path=%2F8d2c1f3e-4b5a-4c6d-9e7f-1a2b3c4d5e6f%2F&expires=1791000000" +
      "/8d2c1f3e-4b5a-4c6d-9e7f-1a2b3c4d5e6f/playlist.m3u8"
  );
  assert.equal(
    await bunnyPlaylistUrl({
      cdnHostname: "vz-abc.b-cdn.net",
      tokenKey: "s3cr3t+/=key",
      assetId: "0f9e8d7c-6b5a-4f3e-8d2c-1b0a9f8e7d6c",
      expiresAt: 1800000123
    }),
    "https://vz-abc.b-cdn.net/bcdn_token=HS256-NVmqt-a2c-AUtRG4JrMlSY63tSNp01cxI77OVofi4pk" +
      "&token_path=%2F0f9e8d7c-6b5a-4f3e-8d2c-1b0a9f8e7d6c%2F&expires=1800000123" +
      "/0f9e8d7c-6b5a-4f3e-8d2c-1b0a9f8e7d6c/playlist.m3u8"
  );

  // The asset id becomes a URL path. One that could step out of its own
  // directory would sign a token for somebody else's lesson.
  await assert.rejects(
    bunnyPlaylistUrl({ cdnHostname: "vz-abc.b-cdn.net", tokenKey: "k", assetId: "../other", expiresAt: 1800000000 }),
    /unexpected shape/
  );
  await assert.rejects(
    bunnyPlaylistUrl({ cdnHostname: "vz-abc.b-cdn.net", tokenKey: "k", assetId: "abc", expiresAt: 1800000000.5 }),
    /UNIX time/
  );
}

// Durations, chapter marks and meta lines.
{
  assert.equal(formatLessonDuration(1080), "18 min");
  assert.equal(formatLessonDuration(20), "1 min", "A short clip still reads as a minute, not zero.");
  assert.equal(formatLessonDuration(undefined), "", "An unknown length is left out, not shown as 0 min.");
  assert.equal(formatChapterTime(0), "0:00");
  assert.equal(formatChapterTime(260), "4:20");
  assert.equal(formatChapterTime(3725), "1:02:05");
  assert.equal(metaLine("Equina Academy", "", undefined, "18 min"), "Equina Academy · 18 min");
}

// Progress: finishing is something the rider does, not a position.
{
  const at = (positionSeconds: number, completedAt?: string) => ({
    lessonId: "l", positionSeconds, completedAt, lastSeenAt: "2026-10-03T10:00:00Z"
  });
  assert.equal(lessonProgressPercent(600, undefined), 0);
  assert.equal(lessonProgressPercent(600, at(300)), 50);
  assert.equal(lessonProgressPercent(600, at(600)), 99, "Parked at the end is not finished.");
  assert.equal(lessonProgressPercent(600, at(12, "2026-10-03T10:00:00Z")), 100, "Finished stays finished on a rewatch.");
  assert.equal(lessonProgressPercent(undefined, at(300)), 0, "Without a length there is no honest percentage.");
}

const lesson = (overrides: Partial<AcademyLesson>): AcademyLesson => ({
  id: "00000000-0000-4000-8000-000000000001",
  slug: "elastic-contact",
  title: "Elastic contact",
  summary: "A softer hand while the horse stays forward.",
  category: "dressage",
  discipline: "dressage",
  level: "intermediate",
  access: "free",
  durationSeconds: 1080,
  position: 0,
  chapters: [{ id: "c1", startsAtSeconds: 260, title: "Soft rein connection" }],
  ...overrides
});
const imageFor = (topic: string) => `image:${topic}`;

// A live lesson as the rider sees it.
{
  const view = liveLessonView(lesson({}), undefined, imageFor);
  assert.equal(view.topic, "Dressage", "Categories match the Academy's topics whatever their case.");
  assert.equal(view.level, "Intermediate");
  assert.equal(view.coach, academyCredit, "No credited coach is said plainly, never invented.");
  assert.equal(view.duration, "18 min");
  assert.equal(view.image, "image:Dressage");
  assert.deepEqual(view.chapters, [{ time: "4:20", title: "Soft rein connection", seconds: 260 }]);
  assert.equal(view.video, "live");

  const credited = liveLessonView(lesson({ coachName: " Ilinca B. ", coachTitle: "Founder" }), undefined, imageFor);
  assert.equal(credited.coach, "Ilinca B.");
  assert.equal(credited.coachTitle, "Founder");

  const anyone = liveLessonView(lesson({ level: undefined, category: "Groundwork" }), undefined, imageFor);
  assert.equal(anyone.level, allLevelsLabel, "A lesson with no level suits every rider.");
  assert.equal(anyone.topic, "Groundwork", "A new category shows as written, under All.");
}

// An empty catalogue is a normal state: nothing to recommend, nothing to
// count, and no crash in the screens that ask.
{
  const rider = { level: "Intermediate" as const, discipline: "Dressage", goal: "Daily training" };
  assert.equal(recommendedLessonFor([], rider, "Contact"), undefined);
  assert.deepEqual(academyPathFor([], rider, "Contact"), []);
  assert.equal(pathProgress([]), 0);

  const dressage = liveLessonView(lesson({}), undefined, imageFor);
  const jumping = liveLessonView(lesson({ id: "j", title: "Lines", category: "Jumping", discipline: "jumping" }), undefined, imageFor);
  assert.equal(recommendedLessonFor([jumping, dressage], rider, "Contact")?.id, dressage.id,
    "A dressage rider working on contact is offered the dressage lesson first.");
}

// Each refusal from academy-playback gets its own words.
{
  assert.match(lessonVideoErrorMessage(new EquinaBackendError("x", networkUnreachable)), /offline/);
  assert.match(lessonVideoErrorMessage(new EquinaBackendError("x", "video_not_ready")), /still being prepared/);
  assert.match(lessonVideoErrorMessage(new EquinaBackendError("x", "lesson_not_found")), /no longer available/);
  assert.match(lessonVideoErrorMessage(new EquinaBackendError("x", "video_host_unavailable")), /could not be loaded/);
}

// supabase-js hides an edge function's answer behind "non-2xx status code".
// The code in the body is what lets a screen say the right thing.
{
  const refusal = {
    name: "FunctionsHttpError",
    message: "Edge Function returned a non-2xx status code",
    context: { status: 409, json: async () => ({ error: "This lesson's video is still being prepared.", code: "video_not_ready" }) }
  };
  const fromBody = await edgeFailure(refusal, "academy-playback could not be completed.");
  assert.equal(fromBody.code, "video_not_ready");
  assert.equal(fromBody.message, "This lesson's video is still being prepared.");
  assert.equal(fromBody.retryable, false);

  const offline = await edgeFailure({ name: "FunctionsFetchError", message: "Failed to send a request" }, "fallback");
  assert.equal(offline.code, networkUnreachable);
  assert.equal(offline.retryable, true);

  const unreadable = await edgeFailure(
    { name: "FunctionsHttpError", message: "Edge Function returned a non-2xx status code", context: { status: 502, json: async () => { throw new Error("not json"); } } },
    "fallback"
  );
  assert.equal(unreadable.code, "backend_error", "A body that cannot be read says no more than the status.");
}

console.log("Academy rules passed.");
