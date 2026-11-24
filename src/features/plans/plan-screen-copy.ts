import type { PlanTier } from "../../backend/contracts";

/**
 * The plan screen's own words, apart from the paywall's (paywall-copy.ts).
 * With no over-the-air updates they stay as written for as long as a build is
 * installed, so each has to be true on iOS, Android and the web alike.
 */

/**
 * What a credit is, under the plans wherever they are listed. Every message to
 * Ralf costs one: he takes no photos, so nothing costs more.
 */
export const creditsNote =
  "One Ralf credit is one message. The Equina team arranges coach sessions and event tickets with you.";

/**
 * While nothing is for sale: no store key, the web, or plans not enforced.
 * No store is named, no price and no way to pay elsewhere: during the beta a
 * rider's plan is the one the Equina team gave them.
 */
export const closedPlansCopy = {
  lead: "These are the plans for when subscriptions open.",
  title: "Subscriptions are not open yet",
  body: "During the beta the Equina team sets your plan. Nothing is sold in the app yet."
} as const;

/** The corner of a plan's card. Staff set the days in the Admin; 0 shows none. */
export const closedTrialPill = (tier: PlanTier) => (tier.trialDays > 0 ? `${tier.trialDays}-day free trial` : null);

/**
 * The trial behind those pills, in a sentence. Nobody can start one while
 * nothing is sold, so it says when it applies. Null when no plan has a trial,
 * or when the plans differ: the pills then say each.
 */
export const closedTrialLine = (tiers: PlanTier[]): string | null => {
  const withTrial = tiers.filter((tier) => tier.key !== "free" && tier.trialDays > 0);
  const lengths = [...new Set(withTrial.map((tier) => tier.trialDays))];
  if (withTrial.length === 0 || lengths.length !== 1) return null;
  const names = withTrial.map((tier) => tier.name).join(" and ");
  return `When subscriptions open, ${names} ${withTrial.length === 1 ? "starts" : "start"} with a ${lengths[0]}-day free trial.`;
};
