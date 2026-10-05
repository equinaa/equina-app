import Link from "next/link";
import { requireStaff } from "@/lib/staff";

export default async function OverviewPage() {
  const { supabase } = await requireStaff();
  const [{ data: lessons }, { data: waiting }] = await Promise.all([
    supabase.from("academy_lessons").select("published_at"),
    supabase.rpc("staff_moderation_queue").select("content_id")
  ]);
  const published = (lessons ?? []).filter((lesson) => lesson.published_at).length;
  const drafts = (lessons ?? []).length - published;
  const queued = Array.isArray(waiting) ? waiting.length : 0;

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Today</h1>
          <p className="meta">What riders see in the Academy, and what is waiting in the Club.</p>
        </div>
      </div>
      <div className="summary-grid">
        <Link href="/moderation" className="summary">
          <span className="label">Moderation</span>
          <strong>{queued}</strong>
          <span className="meta">
            {queued === 0 ? "Nothing waiting for a decision." : queued === 1 ? "post or comment waiting for a decision." : "posts and comments waiting for a decision."}
          </span>
        </Link>
        <Link href="/lessons" className="summary">
          <span className="label">Academy</span>
          <strong>{published}</strong>
          <span className="meta">
            {published === 1 ? "lesson" : "lessons"} live for riders · {drafts} {drafts === 1 ? "draft" : "drafts"}
          </span>
        </Link>
      </div>
    </main>
  );
}
