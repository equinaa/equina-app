import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { lessonColumns, videoOf, type LessonRow } from "@/lib/lesson-data";
import { formatClock, publishBlockers } from "@/lib/lessons";
import { LocalTime } from "@/components/local-time";
import { requireStaff } from "@/lib/staff";
import { ChaptersEditor } from "../chapters-editor";
import { LessonForm } from "../lesson-form";
import { DeleteDraftButton, PublishButton } from "../publish-controls";
import { VideoPanel } from "../video-panel";

export const metadata: Metadata = { title: "Lesson" };

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidPattern.test(id)) notFound();
  const { supabase } = await requireStaff();

  const [{ data: lessonData }, { data: chapterData }] = await Promise.all([
    supabase.from("academy_lessons").select(lessonColumns).eq("id", id).maybeSingle(),
    supabase.from("academy_chapters").select("starts_at_seconds, title").eq("lesson_id", id).order("starts_at_seconds")
  ]);
  const lesson = lessonData as unknown as LessonRow | null;
  if (!lesson) notFound();
  const chapters = (chapterData ?? []) as Array<{ starts_at_seconds: number; title: string }>;

  const video = videoOf(lesson);
  const videoStatus = video?.status ?? null;
  const published = Boolean(lesson.published_at);
  const blockers = publishBlockers(lesson.duration_seconds, videoStatus);

  return (
    <main className="page">
      <div className="page-head">
        <div>
          <Link href="/lessons" className="back">← Lessons</Link>
          <h1>{lesson.title}</h1>
          <p className="meta">
            {published && lesson.published_at
              ? <>Live for riders since <LocalTime iso={lesson.published_at} style="long" /></>
              : "Draft · riders cannot see it"}
            {" · "}/{lesson.slug}
          </p>
        </div>
      </div>

      <div className="columns">
        <div className="stack">
          <section className="panel" aria-labelledby="details-title">
            <h2 id="details-title">Details</h2>
            {published ? (
              <p className="notice">This lesson is live. Changes reach riders as soon as you save.</p>
            ) : null}
            <LessonForm
              mode="edit"
              lessonId={lesson.id}
              values={{
                title: lesson.title,
                summary: lesson.summary,
                category: lesson.category,
                discipline: lesson.discipline ?? "",
                level: lesson.level ?? "",
                access: lesson.access,
                duration: lesson.duration_seconds ? formatClock(lesson.duration_seconds) : "",
                coachName: lesson.coach_name ?? "",
                coachTitle: lesson.coach_title ?? "",
                position: String(lesson.position)
              }}
              videoLength={videoStatus === "ready" && lesson.duration_seconds ? formatClock(lesson.duration_seconds) : null}
            />
          </section>

          <section className="panel" aria-labelledby="chapters-title">
            <div className="panel-head">
              <h2 id="chapters-title">Chapters</h2>
              <span className="meta">{chapters.length === 1 ? "1 chapter" : `${chapters.length} chapters`}</span>
            </div>
            <ChaptersEditor
              lessonId={lesson.id}
              chapters={chapters.map((chapter) => ({ time: formatClock(chapter.starts_at_seconds), title: chapter.title }))}
            />
          </section>
        </div>

        <aside className="stack" aria-label="Publishing">
          <section className="panel" aria-labelledby="status-title">
            <div className="panel-head">
              <h2 id="status-title">Status</h2>
              {published ? <span className="chip positive">Published</span> : <span className="chip">Draft</span>}
            </div>
            {!published && blockers.length > 0 ? (
              <>
                <p className="meta">Before riders can see it:</p>
                <ul className="checklist">
                  {blockers.map((blocker) => <li key={blocker}>{blocker}</li>)}
                </ul>
              </>
            ) : null}
            {!published && blockers.length === 0 ? <p className="meta">Everything is in place. Publishing shows it to every rider.</p> : null}
            {published ? <p className="meta">Unpublishing hides it from riders and keeps their progress.</p> : null}
            <PublishButton lessonId={lesson.id} published={published} blocked={blockers.length > 0} />
          </section>

          <section className="panel" aria-labelledby="video-title">
            <div className="panel-head">
              <h2 id="video-title">Video</h2>
              {videoStatus === "ready" ? <span className="chip positive">Ready</span> : null}
              {videoStatus === "uploading" ? <span className="chip warning">Uploading</span> : null}
              {videoStatus === "processing" ? <span className="chip warning">Processing</span> : null}
              {videoStatus === "failed" ? <span className="chip critical">Failed</span> : null}
            </div>
            <VideoPanel
              lessonId={lesson.id}
              published={published}
              video={video ? { status: video.status, failureReason: video.failure_reason } : null}
            />
          </section>

          {!published ? (
            <section className="panel" aria-labelledby="delete-title">
              <h2 id="delete-title">Delete</h2>
              <p className="meta">Only drafts can be deleted. A published lesson is unpublished first.</p>
              <DeleteDraftButton lessonId={lesson.id} title={lesson.title} />
            </section>
          ) : null}
        </aside>
      </div>
    </main>
  );
}
