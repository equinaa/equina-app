import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { forgetSignedUrls, signedUrlsFor } from "../src/backend/signed-urls";
import { planForHorse, trainingStreak, trainingStreakFor, type PlanVersion, type TimeOffPeriod } from "../src/domain/training-streak";
import {
  careLoggedOn,
  disciplineFromHorse,
  heroDayOff,
  heroPhotoFor,
  heroPhotoPending,
  homePlanCard,
  homeTodayFor,
  homeTodayLabel,
  planCardTodayLine,
  plannedTraining,
  snapshotSetsHomeHorse,
  summaryHorseId
} from "../src/features/home/home-hero";
import { rideTrainingTypeById } from "../src/features/ride/ride-plan";

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

// --- Which horse Home shows ------------------------------------------------------------------

{
  assert.equal(
    snapshotSetsHomeHorse({ horsesLoaded: false, primaryHorseId: "daimon" }),
    true,
    "Before the Stable loads, the account's primary horse is Home's horse."
  );
  assert.equal(
    snapshotSetsHomeHorse({ horsesLoaded: true, selectedHorseId: "luna", primaryHorseId: "daimon" }),
    false,
    "An account refresh does not put the primary's name over another horse the rider picked."
  );
  assert.equal(
    snapshotSetsHomeHorse({ horsesLoaded: true, selectedHorseId: "daimon", primaryHorseId: "daimon" }),
    true,
    "The picked horse is the primary: the refreshed account can update it."
  );
  assert.equal(
    snapshotSetsHomeHorse({ horsesLoaded: true, selectedHorseId: "luna" }),
    false,
    "No primary in the account no longer clears a horse the Stable still has."
  );
  assert.equal(snapshotSetsHomeHorse({ horsesLoaded: false }), true, "A rider with no horse at all: the account says so.");
  assert.equal(
    snapshotSetsHomeHorse({ horsesLoaded: true, selectedHorseId: "", primaryHorseId: "" }),
    false,
    "Empty ids never match each other."
  );
}

// --- Whose discipline Home shows ----------------------------------------------------------

{
  assert.equal(disciplineFromHorse("jumping", "dressage"), null, "The rider's profile wins over the horse's discipline.");
  assert.equal(disciplineFromHorse("dressage", undefined), null, "A horse without a discipline no longer turns the rider into Jumping.");
  assert.equal(disciplineFromHorse(undefined, "eventing"), "eventing", "The horse fills in only for a profile with none.");
  assert.equal(disciplineFromHorse(undefined, undefined), null);
}

// --- What TODAY says ---------------------------------------------------------------------
// Read from Home's horse's own week, the same scoped streak as the plan card.

{
  // Monday 26 October 2026. Daimon has dressage on Mondays, Luna jumping on
  // Tuesdays, Nova has no week.
  const today = "2026-10-26";
  const versions: PlanVersion[] = [{
    effectiveFrom: "2026-10-05",
    days: [
      { weekday: 1, trainingType: "dressage", horseId: "daimon" },
      { weekday: 2, trainingType: "cross-country", horseId: "luna" }
    ]
  }];
  const streakFor = (horseId: string | undefined, periods: TimeOffPeriod[] = []) =>
    trainingStreakFor(versions, [], horseId, today, periods);
  const startRide = "Flatwork";
  const say = (horseId: string | undefined, periods: TimeOffPeriod[] = [], loaded = true) =>
    homeTodayLabel(
      homeTodayFor({ streak: loaded ? streakFor(horseId, periods) : undefined, timeOff: periods, horseId, today }),
      startRide
    );

  assert.equal(say("daimon"), "Dressage", "The training planned today for Home's horse.");
  assert.equal(say("luna"), "Rest day", "Luna has a week, with nothing today: never Daimon's dressage.");
  assert.equal(say("nova"), startRide, "No week at all: the training Start ride opens with, in the same words.");
  assert.equal(say("daimon", [], false), startRide, "The plan not read yet is never called a rest day.");
  const daimonOff: TimeOffPeriod[] = [{ horseId: "daimon", kind: "injury", startsOn: "2026-10-25", endsOn: "2026-10-30" }];
  assert.equal(say("daimon", daimonOff), "Time off", "Time off wins over a ride planned that day.");
  assert.equal(homeTodayFor({ streak: streakFor("daimon", daimonOff), timeOff: daimonOff, horseId: "daimon", today }).kind, "time-off");
  assert.equal(say("luna", daimonOff), "Rest day", "Another horse's time off is not Luna's.");
  const lunaOff: TimeOffPeriod[] = [{ horseId: "luna", kind: "break", startsOn: "2026-10-26", endsOn: "2026-10-26" }];
  assert.equal(say("luna", lunaOff), "Time off", "Off today, planned or not.");
  assert.equal(say(undefined), "Dressage", "A rider with no horse reads the week whole.");
  assert.equal(
    homeTodayLabel({ kind: "training", trainingType: "cross-country" }, startRide),
    "Cross-country",
    "The training's own words."
  );
  const later: PlanVersion[] = [{ effectiveFrom: "2026-11-02", days: versions[0]!.days }];
  assert.equal(
    homeTodayLabel(homeTodayFor({ streak: trainingStreak(planForHorse(later, "daimon"), [], today), timeOff: [], horseId: "daimon", today }), startRide),
    startRide,
    "A week that starts next Monday is no plan today."
  );

  // A rider with no horse who turned every day to rest still has a week,
  // as before: today is a rest day, not the training Start ride opens with.
  const restWeek: PlanVersion[] = [{ effectiveFrom: "2026-10-05", days: [] }];
  assert.equal(
    homeTodayLabel(homeTodayFor({ streak: trainingStreakFor(restWeek, [], undefined, today), timeOff: [], today }), startRide),
    "Rest day"
  );

  // A planned training the app no longer lists (another version removed it,
  // or a newer one added it). TODAY and the line under Start ride come from
  // the same value, as App derives them, and say the same words.
  const retired: PlanVersion[] = [{ effectiveFrom: "2026-10-05", days: [{ weekday: 1, trainingType: "long-reining", horseId: "daimon" }] }];
  const retiredStreak = trainingStreakFor(retired, [], "daimon", today);
  const remembered = rideTrainingTypeById("jumping")!;
  const planned = retiredStreak.todayPlanned[0];
  const startRideTraining = (planned ? plannedTraining(planned.trainingType) : undefined) ?? remembered;
  const eyebrow = homeTodayLabel(homeTodayFor({ streak: retiredStreak, timeOff: [], horseId: "daimon", today }), startRideTraining.label);
  assert.equal(eyebrow, "Long reining", "TODAY names the planned training.");
  assert.equal(startRideTraining.label, eyebrow, "Start ride opens with it, in the same words; never the remembered Jumping.");
  assert.equal(plannedTraining("dressage"), rideTrainingTypeById("dressage"), "A training the app lists is its own.");
}

// --- The hero and the plan card on a day with nothing to ride -------------------------------

{
  assert.deepEqual(heroDayOff({ kind: "rest" }, "Luna", true), {
    title: "Rest day.",
    body: "Nothing is planned for Luna today. Rest is part of the plan."
  });
  assert.equal(heroDayOff({ kind: "rest" }, undefined, true)?.body, "Nothing is planned for today. Rest is part of the plan.");
  assert.deepEqual(heroDayOff({ kind: "time-off" }, "Daimon", true), {
    title: "Time off.",
    body: "Daimon is off work. Your streak stays safe."
  });
  assert.equal(
    heroDayOff({ kind: "time-off" }, "Shadow", false)?.body,
    "Shadow is off work.",
    "No streak on Home for this horse (shared, or no week): none is promised."
  );
  assert.equal(heroDayOff({ kind: "training", trainingType: "dressage" }, "Daimon", true), null, "A training day keeps the discipline's words.");
  assert.equal(heroDayOff({ kind: "unplanned" }, "Daimon", false), null);

  // The card under the hero reads today the same way.
  assert.equal(
    planCardTodayLine({ ridden: false, planned: null, today: { kind: "time-off" } }),
    "Time off. Nothing to keep today.",
    "Under a hero saying Time off, the card never says Rest day."
  );
  assert.equal(planCardTodayLine({ ridden: false, planned: null, today: { kind: "rest" } }), "Rest day. Nothing to keep today.");
  assert.equal(planCardTodayLine({ ridden: false, planned: "Dressage", today: { kind: "training", trainingType: "dressage" } }), "Today: Dressage");
  assert.equal(planCardTodayLine({ ridden: true, planned: null, today: { kind: "time-off" } }), "Today's training is in the journal.");
}

// --- Home's plan card while the plan and the horses load ------------------------------------

{
  const loading = { inPlan: true, planLoaded: false, planFailed: false, horsesLoaded: false, horsesListed: false };
  assert.equal(homePlanCard(loading), "none", "Both still loading: nothing yet.");
  assert.equal(homePlanCard({ ...loading, planLoaded: true, horsesLoaded: true, horsesListed: true }), "week");
  assert.equal(homePlanCard({ ...loading, planFailed: true, horsesLoaded: true, horsesListed: true }), "retry", "The plan failed.");
  assert.equal(
    homePlanCard({ ...loading, planLoaded: true, horsesLoaded: true }),
    "retry",
    "The horse list failed: without it Home cannot tell whose week it is, and offers to try again rather than nothing."
  );
  assert.equal(homePlanCard({ ...loading, planLoaded: true }), "none", "The horse list still on its way.");
  assert.equal(
    homePlanCard({ ...loading, inPlan: false, planLoaded: true, horsesLoaded: true, horsesListed: true }),
    "none",
    "A horse shared with the rider has no plan card."
  );
}

// --- Whose rides Home's summary counts ----------------------------------------------------

{
  assert.equal(
    summaryHorseId({ horsesListed: false, primaryHorseId: "daimon" }),
    "daimon",
    "Before the horse list is in, or when it failed: the account's primary, the horse the hero shows, never every horse."
  );
  assert.equal(summaryHorseId({ horsesListed: true, homeHorseId: "luna", primaryHorseId: "daimon" }), "luna", "Then Home's horse.");
  assert.equal(summaryHorseId({ horsesListed: true, primaryHorseId: "daimon" }), undefined, "A rider with no horse: every ride.");
}

// --- Whose post-ride care Up next shows as done --------------------------------------------
// Care logged after a ride on Daimon read "Care complete · Test is up to date"
// once Home switched to Test, which was never ridden.

{
  assert.equal(careLoggedOn(null, "daimon"), false, "None logged since the ride.");
  assert.equal(careLoggedOn({ horseId: "daimon" }, "daimon"), true, "Logged for Daimon: Daimon is up to date.");
  assert.equal(careLoggedOn({ horseId: "daimon" }, "test"), false, "Home switched to Test: Daimon's care is not Test's.");
  assert.equal(careLoggedOn({ horseId: "daimon" }, undefined), false, "Nor a Home with no horse.");
  assert.equal(careLoggedOn({}, undefined), true, "A rider with no horse logs it for no horse, as before.");
  assert.equal(careLoggedOn({}, "daimon"), false);
  assert.equal(careLoggedOn(null, undefined), false);
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
