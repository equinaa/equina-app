// Words for the moderation queue. No imports: the project's tests run these.

// public.report_reason, as riders pick it in the app.
const reasonLabels: Record<string, string> = {
  spam: "Spam",
  scam: "Scam",
  harassment: "Harassment",
  unsafe_advice: "Unsafe advice",
  animal_welfare: "Animal welfare",
  nudity: "Nudity",
  other: "Other"
};

export const reasonLabel = (reason: string) => reasonLabels[reason] ?? reason;

export type QueueItem = {
  content_type: "post" | "comment";
  content_id: string;
  post_id: string;
  space_name: string;
  author_id: string;
  author_name: string | null;
  body: string;
  status: "visible" | "hidden" | "pending" | "draft";
  open_reports: number;
  reasons: string[];
  report_details: string[];
  last_reported_at: string | null;
  created_at: string;
};

// Why an item is in front of staff, in one line.
export const queueReason = (item: Pick<QueueItem, "status" | "open_reports" | "reasons">) => {
  const reports = item.open_reports === 1 ? "1 report" : `${item.open_reports} reports`;
  const reasons = item.reasons.map(reasonLabel).join(", ");
  if (item.open_reports > 0) {
    const effect = item.status === "hidden" ? "hidden until you decide" : "still visible";
    return `${reports} (${reasons}), ${effect}`;
  }
  if (item.status === "pending") return "Waiting since before post-moderation, not visible";
  return "Hidden by the phrase filter";
};

// The button that puts an item back reads as what it does to riders.
export const restoreLabel = (status: QueueItem["status"]) => (status === "visible" ? "Keep visible" : "Restore");
