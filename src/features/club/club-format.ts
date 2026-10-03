import { networkUnreachable } from "../../backend/errors";

/** The reasons public.report_reason accepts, in the order the sheet lists them. */
export const clubReportReasons = [
  { value: "harassment", label: "Harassment or bullying" },
  { value: "unsafe_advice", label: "Unsafe horse care advice" },
  { value: "animal_welfare", label: "Animal welfare concern" },
  { value: "spam", label: "Spam" },
  { value: "scam", label: "Scam or fraud" },
  { value: "nudity", label: "Nudity or sexual content" },
  { value: "other", label: "Something else" }
] as const;

export type ClubReportReason = (typeof clubReportReasons)[number]["value"];

const disciplineSpaces: Record<string, string> = {
  Dressage: "dressage",
  Jumping: "jumping",
  Eventing: "eventing",
  Trail: "trail"
};

/** The Club space a rider's discipline posts to by default. */
export const spaceSlugForDiscipline = (discipline: string) =>
  disciplineSpaces[discipline] ?? "coach-qa";

const monthDay = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

/** "Just now", "5m", "3h", "2d", then the date. */
export const relativeTime = (iso: string, now = Date.now()) => {
  const then = Date.parse(iso);
  if (!Number.isFinite(then)) return "";
  const minutes = Math.floor(Math.max(0, now - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return monthDay.format(new Date(then));
};

/**
 * The ride, written into the post itself. Other riders cannot read the
 * author's ride journal -- it is private by design -- so a shared ride carries
 * its own summary rather than a reference they could not open.
 */
export const rideShareLine = (ride: {
  horseName?: string;
  elapsedSeconds: number;
  focus: string;
  mood?: string;
}) => {
  const minutes = Math.max(1, Math.round(ride.elapsedSeconds / 60));
  return [
    ride.horseName?.trim() || undefined,
    `${minutes} min`,
    ride.focus.trim() || undefined,
    ride.mood ? `felt ${ride.mood.toLowerCase()}` : undefined
  ].filter(Boolean).join(" · ");
};

type ErrorShape = { code?: unknown; message?: unknown };

/** A second report of the same post by the same rider. Already done, not a failure. */
export const isDuplicateReport = (error: unknown) =>
  Boolean(error && typeof error === "object" && (error as ErrorShape).code === "23505");

/** What a failed Club action tells the rider. The database's own words never reach the screen. */
export const clubErrorMessage = (error: unknown, fallback: string) => {
  if (!error || typeof error !== "object") return fallback;
  const { code, message } = error as ErrorShape;
  const text = typeof message === "string" ? message : "";
  if (code === networkUnreachable) return "Equina is offline. Reconnect and try again.";
  if (/rate limit/i.test(text)) return "You are posting quickly. Wait a few minutes and try again.";
  if (/temporarily restricted/i.test(text)) return "This account is temporarily restricted from Club.";
  if (code === "42501" || /row-level security|permission denied|not enabled/i.test(text)) {
    return "Club is not open for this account yet.";
  }
  return fallback;
};
