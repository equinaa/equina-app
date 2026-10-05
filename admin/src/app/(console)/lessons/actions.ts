"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { edgeMessage } from "@/lib/edge";
import { readChapters, readLessonForm, slugFor, type FieldErrors } from "@/lib/lessons";
import { requireStaff, staffMessage } from "@/lib/staff";

const lessonFieldNames = ["title", "summary", "category", "discipline", "level", "access", "duration", "coachName", "coachTitle", "position"];

export type LessonFormState = {
  errors: FieldErrors;
  formError: string | null;
  saved: boolean;
  // What was submitted, so a refused form comes back as the person left it.
  values: Record<string, string>;
};

const submitted = (formData: FormData) =>
  Object.fromEntries(lessonFieldNames.map((name) => [name, String(formData.get(name) ?? "")]));

const refreshLessons = (lessonId?: string) => {
  revalidatePath("/", "layout");
  if (lessonId) revalidatePath(`/lessons/${lessonId}`);
};

export async function createLesson(_previous: LessonFormState, formData: FormData): Promise<LessonFormState> {
  const { supabase } = await requireStaff();
  const values = submitted(formData);
  const { fields, errors } = readLessonForm((name) => values[name] ?? "");
  if (!fields) return { errors, formError: "Check the highlighted fields.", saved: false, values };

  // The slug is the lesson's permanent id in links. Two lessons can share a
  // title, so a taken slug gets a number.
  const base = slugFor(fields.title);
  let createdId: string | null = null;
  for (let attempt = 1; attempt <= 5 && !createdId; attempt += 1) {
    const slug = attempt === 1 ? base : `${base}-${attempt}`;
    const { data, error } = await supabase.from("academy_lessons").insert({ ...fields, slug }).select("id").single();
    if (!error) createdId = (data as { id: string }).id;
    else if (error.code !== "23505") {
      return { errors: {}, formError: staffMessage(error, "The lesson could not be saved. Try again."), saved: false, values };
    }
  }
  if (!createdId) return { errors: { title: "Too many lessons share this title. Make it more specific." }, formError: null, saved: false, values };

  refreshLessons();
  redirect(`/lessons/${createdId}`);
}

export async function updateLesson(_previous: LessonFormState, formData: FormData): Promise<LessonFormState> {
  const { supabase } = await requireStaff();
  const lessonId = String(formData.get("lessonId") ?? "");
  const values = submitted(formData);
  const { fields, errors } = readLessonForm((name) => values[name] ?? "");
  if (!fields) return { errors, formError: "Check the highlighted fields.", saved: false, values };

  // Once the video is ready, the lesson is as long as the video says
  // (mux-webhook sets it), and a stale form must not overwrite that.
  const { data: video } = await supabase.from("academy_videos").select("status").eq("lesson_id", lessonId).maybeSingle();
  const { duration_seconds: typedLength, ...otherFields } = fields;
  const changes = video?.status === "ready" ? otherFields : { ...otherFields, duration_seconds: typedLength };

  const { data, error } = await supabase.from("academy_lessons").update(changes).eq("id", lessonId).select("id");
  if (error) return { errors: {}, formError: staffMessage(error, "The lesson could not be saved. Try again."), saved: false, values };
  if (!data?.length) return { errors: {}, formError: "This lesson no longer exists.", saved: false, values };

  refreshLessons(lessonId);
  return { errors: {}, formError: null, saved: true, values };
}

export type ChaptersState = { error: string | null; saved: boolean };

export async function saveChapters(_previous: ChaptersState, formData: FormData): Promise<ChaptersState> {
  const { supabase } = await requireStaff();
  const lessonId = String(formData.get("lessonId") ?? "");
  const { data: lesson } = await supabase.from("academy_lessons").select("duration_seconds").eq("id", lessonId).maybeSingle();
  if (!lesson) return { error: "This lesson no longer exists.", saved: false };

  const result = readChapters(
    formData.getAll("chapterTime").map(String),
    formData.getAll("chapterTitle").map(String),
    (lesson as { duration_seconds: number | null }).duration_seconds
  );
  if (result.error !== null) return { error: result.error, saved: false };

  const { error } = await supabase.rpc("staff_save_lesson_chapters", { target_lesson: lessonId, marks: result.marks });
  if (error) return { error: staffMessage(error, "The chapters could not be saved. Try again."), saved: false };

  refreshLessons(lessonId);
  return { error: null, saved: true };
}

export type PublishState = { error: string | null };

export async function setPublished(_previous: PublishState, formData: FormData): Promise<PublishState> {
  const { supabase } = await requireStaff();
  const lessonId = String(formData.get("lessonId") ?? "");
  const publish = formData.get("publish") === "true";
  const { error } = await supabase.rpc("staff_set_lesson_published", { target_lesson: lessonId, publish });
  if (error) return { error: staffMessage(error, publish ? "The lesson could not be published." : "The lesson could not be unpublished.") };

  refreshLessons(lessonId);
  return { error: null };
}

export async function deleteDraft(_previous: PublishState, formData: FormData): Promise<PublishState> {
  const { supabase } = await requireStaff();
  const lessonId = String(formData.get("lessonId") ?? "");
  // The video goes first: deleting the lesson would drop its row, and the
  // video would stay at Mux holding one of the free plan's slots.
  const { data: video } = await supabase.from("academy_videos").select("status").eq("lesson_id", lessonId).maybeSingle();
  if (video) {
    const { error: removeError } = await supabase.functions.invoke("academy-video", { body: { action: "remove", lessonId } });
    if (removeError) return { error: await edgeMessage(removeError, "The lesson's video could not be removed. Try again.") };
  }
  // Only drafts can go (202610050001): riders may have progress on a lesson
  // that was ever published, and it would go with it.
  const { data, error } = await supabase.from("academy_lessons").delete().eq("id", lessonId).is("published_at", null).select("id");
  if (error) return { error: staffMessage(error, "The draft could not be deleted.") };
  if (!data?.length) return { error: "Only a draft can be deleted. Unpublish the lesson first." };

  refreshLessons();
  redirect("/lessons");
}
