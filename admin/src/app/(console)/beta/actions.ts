"use server";

import { revalidatePath } from "next/cache";
import { normalizeEmail, readDoorForm, readInviteForm, type InviteErrors, type InviteFieldName } from "@/lib/beta";
import { requireStaff, staffMessage } from "@/lib/staff";

export type InviteFormState = {
  errors: InviteErrors;
  formError: string | null;
  // The email as the database stored it, which is the one that will match.
  invited: string | null;
  values: Record<string, string>;
};

const inviteFieldNames: InviteFieldName[] = ["email", "note"];

export async function inviteRider(_previous: InviteFormState, formData: FormData): Promise<InviteFormState> {
  const { supabase } = await requireStaff();
  const values = Object.fromEntries(inviteFieldNames.map((name) => [name, String(formData.get(name) ?? "")]));
  const { fields, errors } = readInviteForm((name) => values[name] ?? "");
  if (!fields) return { errors, formError: "Check the highlighted fields.", invited: null, values };

  const { data, error } = await supabase.rpc("staff_invite_beta", { p_email: fields.email, p_note: fields.note });
  if (error) return { errors: {}, formError: staffMessage(error, "The invite could not be saved. Try again."), invited: null, values };

  revalidatePath("/beta");
  // A saved invite clears the form for the next rider.
  return {
    errors: {},
    formError: null,
    invited: typeof data === "string" ? data : fields.email,
    values: { email: "", note: "" }
  };
}

export type InviteChangeState = { error: string | null };

// Revoke an invite, or invite the same email again, from its row.
export async function changeInvite(_previous: InviteChangeState, formData: FormData): Promise<InviteChangeState> {
  const { supabase } = await requireStaff();
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const decision = String(formData.get("decision") ?? "");
  if (!email) return { error: "This invite no longer exists. Refresh the page." };

  const { error } = decision === "revoke"
    ? await supabase.rpc("staff_revoke_beta", { p_email: email })
    : decision === "reinvite"
      ? await supabase.rpc("staff_invite_beta", { p_email: email, p_note: null })
      : { error: { message: "Choose to revoke or invite again.", code: "22023" } };
  if (error) return { error: staffMessage(error, "The invite could not be changed. Try again.") };

  revalidatePath("/beta");
  return { error: null };
}

export type DoorFormState = { error: string | null };

export async function setDoor(_previous: DoorFormState, formData: FormData): Promise<DoorFormState> {
  const { supabase } = await requireStaff();
  const { open, error: formError } = readDoorForm((name) => String(formData.get(name) ?? ""));
  if (open === null) return { error: formError };

  const { error } = await supabase.rpc("staff_set_public_access", { p_open: open });
  if (error) return { error: staffMessage(error, "The door could not be changed. Try again.") };

  revalidatePath("/beta");
  return { error: null };
}
