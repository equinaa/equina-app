"use server";

import { revalidatePath } from "next/cache";
import { requireStaff, staffMessage } from "@/lib/staff";

export type DecisionState = { error: string | null };

export async function decide(_previous: DecisionState, formData: FormData): Promise<DecisionState> {
  const { supabase } = await requireStaff();
  const contentType = String(formData.get("contentType") ?? "");
  const contentId = String(formData.get("contentId") ?? "");
  const decision = String(formData.get("decision") ?? "");
  const note = String(formData.get("note") ?? "").trim();
  if (note.length > 1000) return { error: "Keep the note under 1000 characters." };

  const { error } = await supabase.rpc("staff_moderate_content", {
    content_type: contentType,
    content_id: contentId,
    decision,
    note: note || null
  });
  if (error) return { error: staffMessage(error, "The decision could not be saved. Try again.") };

  revalidatePath("/", "layout");
  return { error: null };
}
