import type { SupabaseClient } from "@supabase/supabase-js";
import type { Discipline } from "../domain/types";
import type { AcademyChapter, AcademyLesson, AcademyPlaybackLink, AcademyProgress } from "./contracts";
import { EdgeClient } from "./edge-client";
import { backendError } from "./errors";

const mapChapter = (row: Record<string, unknown>): AcademyChapter => ({
  id: String(row.id),
  startsAtSeconds: Number(row.starts_at_seconds),
  title: String(row.title)
});

const mapLesson = (row: Record<string, unknown>): AcademyLesson => ({
  id: String(row.id),
  slug: String(row.slug),
  title: String(row.title),
  summary: String(row.summary),
  category: String(row.category),
  discipline: row.discipline ? (row.discipline as Discipline) : undefined,
  level: row.level ? (row.level as AcademyLesson["level"]) : undefined,
  access: row.access === "free" ? "free" : "paid",
  durationSeconds: row.duration_seconds === null || row.duration_seconds === undefined
    ? undefined
    : Number(row.duration_seconds),
  coachName: row.coach_name ? String(row.coach_name) : undefined,
  coachTitle: row.coach_title ? String(row.coach_title) : undefined,
  posterPath: row.poster_path ? String(row.poster_path) : undefined,
  position: Number(row.position ?? 0),
  chapters: Array.isArray(row.academy_chapters)
    ? (row.academy_chapters as Array<Record<string, unknown>>)
        .map(mapChapter)
        .sort((left, right) => left.startsAtSeconds - right.startsAtSeconds)
    : []
});

const mapProgress = (row: Record<string, unknown>): AcademyProgress => ({
  lessonId: String(row.lesson_id),
  positionSeconds: Number(row.position_seconds),
  completedAt: row.completed_at ? String(row.completed_at) : undefined,
  lastSeenAt: String(row.last_seen_at)
});

export class AcademyRepository {
  private readonly edge: EdgeClient;

  constructor(private readonly client: SupabaseClient) {
    this.edge = new EdgeClient(client);
  }

  /**
   * The published catalogue, with chapters. Row-level security already hides
   * drafts, so there is no filter here to forget: an unpublished lesson simply
   * does not come back.
   */
  async lessons(): Promise<AcademyLesson[]> {
    const { data, error } = await this.client
      .from("academy_lessons")
      .select("*, academy_chapters(id, starts_at_seconds, title)")
      .order("category", { ascending: true })
      .order("position", { ascending: true })
      .order("title", { ascending: true });
    if (error) throw backendError(error, "Lessons could not be loaded.");
    return (data ?? []).map((row) => mapLesson(row as Record<string, unknown>));
  }

  /** Everything this rider has started. Empty is the normal first answer. */
  async progress(): Promise<AcademyProgress[]> {
    const { data, error } = await this.client
      .from("academy_progress")
      .select("lesson_id, position_seconds, completed_at, last_seen_at")
      .order("last_seen_at", { ascending: false });
    if (error) throw backendError(error, "Lesson progress could not be loaded.");
    return (data ?? []).map((row) => mapProgress(row as Record<string, unknown>));
  }

  /**
   * Record where a rider stopped.
   *
   * Completion is passed in rather than inferred from the position: scrubbing
   * to the end is not finishing, and stopping at 95% is. Only the player knows
   * which happened, so only the caller may say.
   */
  async record(
    lessonId: string,
    positionSeconds: number,
    completed = false
  ): Promise<AcademyProgress> {
    const { data: auth } = await this.client.auth.getUser();
    const userId = auth.user?.id;
    if (!userId) throw backendError(null, "Sign in to keep your lesson progress.");

    const { data, error } = await this.client
      .from("academy_progress")
      .upsert(
        {
          user_id: userId,
          lesson_id: lessonId,
          position_seconds: Math.max(0, Math.round(positionSeconds)),
          completed_at: completed ? new Date().toISOString() : null,
          last_seen_at: new Date().toISOString()
        },
        { onConflict: "user_id,lesson_id" }
      )
      .select("lesson_id, position_seconds, completed_at, last_seen_at")
      .single();
    if (error) throw backendError(error, "Lesson progress could not be saved.");
    return mapProgress(data as Record<string, unknown>);
  }

  /**
   * A link to this lesson's video that works for a few hours. Videos live
   * with a video host and are never public: the server decides whether this
   * rider may watch, then signs a link only that lesson's files accept.
   */
  async playback(lessonId: string): Promise<AcademyPlaybackLink> {
    return this.edge.invoke<AcademyPlaybackLink>("academy-playback", { lessonId });
  }

  /** Forget a lesson entirely, so it reads as never started. */
  async forget(lessonId: string): Promise<void> {
    const { error } = await this.client.from("academy_progress").delete().eq("lesson_id", lessonId);
    if (error) throw backendError(error, "Lesson progress could not be cleared.");
  }
}
