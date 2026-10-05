"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { edgeMessage } from "@/lib/edge";
import { requireStaff } from "@/lib/staff";

export type VideoUploadStart = { uploadUrl: string; error: null } | { uploadUrl: null; error: string };

// Opens a direct upload to Mux for a draft lesson. The file then goes from
// the browser straight to Mux; the edge function only hands out the address.
export async function startVideoUpload(lessonId: string): Promise<VideoUploadStart> {
  const { supabase } = await requireStaff();
  // Mux accepts the file only from the page that asked for the upload.
  const origin = (await headers()).get("origin");
  const { data, error } = await supabase.functions.invoke<{ uploadUrl?: string }>("academy-video", {
    body: { action: "upload", lessonId, origin }
  });
  if (error || !data?.uploadUrl) {
    return { uploadUrl: null, error: await edgeMessage(error, "The upload could not start. Try again in a moment.") };
  }
  revalidatePath(`/lessons/${lessonId}`);
  return { uploadUrl: data.uploadUrl, error: null };
}

export async function removeVideo(lessonId: string): Promise<{ error: string | null }> {
  const { supabase } = await requireStaff();
  const { error } = await supabase.functions.invoke("academy-video", { body: { action: "remove", lessonId } });
  if (error) return { error: await edgeMessage(error, "The video could not be removed. Try again in a moment.") };
  revalidatePath("/", "layout");
  return { error: null };
}
