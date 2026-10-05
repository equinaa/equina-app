import type { Metadata } from "next";
import Link from "next/link";
import { lessonColumns, videoStatusOf, type LessonRow } from "@/lib/lesson-data";
import { capitalized, formatClock, type VideoStatus } from "@/lib/lessons";
import { LocalTime } from "@/components/local-time";
import { requireStaff } from "@/lib/staff";

export const metadata: Metadata = { title: "Lessons" };

const videoChip: Record<VideoStatus | "none", { label: string; tone: string }> = {
  none: { label: "No video", tone: "" },
  uploading: { label: "Uploading", tone: "warning" },
  processing: { label: "Processing", tone: "warning" },
  ready: { label: "Ready", tone: "positive" },
  failed: { label: "Failed", tone: "critical" }
};

export default async function LessonsPage() {
  const { supabase } = await requireStaff();
  const { data, error } = await supabase
    .from("academy_lessons")
    .select(lessonColumns)
    .order("category")
    .order("position")
    .order("title");
  const lessons = (data ?? []) as unknown as LessonRow[];

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <h1>Lessons</h1>
          <p className="meta">The Academy catalogue. Riders see a lesson once it is published.</p>
        </div>
        <Link href="/lessons/new" className="button primary">New lesson</Link>
      </div>

      {error ? <p className="form-error" role="alert">The lessons could not be loaded. Refresh the page.</p> : null}

      {!error && lessons.length === 0 ? (
        <div className="empty">
          <h2>No lessons yet</h2>
          <p className="meta">Until the first lesson is published, the Academy in the app opens straight to Ralf.</p>
          <Link href="/lessons/new" className="button primary">Create the first lesson</Link>
        </div>
      ) : null}

      {lessons.length > 0 ? (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th scope="col">Lesson</th>
                <th scope="col">Filed under</th>
                <th scope="col">Length</th>
                <th scope="col">Video</th>
                <th scope="col">Status</th>
                <th scope="col">Updated</th>
              </tr>
            </thead>
            <tbody>
              {lessons.map((lesson) => {
                const video = videoChip[videoStatusOf(lesson) ?? "none"];
                return (
                  <tr key={lesson.id}>
                    <td>
                      <Link href={`/lessons/${lesson.id}`} className="row-link">{lesson.title}</Link>
                      <div className="meta">{lesson.coach_name || "Equina Academy"} · {capitalized(lesson.access)}</div>
                    </td>
                    <td>
                      {lesson.category}
                      <div className="meta">
                        {lesson.level ? capitalized(lesson.level) : "Every level"}
                        {lesson.discipline ? ` · ${capitalized(lesson.discipline)}` : ""}
                      </div>
                    </td>
                    <td>{lesson.duration_seconds ? formatClock(lesson.duration_seconds) : <span className="faint">Not set</span>}</td>
                    <td><span className={`chip ${video.tone}`}>{video.label}</span></td>
                    <td>
                      {lesson.published_at
                        ? <span className="chip positive">Published</span>
                        : <span className="chip">Draft</span>}
                    </td>
                    <td className="meta"><LocalTime iso={lesson.updated_at} style="date" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </main>
  );
}
