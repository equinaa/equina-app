// What the plans page shows and accepts. The database holds the same limits
// (202610060001); these exist so staff see which field to fix.
//
// No imports: the project's test suite runs these rules directly.

// The keys are the database's; riders and staff only ever see the names.
export const planKeys = ["free", "mid", "premium"] as const;
export type PlanKey = (typeof planKeys)[number];

export const clubAccessLevels = ["none", "read", "post"] as const;
export type ClubAccess = (typeof clubAccessLevels)[number];

export const clubAccessLabel: Record<ClubAccess, string> = {
  none: "No Club",
  read: "Reads the Club",
  post: "Reads and posts"
};

// A plan row joined with its Ralf allowance, as the page reads it.
export type PlanTierRow = {
  key: PlanKey;
  name: string;
  rank: number;
  academy_picks: number | null;
  club_access: ClubAccess;
  coach_sessions: number;
  event_tickets: number;
  trial_days: number;
  monthly_credits: number;
};

export type PlanTierFields = {
  name: string;
  academyPicks: number | null;
  clubAccess: ClubAccess;
  monthlyCredits: number;
  coachSessions: number;
  eventTickets: number;
  trialDays: number;
};

export type PlanTierFieldName = keyof PlanTierFields;
export type PlanTierErrors = Partial<Record<PlanTierFieldName, string>>;

export const planTierFieldNames: PlanTierFieldName[] = [
  "name", "academyPicks", "clubAccess", "monthlyCredits", "coachSessions", "eventTickets", "trialDays"
];

const wholeNumber = (input: string, min: number, max: number): number | undefined => {
  const value = input.trim();
  if (!/^\d{1,6}$/.test(value)) return undefined;
  const parsed = Number(value);
  return parsed >= min && parsed <= max ? parsed : undefined;
};

export const planTierValues = (row: PlanTierRow): Record<PlanTierFieldName, string> => ({
  name: row.name,
  academyPicks: row.academy_picks === null ? "" : String(row.academy_picks),
  clubAccess: row.club_access,
  monthlyCredits: String(row.monthly_credits),
  coachSessions: String(row.coach_sessions),
  eventTickets: String(row.event_tickets),
  trialDays: String(row.trial_days)
});

export const readPlanTierForm = (
  key: PlanKey,
  read: (name: PlanTierFieldName) => string
): { fields: PlanTierFields | null; errors: PlanTierErrors } => {
  const errors: PlanTierErrors = {};

  const name = read("name").trim();
  if (name.length < 1 || name.length > 40) errors.name = "Give the plan a name of up to 40 characters.";

  const picksInput = read("academyPicks").trim();
  const academyPicks = picksInput === "" ? null : wholeNumber(picksInput, 0, 1000);
  if (academyPicks === undefined) errors.academyPicks = "A number from 0 to 1000, or empty for every lesson.";

  const clubAccess = clubAccessLevels.find((level) => level === read("clubAccess"));
  if (!clubAccess) errors.clubAccess = "Choose how much of the Club this plan opens.";

  const monthlyCredits = wholeNumber(read("monthlyCredits"), 0, 100000);
  if (monthlyCredits === undefined) errors.monthlyCredits = "A number from 0 to 100000.";

  const coachSessions = wholeNumber(read("coachSessions"), 0, 52);
  if (coachSessions === undefined) errors.coachSessions = "A number from 0 to 52.";

  const eventTickets = wholeNumber(read("eventTickets"), 0, 10);
  if (eventTickets === undefined) errors.eventTickets = "A number from 0 to 10.";

  // Free has no trial; the field is not offered for it.
  const trialDays = key === "free" ? 0 : wholeNumber(read("trialDays"), 0, 31);
  if (trialDays === undefined) errors.trialDays = "A number of days from 0 to 31.";

  if (
    Object.keys(errors).length > 0 ||
    academyPicks === undefined ||
    !clubAccess ||
    monthlyCredits === undefined ||
    coachSessions === undefined ||
    eventTickets === undefined ||
    trialDays === undefined
  ) {
    return { fields: null, errors };
  }
  return {
    fields: { name, academyPicks, clubAccess, monthlyCredits, coachSessions, eventTickets, trialDays },
    errors
  };
};

const clubSummary: Record<ClubAccess, string> = {
  none: "no Club",
  read: "reads the Club",
  post: "the whole Club"
};

// What a plan holds, in one line for staff.
export const planSummary = (row: Pick<PlanTierRow, "academy_picks" | "club_access" | "monthly_credits">) => {
  const lessons = row.academy_picks === null
    ? "Every lesson"
    : `Free lessons + ${row.academy_picks} paid ${row.academy_picks === 1 ? "pick" : "picks"}`;
  return `${lessons} · ${clubSummary[row.club_access]} · ${row.monthly_credits} Ralf credits a month`;
};

// --- Giving a plan -------------------------------------------------------------

export type GrantFields = {
  email: string;
  tier: PlanKey;
  // The end of the chosen day, UTC, or null for no end date.
  endsAt: string | null;
  note: string | null;
};
export type GrantFieldName = "email" | "tier" | "until" | "note";
export type GrantErrors = Partial<Record<GrantFieldName, string>>;

// `until` comes from a date input (YYYY-MM-DD). A plan given "until 31
// December" lasts through that whole day.
export const readGrantForm = (
  read: (name: GrantFieldName) => string,
  now: Date
): { fields: GrantFields | null; errors: GrantErrors } => {
  const errors: GrantErrors = {};

  const email = read("email").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 320) errors.email = "Enter the rider's email.";

  const tier = planKeys.find((key) => key === read("tier"));
  if (!tier) errors.tier = "Choose a plan.";

  const until = read("until").trim();
  let endsAt: string | null = null;
  if (until) {
    const end = /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(`${until}T23:59:59.999Z`) : null;
    if (!end || Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== until) {
      errors.until = "Choose a date, or leave it empty.";
    } else if (end.getTime() <= now.getTime()) {
      errors.until = "Choose a date after today, or leave it empty for no end date.";
    } else {
      endsAt = end.toISOString();
    }
  }

  const note = read("note").trim();
  if (note.length > 500) errors.note = "Keep the note under 500 characters.";

  if (Object.keys(errors).length > 0 || !tier) return { fields: null, errors };
  return { fields: { email, tier, endsAt, note: note || null }, errors };
};

// --- Who holds a plan ------------------------------------------------------------

export type HeldPlan = {
  user_id: string;
  email: string;
  display_name: string | null;
  source: "app_store" | "play" | "stripe" | "staff";
  tier: PlanKey;
  tier_name: string;
  status: "trialing" | "active" | "grace" | "expired" | "revoked";
  live: boolean;
  started_at: string;
  trial_ends_at: string | null;
  ends_at: string | null;
  note: string | null;
  granted_by_email: string | null;
  updated_at: string;
};

export const sourceLabel: Record<HeldPlan["source"], string> = {
  app_store: "App Store",
  play: "Google Play",
  stripe: "Stripe",
  staff: "Given by staff"
};

// The state a row is in, as a chip. A plan whose end date passed reads as
// ended even before anything rewrote its status.
export const heldPlanState = (row: Pick<HeldPlan, "status" | "live">): { label: string; tone: string } => {
  if (row.status === "revoked") return { label: "Removed", tone: "" };
  if (!row.live) return { label: "Ended", tone: "" };
  if (row.status === "trialing") return { label: "Free trial", tone: "warning" };
  if (row.status === "grace") return { label: "Payment retrying", tone: "warning" };
  return { label: "Active", tone: "positive" };
};
