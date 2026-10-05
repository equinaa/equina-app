import type { Metadata } from "next";
import { queueReason, restoreLabel, type QueueItem } from "@/lib/moderation";
import { LocalTime } from "@/components/local-time";
import { requireStaff } from "@/lib/staff";
import { DecisionForm } from "./decision-form";

export const metadata: Metadata = { title: "Moderation" };

const statusChip: Record<QueueItem["status"], { label: string; tone: string }> = {
  hidden: { label: "Hidden", tone: "critical" },
  pending: { label: "Not visible", tone: "warning" },
  visible: { label: "Visible", tone: "positive" },
  draft: { label: "Draft", tone: "" }
};

export default async function ModerationPage() {
  const { supabase } = await requireStaff();
  const { data, error } = await supabase.rpc("staff_moderation_queue");
  const queue = (data ?? []) as QueueItem[];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Moderation</h1>
          <p className="meta">
            Club posts and comments riders reported, or the phrase filter hid. Restore puts an item back; Remove keeps it
            out of the Club for good.
          </p>
        </div>
      </div>

      {error ? <p className="form-error" role="alert">The queue could not be loaded. Refresh the page.</p> : null}

      {!error && queue.length === 0 ? (
        <div className="empty">
          <h2>Nothing waiting</h2>
          <p className="meta">New reports and filtered posts appear here.</p>
        </div>
      ) : null}

      <div className="queue">
        {queue.map((item) => {
          const chip = statusChip[item.status];
          return (
            <article key={`${item.content_type}-${item.content_id}`} className="queue-item" aria-label={`${item.content_type} by ${item.author_name ?? "a rider"}`}>
              <div className="queue-meta">
                <span className={`chip ${chip.tone}`}>{chip.label}</span>
                <h3>{item.content_type === "post" ? "Post" : "Comment"} in {item.space_name}</h3>
                <span className="meta">
                  by {item.author_name ?? "a rider"} · <LocalTime iso={item.created_at} style="moment" />
                </span>
              </div>
              <p className="meta">{queueReason(item)}</p>
              <p className="queue-body">{item.body}</p>
              {item.report_details.length > 0 ? (
                <ul className="report-notes" aria-label="What reporters wrote">
                  {item.report_details.slice(0, 3).map((detail, index) => <li key={index}>{detail}</li>)}
                </ul>
              ) : null}
              <DecisionForm contentType={item.content_type} contentId={item.content_id} restoreLabel={restoreLabel(item.status)} />
            </article>
          );
        })}
      </div>
    </main>
  );
}
