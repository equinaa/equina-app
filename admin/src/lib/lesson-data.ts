import "server-only";
import type { LessonAccess, LessonCategory, LessonDiscipline, LessonLevel, VideoStatus } from "@/lib/lessons";

export type LessonRow = {
  id: string;
  slug: string;
  title: string;
  summary: string;
  category: LessonCategory | string;
  discipline: LessonDiscipline | null;
  level: LessonLevel | null;
  access: LessonAccess;
  duration_seconds: number | null;
  coach_name: string | null;
  coach_title: string | null;
  position: number;
  published_at: string | null;
  updated_at: string;
  academy_videos: LessonVideo | LessonVideo[] | null;
};

type LessonVideo = { status: VideoStatus; failure_reason: string | null };

export const lessonColumns =
  "id, slug, title, summary, category, discipline, level, access, duration_seconds, coach_name, coach_title, position, published_at, updated_at, academy_videos(status, failure_reason)";

// A lesson has at most one video (lesson_id is the key). PostgREST returns
// that as an object, but tolerate the list shape too.
export const videoOf = (row: Pick<LessonRow, "academy_videos">): LessonVideo | null =>
  (Array.isArray(row.academy_videos) ? row.academy_videos[0] : row.academy_videos) ?? null;

export const videoStatusOf = (row: Pick<LessonRow, "academy_videos">): VideoStatus | null => videoOf(row)?.status ?? null;
