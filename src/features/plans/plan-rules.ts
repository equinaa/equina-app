import type { PlanKey, PlanState, PlanTier } from "../../backend/contracts";

/**
 * Ilinca's three plans (dev plan, Part 4), as the database seeds them
 * (202610060001). The demo, and a rider whose plan has not loaded yet, read
 * these; a connected rider reads the live rows, which staff can change.
 */
export const draftPlanTiers: PlanTier[] = [
  { key: "free", name: "Free", academyPicks: 2, clubAccess: "none", monthlyCredits: 15, coachSessions: 0, eventTickets: 0, trialDays: 0 },
  { key: "mid", name: "Plus", academyPicks: 30, clubAccess: "post", monthlyCredits: 100, coachSessions: 1, eventTickets: 0, trialDays: 7 },
  { key: "premium", name: "Premium", academyPicks: null, clubAccess: "post", monthlyCredits: 300, coachSessions: 2, eventTickets: 1, trialDays: 7 }
];

/**
 * The founding phase: every rider has everything, whatever plan they hold.
 * Also what the app assumes until the plan loads -- the database enforces
 * every limit anyway, so a rider is never locked out by a slow answer.
 */
export const foundingPlan: PlanState = {
  access: true,
  enforced: false,
  tier: "free",
  clubAccess: "post",
  academy: { picksLimit: 2, picksUsed: 0, openPicks: [] },
  tiers: draftPlanTiers
};

const tiersOf = (plan: PlanState) => (plan.tiers.length > 0 ? plan.tiers : draftPlanTiers);

export const tierOf = (plan: PlanState, key: PlanKey = plan.tier): PlanTier =>
  tiersOf(plan).find((tier) => tier.key === key) ?? draftPlanTiers.find((tier) => tier.key === key) ?? draftPlanTiers[0]!;

export const planName = (plan: PlanState, key: PlanKey = plan.tier) => tierOf(plan, key).name;

/** May this rider watch this lesson? The same rule as private.lesson_open. */
export const lessonOpen = (plan: PlanState, lesson: { id: string; access: "free" | "paid" }) =>
  !plan.enforced ||
  lesson.access === "free" ||
  plan.academy.picksLimit === null ||
  plan.academy.openPicks.includes(lesson.id);

/** Picks still to make, or null on a plan that opens every lesson. */
export const picksLeft = (plan: PlanState) =>
  plan.academy.picksLimit === null ? null : Math.max(0, plan.academy.picksLimit - plan.academy.picksUsed);

/**
 * The first plan above the rider's that gives what they reached for, so a
 * locked screen names one plan rather than a menu.
 */
export const planFor = (plan: PlanState, need: "club" | "lessons"): PlanTier | undefined => {
  const tiers = tiersOf(plan);
  const current = tiers.findIndex((tier) => tier.key === plan.tier);
  return tiers.slice(current + 1).find((tier) =>
    need === "club"
      ? tier.clubAccess === "post"
      : tier.academyPicks === null || tier.academyPicks > (plan.academy.picksLimit ?? 0)
  );
};

const shortDate = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(iso));

/** One line under the plan's name on the plan screen. */
export const planStatusLine = (plan: PlanState) => {
  if (!plan.enforced) return "Everything is open while Equina is new.";
  if (plan.status === "trialing" && plan.trialEndsAt) return `Free trial until ${shortDate(plan.trialEndsAt)}`;
  if (plan.status === "grace") return "Your payment is being retried. Your plan stays open meanwhile.";
  if (plan.source === "staff") return plan.endsAt ? `From the Equina team, until ${shortDate(plan.endsAt)}` : "From the Equina team";
  if (plan.source === "app_store") return "Billed through the App Store";
  if (plan.source === "play") return "Billed through Google Play";
  if (plan.source === "stripe") return "Billed by Equina";
  return "Free, for as long as you like.";
};

/** The value beside "Plan" in Account. */
export const planRowValue = (plan: PlanState) => {
  if (!plan.enforced && plan.tier === "free") return "Everything open";
  return plan.status === "trialing" ? `${planName(plan)} · trial` : planName(plan);
};

export type PlanFeature = { text: string; included: boolean };

const smallNumbers = ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];
// "Two 1-on-1 sessions" reads better than "2 1-on-1 sessions".
const counted = (count: number) => smallNumbers[count] ?? String(count);

/** What a plan holds, in a rider's words, in the same order on every card. */
export const tierFeatures = (tier: PlanTier): PlanFeature[] => [
  { text: "Your horse's records and ride journal", included: true },
  {
    text: tier.academyPicks === null
      ? "Every Academy lesson"
      : `Free lessons, plus ${tier.academyPicks} ${tier.academyPicks === 1 ? "lesson" : "lessons"} you choose`,
    included: true
  },
  {
    text: tier.clubAccess === "post" ? "The Club: post, comment and react" : tier.clubAccess === "read" ? "The Club, to read" : "The Club",
    included: tier.clubAccess !== "none"
  },
  { text: `${tier.monthlyCredits} Ralf credits a month`, included: tier.monthlyCredits > 0 },
  {
    text: tier.coachSessions > 0
      ? `${counted(tier.coachSessions)} 1-on-1 ${tier.coachSessions === 1 ? "session" : "sessions"} with a coach`
      : "1-on-1 sessions with a coach",
    included: tier.coachSessions > 0
  },
  {
    text: tier.eventTickets > 0
      ? `${tier.eventTickets === 1 ? "A ticket" : `${counted(tier.eventTickets)} tickets`} to Equina's annual event`
      : "A ticket to Equina's annual event",
    included: tier.eventTickets > 0
  }
];
