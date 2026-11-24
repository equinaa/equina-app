import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PlanState } from "../src/backend/contracts";
import { mapPlanState } from "../src/backend/plan-repository";
import {
  draftPlanTiers,
  foundingPlan,
  lessonOpen,
  picksLeft,
  planFor,
  planRowValue,
  planStatusLine,
  tierFeatures
} from "../src/features/plans/plan-rules";
import { closedPlansCopy, closedTrialLine, closedTrialPill, creditsNote } from "../src/features/plans/plan-screen-copy";

const free = (overrides: Partial<PlanState> = {}): PlanState => ({
  ...foundingPlan,
  enforced: true,
  clubAccess: "none",
  academy: { picksLimit: 2, picksUsed: 1, openPicks: ["picked"] },
  ...overrides
});
const paid = (id: string) => ({ id, access: "paid" as const });

// --- The app's copy of the plans is the database's ---------------------------

// The demo and a rider whose plan has not loaded read draftPlanTiers. A plan
// changed in the seed and not here would show riders numbers that are wrong.
{
  const migration = readFileSync(join(process.cwd(), "supabase", "migrations", "202610060001_plans.sql"), "utf8");
  for (const tier of draftPlanTiers) {
    const picks = tier.academyPicks === null ? "null" : String(tier.academyPicks);
    const row = new RegExp(
      `\\('${tier.key}', '${tier.name}', \\d+, ${picks}, '${tier.clubAccess}', ${tier.coachSessions}, ${tier.eventTickets}, ${tier.trialDays},`
    );
    assert.match(migration, row, `The ${tier.name} the app shows must be the ${tier.name} the database seeds.`);
  }
  assert.match(migration, /\('mid', 100,/);
  assert.match(migration, /\('premium', 300,/);
  assert.deepEqual(draftPlanTiers.map((tier) => tier.monthlyCredits), [15, 100, 300]);
}

// --- Which lessons are open ----------------------------------------------------

// The founding phase opens everything, whatever the plan.
assert.equal(lessonOpen(foundingPlan, paid("anything")), true);
// Enforced: free lessons always, paid ones by pick, every lesson on Premium.
assert.equal(lessonOpen(free(), { id: "intro", access: "free" }), true, "Free lessons are open on every plan.");
assert.equal(lessonOpen(free(), paid("picked")), true, "A picked lesson is open.");
assert.equal(lessonOpen(free(), paid("other")), false, "A paid lesson nobody picked waits for a pick.");
assert.equal(
  lessonOpen(free({ tier: "premium", academy: { picksLimit: null, picksUsed: 0, openPicks: [] } }), paid("other")),
  true,
  "Premium opens every lesson."
);
assert.equal(picksLeft(free()), 1);
assert.equal(picksLeft(free({ academy: { picksLimit: 2, picksUsed: 3, openPicks: [] } })), 0, "A downgrade never shows a negative count.");
assert.equal(picksLeft(free({ academy: { picksLimit: null, picksUsed: 4, openPicks: [] } })), null);

// --- Which plan a locked screen names --------------------------------------------

assert.equal(planFor(free(), "club")?.name, "Plus", "The Club comes with Plus.");
assert.equal(planFor(free(), "lessons")?.name, "Plus", "More lessons start with Plus.");
assert.equal(planFor(free({ tier: "mid" }), "lessons")?.name, "Premium");
assert.equal(planFor(free({ tier: "premium" }), "lessons"), undefined, "Nothing sits above Premium.");

// --- Words ---------------------------------------------------------------------------

assert.equal(planRowValue(foundingPlan), "Everything open");
assert.equal(planRowValue(free({ tier: "mid", status: "trialing" })), "Plus · trial");
assert.equal(planStatusLine(foundingPlan), "Everything is open while Equina is new.");
assert.equal(planStatusLine(free({ tier: "mid", status: "trialing", trialEndsAt: "2026-10-13T09:00:00Z" })), "Free trial until 13 Oct");
assert.equal(planStatusLine(free({ tier: "premium", status: "active", source: "staff" })), "From the Equina team");
assert.equal(planStatusLine(free()), "Free, for as long as you like.");

const freeFeatures = tierFeatures(draftPlanTiers[0]!);
assert.deepEqual(freeFeatures.map((feature) => feature.included), [true, true, false, true, false, false]);
assert.equal(freeFeatures[1]?.text, "Free lessons, plus 2 lessons you choose");
assert.equal(tierFeatures(draftPlanTiers[2]!)[5]?.text, "A ticket to Equina's annual event");
assert.equal(tierFeatures(draftPlanTiers[2]!)[4]?.text, "Two 1-on-1 sessions with a coach");
assert.equal(tierFeatures(draftPlanTiers[1]!)[4]?.text, "One 1-on-1 session with a coach");

// --- The plan screen while nothing is for sale -------------------------------------------

// Build 1 sells nothing on any platform, and this is the screen it shows.
{
  const freeTier = draftPlanTiers[0]!;
  const plus = draftPlanTiers[1]!;
  const premium = draftPlanTiers[2]!;
  assert.equal(closedPlansCopy.title, "Subscriptions are not open yet");
  assert.match(closedPlansCopy.body, /the Equina team sets your plan/, "During the beta staff grant plans from the Admin.");
  assert.equal(creditsNote, "One Ralf credit is one message. The Equina team arranges coach sessions and event tickets with you.");
  assert.doesNotMatch(creditsNote, /photo/i, "Ralf takes no photos: no message costs three credits.");

  // Staff set the trial in the Admin, and it cannot be started yet.
  assert.equal(closedTrialLine(draftPlanTiers), "When subscriptions open, Plus and Premium start with a 7-day free trial.");
  assert.equal(closedTrialLine([freeTier, plus, { ...premium, trialDays: 0 }]), "When subscriptions open, Plus starts with a 7-day free trial.");
  assert.equal(closedTrialLine([freeTier, plus, { ...premium, trialDays: 14 }]), null, "Two lengths: each card says its own.");
  assert.equal(closedTrialLine(draftPlanTiers.map((tier) => ({ ...tier, trialDays: 0 }))), null, "Set to 0 in the Admin, nothing mentions a trial.");
  assert.equal(closedTrialLine([]), null);
  assert.deepEqual(draftPlanTiers.map(closedTrialPill), [null, "7-day free trial", "7-day free trial"]);
  assert.equal(closedTrialPill({ ...plus, trialDays: 0 }), null);

  // The same words on iOS, Android and the web: no store, no price, nowhere else to pay.
  const closedLines = [
    ...Object.values(closedPlansCopy),
    creditsNote,
    closedTrialLine(draftPlanTiers) ?? "",
    ...draftPlanTiers.map((tier) => closedTrialPill(tier) ?? "")
  ];
  for (const line of closedLines) {
    assert.doesNotMatch(line, /App Store|Apple|Google|Play Store|TestFlight/i, `"${line}" names a store.`);
    assert.doesNotMatch(line, /[€$£]|\d[.,]\d\d\b/, `"${line}" names a price.`);
    assert.doesNotMatch(line, /https?:|www\.|@/, `"${line}" sends the rider elsewhere.`);
    assert.doesNotMatch(line, /!/);
  }

  // No word of the closed screen is typed into the component, where no test reads it.
  const planScreen = readFileSync(join(process.cwd(), "src", "features", "plans", "PlanScreen.tsx"), "utf8");
  assert.doesNotMatch(planScreen, /App Store|Google Play|photo/i);
  const tierForm = readFileSync(join(process.cwd(), "admin", "src", "app", "(console)", "plans", "plan-tier-form.tsx"), "utf8");
  assert.doesNotMatch(tierForm, /with a photo/i, "The Admin tells staff the same: a message costs one credit.");
}

// --- my_plan() as the app reads it ---------------------------------------------------------

{
  const mapped = mapPlanState({
    enforced: true,
    tier: "mid",
    status: "trialing",
    source: "app_store",
    trialEndsAt: "2026-10-13T09:00:00+00:00",
    endsAt: "2026-10-13T09:00:00+00:00",
    clubAccess: "post",
    academy: { picksLimit: 30, picksUsed: 2, openPicks: ["a", "b"] },
    tiers: [{ key: "free", name: "Free", academyPicks: 2, clubAccess: "none", monthlyCredits: 15, coachSessions: 0, eventTickets: 0, trialDays: 0 }]
  });
  assert.equal(mapped.tier, "mid");
  assert.equal(mapped.status, "trialing");
  assert.deepEqual(mapped.academy, { picksLimit: 30, picksUsed: 2, openPicks: ["a", "b"] });
  assert.equal(mapped.tiers[0]?.academyPicks, 2);

  // Anything the app does not know reads as the most limited answer.
  const odd = mapPlanState({ tier: "gold", clubAccess: "everything", academy: { picksLimit: null } });
  assert.deepEqual(
    { enforced: odd.enforced, tier: odd.tier, clubAccess: odd.clubAccess, status: odd.status, picksLimit: odd.academy.picksLimit },
    { enforced: false, tier: "free", clubAccess: "none", status: undefined, picksLimit: null }
  );

  // Outside the beta the app offers neither plans nor picks. A server from
  // before the beta door says nothing, and has no door to be outside of.
  assert.equal(mapPlanState({ access: false }).access, false);
  assert.equal(mapPlanState({}).access, true);
  assert.equal(foundingPlan.access, true, "The demo and a plan still loading are never outside the beta.");
}

console.log("Plan rules passed.");
