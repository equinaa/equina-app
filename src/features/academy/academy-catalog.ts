import type { AcademyLesson, AcademyProgress } from "../../backend";
import { networkUnreachable } from "../../backend/errors";

export type AcademyRiderLevel = "Beginner" | "Intermediate" | "Advanced" | "Pro";
const riderLevels: readonly string[] = ["Beginner", "Intermediate", "Advanced", "Pro"];

/** The few facts about a rider that decide which lesson comes next. */
export type AcademyRider = {
  level: AcademyRiderLevel;
  /** "Dressage", "Jumping", "Eventing" or "Trail". */
  discipline: string;
  goal: string;
};

/** A lesson as the rider sees it, whichever catalogue it came from. */
export type AcademyLessonView = {
  /** The database id of a live lesson, or a fixed slug in the preview. */
  id: string;
  title: string;
  /** Who taught it, or the Academy itself when nobody is credited. */
  coach: string;
  coachTitle?: string;
  /** "18 min", or empty until the video host reports a length. */
  duration: string;
  durationSeconds?: number;
  /** A rider level, or a label for a lesson that suits anyone. */
  level: string;
  topic: string;
  discipline?: string;
  summary: string;
  image: string;
  chapters: Array<{ time: string; title: string; seconds: number }>;
  /** How far this rider got, 0 to 100. */
  progress: number;
  positionSeconds: number;
  completed: boolean;
  /** The bundled preview clip, or a signed link from academy-playback. */
  video: "preview" | "live";
  /** Free lessons are open on every plan; a paid one may need a pick. */
  access: "free" | "paid";
};

export const academyCredit = "Equina Academy";
export const allLevelsLabel = "All levels";

// The topics the Academy filters by. The admin offers exactly these when staff
// file a lesson (admin/src/lib/lessons.ts); tests/admin.test.ts keeps the two
// lists equal.
export const knownTopics = ["Dressage", "Jumping", "Care", "Mindset"];

const levelLabels: Record<string, AcademyRiderLevel> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  pro: "Pro"
};

export const formatLessonDuration = (seconds?: number) =>
  seconds && seconds > 0 ? `${Math.max(1, Math.round(seconds / 60))} min` : "";

export const formatChapterTime = (seconds: number) => {
  const whole = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
};

/** Joins the parts of a meta line, skipping any that are not known yet. */
export const metaLine = (...parts: Array<string | undefined>) =>
  parts.filter((part): part is string => Boolean(part && part.trim())).join(" · ");

/**
 * A finished lesson is 100. An unfinished one never shows 100, even parked a
 * second before the end: finishing is something the rider does, not a
 * position the player happens to be at.
 */
export const lessonProgressPercent = (durationSeconds: number | undefined, progress?: AcademyProgress) => {
  if (!progress) return 0;
  if (progress.completedAt) return 100;
  if (!durationSeconds || durationSeconds <= 0) return 0;
  return Math.min(99, Math.max(0, Math.round((progress.positionSeconds / durationSeconds) * 100)));
};

// The admin offers these four as categories. Anything else is shown as
// written, so a new category appears under "All" rather than disappearing.
const topicFor = (category: string) => {
  const trimmed = category.trim();
  return knownTopics.find((topic) => topic.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
};

export const liveLessonView = (
  lesson: AcademyLesson,
  progress: AcademyProgress | undefined,
  imageFor: (topic: string, discipline?: string) => string
): AcademyLessonView => {
  const topic = topicFor(lesson.category);
  return {
    id: lesson.id,
    title: lesson.title,
    coach: lesson.coachName?.trim() || academyCredit,
    coachTitle: lesson.coachTitle?.trim() || undefined,
    duration: formatLessonDuration(lesson.durationSeconds),
    durationSeconds: lesson.durationSeconds,
    level: lesson.level ? levelLabels[lesson.level] ?? allLevelsLabel : allLevelsLabel,
    topic,
    discipline: lesson.discipline,
    summary: lesson.summary,
    image: imageFor(topic, lesson.discipline),
    chapters: lesson.chapters.map((chapter) => ({
      time: formatChapterTime(chapter.startsAtSeconds),
      title: chapter.title,
      seconds: chapter.startsAtSeconds
    })),
    progress: lessonProgressPercent(lesson.durationSeconds, progress),
    positionSeconds: progress?.positionSeconds ?? 0,
    completed: Boolean(progress?.completedAt),
    video: "live",
    access: lesson.access
  };
};

// The preview names one lesson per discipline and level. In the live
// catalogue no title matches, and lessons rank on fit alone.
const previewPicks: Record<string, Partial<Record<AcademyRiderLevel, string>>> = {
  Dressage: { Beginner: "Better Transitions", Intermediate: "Elastic Contact", Advanced: "Elastic Contact", Pro: "Elastic Contact" },
  Jumping: { Beginner: "Find the Canter", Intermediate: "Confident Lines", Advanced: "See the Distance", Pro: "Competition Warm-up" },
  Eventing: { Beginner: "Recovery Check", Intermediate: "Confident Lines", Advanced: "Brave Oxer Mindset", Pro: "Recovery Check" },
  Trail: { Beginner: "Recovery Check", Intermediate: "Brave Oxer Mindset", Advanced: "Recovery Check", Pro: "Recovery Check" }
};

const focusAliases: Record<string, string[]> = {
  Transitions: ["transition", "cue"],
  Contact: ["contact", "rein", "hand"],
  Suppleness: ["supple", "stretch", "loosen"],
  Rhythm: ["rhythm", "tempo", "canter"],
  Lines: ["line", "distance"],
  Confidence: ["confidence", "confident", "brave", "calm"],
  Balance: ["balance", "pace"],
  Fitness: ["fitness", "canter set", "hill"],
  Recovery: ["recovery", "post-ride", "cool"],
  Relaxation: ["relax", "loose rein", "calm"]
};

const matchesDiscipline = (lesson: AcademyLessonView, rider: AcademyRider) =>
  lesson.topic === rider.discipline ||
  (lesson.discipline !== undefined && lesson.discipline.toLowerCase() === rider.discipline.toLowerCase());

export const lessonRelevance = (lesson: AcademyLessonView, rider: AcademyRider, focus = "") => {
  let score = 0;
  const lessonText = `${lesson.title} ${lesson.summary}`.toLowerCase();
  const lessonHasExplicitLevel = riderLevels.includes(lesson.level);
  const matchingFocus = (focusAliases[focus] ?? [focus.toLowerCase()]).some((term) => lessonText.includes(term));

  if (lesson.title === previewPicks[rider.discipline]?.[rider.level]) score += 100;
  if (matchesDiscipline(lesson, rider)) score += 48;
  if (lesson.level === rider.level) score += 32;
  if (rider.goal === "Competition" && lesson.topic === "Mindset") score += 120;
  if (rider.goal === "Horse care" && lesson.topic === "Care") score += 180;
  if (rider.goal === "Learn faster" && lesson.level === rider.level) score += 80;
  if (focus && matchingFocus) score += 190;
  if (lessonHasExplicitLevel && lesson.level !== rider.level) score -= 260;
  if (lesson.progress > 0 && lesson.progress < 100) score += 8;

  return score;
};

export const personalizedLessons = (lessons: AcademyLessonView[], rider: AcademyRider, focus = "") =>
  [...lessons].sort((a, b) => lessonRelevance(b, rider, focus) - lessonRelevance(a, rider, focus));

export const academyPathFor = (lessons: AcademyLessonView[], rider: AcademyRider, focus = "") =>
  personalizedLessons(lessons, rider, focus).filter((lesson, index) => {
    if (index === 0) return true;
    const levelCompatible = !riderLevels.includes(lesson.level) || lesson.level === rider.level;
    const disciplineCompatible = matchesDiscipline(lesson, rider) || lesson.topic === "Care" || lesson.topic === "Mindset";
    return levelCompatible && disciplineCompatible;
  });

/** The next lesson for this rider, or nothing while the catalogue is empty. */
export const recommendedLessonFor = (lessons: AcademyLessonView[], rider: AcademyRider, focus = "") =>
  personalizedLessons(lessons, rider, focus)[0];

/** How far through a path the rider is: the average of its lessons. */
export const pathProgress = (path: AcademyLessonView[]) =>
  path.length === 0 ? 0 : Math.round(path.reduce((sum, lesson) => sum + lesson.progress, 0) / path.length);

export const lessonVideoErrorMessage = (error: unknown) => {
  const code = error && typeof error === "object" ? (error as { code?: unknown }).code : undefined;
  if (code === networkUnreachable) return "Equina is offline. Reconnect to watch this lesson.";
  if (code === "video_not_ready") return "This lesson is still being prepared. Try again in a few minutes.";
  if (code === "lesson_not_found") return "This lesson is no longer available.";
  if (code === "lesson_locked") return "This lesson is part of a plan. Choose it as one of your lessons, or see the plans.";
  return "This video could not be loaded. Try again shortly.";
};
