// What a lesson form may hold, checked before anything reaches the database.
// The database enforces the same limits (202609280001, 202610050001); these
// exist so staff see which field to fix rather than a constraint name.
//
// No imports: the project's test suite runs these rules directly.

// The app files a lesson under one of these and shows them as its topic
// filter (knownTopics in src/features/academy/academy-catalog.ts). A lesson
// filed anywhere else is only reachable under "All".
export const lessonCategories = ["Dressage", "Jumping", "Care", "Mindset"] as const;

export const lessonDisciplines = ["dressage", "jumping", "eventing", "western", "endurance", "trail"] as const;
export const lessonLevels = ["beginner", "intermediate", "advanced", "pro"] as const;
export const lessonAccess = ["free", "paid"] as const;

export type LessonCategory = (typeof lessonCategories)[number];
export type LessonDiscipline = (typeof lessonDisciplines)[number];
export type LessonLevel = (typeof lessonLevels)[number];
export type LessonAccess = (typeof lessonAccess)[number];

export type LessonFields = {
  title: string;
  summary: string;
  category: LessonCategory;
  discipline: LessonDiscipline | null;
  level: LessonLevel | null;
  access: LessonAccess;
  duration_seconds: number | null;
  coach_name: string | null;
  coach_title: string | null;
  position: number;
};

export type LessonFieldName = "title" | "summary" | "category" | "discipline" | "level" | "access" | "duration" | "coachName" | "coachTitle" | "position";
export type FieldErrors = Partial<Record<LessonFieldName, string>>;

export const capitalized = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

const oneOf = <T extends string>(options: readonly T[], value: string): T | undefined =>
  options.find((option) => option === value);

// "14:30", "1:02:00" or "45" (seconds). Returns null for an empty field and
// undefined for something that is not a time.
export const parseClock = (input: string): number | null | undefined => {
  const value = input.trim();
  if (!value) return null;
  if (!/^\d+(:\d{1,2}){0,2}$/.test(value)) return undefined;
  const parts = value.split(":").map(Number);
  if (parts.slice(1).some((part) => part > 59)) return undefined;
  return parts.reduce((total, part) => total * 60 + part, 0);
};

export const formatClock = (totalSeconds: number) => {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = hours ? String(minutes).padStart(2, "0") : String(minutes);
  return `${hours ? `${hours}:` : ""}${mm}:${String(seconds).padStart(2, "0")}`;
};

// A stable, readable id for a new lesson. It is set once, from the first
// title, and never follows later renames.
export const slugFor = (title: string) =>
  title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72)
    .replace(/-+$/g, "") || "lesson";

const optionalText = (value: string) => value.trim() || null;

export const readLessonForm = (read: (name: string) => string): { fields: LessonFields | null; errors: FieldErrors } => {
  const errors: FieldErrors = {};
  const title = read("title").trim();
  const summary = read("summary").trim();
  const category = oneOf(lessonCategories, read("category"));
  const disciplineInput = read("discipline");
  const discipline = disciplineInput ? oneOf(lessonDisciplines, disciplineInput) : null;
  const levelInput = read("level");
  const level = levelInput ? oneOf(lessonLevels, levelInput) : null;
  const access = oneOf(lessonAccess, read("access"));
  const duration = parseClock(read("duration"));
  const coachName = optionalText(read("coachName"));
  const coachTitle = optionalText(read("coachTitle"));
  const positionInput = read("position").trim();
  const position = positionInput ? Number(positionInput) : 0;

  if (title.length < 2 || title.length > 120) errors.title = "Give the lesson a title of 2 to 120 characters.";
  if (summary.length < 2 || summary.length > 500) errors.summary = "Write a summary of 2 to 500 characters.";
  if (!category) errors.category = "Choose where the lesson is filed.";
  if (discipline === undefined) errors.discipline = "Choose a discipline, or leave it for every discipline.";
  if (level === undefined) errors.level = "Choose a level, or leave it for every level.";
  if (!access) errors.access = "Choose free or paid.";
  if (duration === undefined) errors.duration = "Write the length as minutes and seconds, e.g. 14:30.";
  else if (duration !== null && (duration < 1 || duration > 86400)) errors.duration = "A lesson runs between 1 second and 24 hours.";
  if (coachName && coachName.length > 120) errors.coachName = "Keep the name under 120 characters.";
  if (coachTitle && coachTitle.length > 120) errors.coachTitle = "Keep the title under 120 characters.";
  if (!Number.isInteger(position) || position < 0 || position > 9999) errors.position = "Use a whole number from 0 to 9999.";

  if (Object.keys(errors).length || !category || discipline === undefined || level === undefined || !access || duration === undefined) {
    return { fields: null, errors };
  }
  return {
    fields: {
      title,
      summary,
      category,
      discipline,
      level,
      access,
      duration_seconds: duration,
      coach_name: coachName,
      coach_title: coachTitle,
      position
    },
    errors
  };
};

export type ChapterMark = { starts_at_seconds: number; title: string };

// Chapters arrive as two parallel lists from the editor. Blank rows are
// skipped, so an extra empty row is not an error.
export const readChapters = (
  times: string[],
  titles: string[],
  lessonSeconds: number | null
): { marks: ChapterMark[]; error: null } | { marks: null; error: string } => {
  const marks: ChapterMark[] = [];
  for (let index = 0; index < Math.max(times.length, titles.length); index += 1) {
    const time = (times[index] ?? "").trim();
    const title = (titles[index] ?? "").trim();
    if (!time && !title) continue;
    const row = index + 1;
    const startsAt = parseClock(time);
    const refuse = (error: string) => ({ marks: null, error: `Row ${row}: ${error}` });
    if (startsAt === null || startsAt === undefined) return refuse("write when the chapter starts, e.g. 4:20.");
    if (!title) return refuse("give the chapter a title.");
    if (title.length > 120) return refuse("keep the title under 120 characters.");
    if (lessonSeconds !== null && startsAt >= lessonSeconds) {
      return refuse(`starts at ${formatClock(startsAt)}, after the lesson ends (${formatClock(lessonSeconds)}).`);
    }
    if (marks.some((mark) => mark.starts_at_seconds === startsAt)) {
      return refuse(`another chapter already starts at ${formatClock(startsAt)}.`);
    }
    marks.push({ starts_at_seconds: startsAt, title });
  }
  if (marks.length > 60) return { marks: null, error: "A lesson can have at most 60 chapters." };
  return { marks: marks.sort((a, b) => a.starts_at_seconds - b.starts_at_seconds), error: null };
};

export type VideoStatus = "uploading" | "processing" | "ready" | "failed";

// What still stands between a draft and riders. The database checks the same
// two things when staff press Publish.
export const publishBlockers = (durationSeconds: number | null, video: VideoStatus | null) => {
  const blockers: string[] = [];
  if (durationSeconds === null) blockers.push("Add the lesson's length.");
  if (video === null) blockers.push("Upload the video.");
  else if (video === "uploading") blockers.push("Finish uploading the video.");
  else if (video === "processing") blockers.push("Wait for the video to finish processing.");
  else if (video === "failed") blockers.push("The video failed to process. Upload it again.");
  return blockers;
};
