"use server";

import { revalidatePath } from "next/cache";
import {
  planKeys,
  planTierFieldNames,
  readGrantForm,
  readPlanTierForm,
  type GrantErrors,
  type GrantFieldName,
  type PlanTierErrors,
  type PlanTierFieldName
} from "@/lib/plans";
import { requireStaff, staffMessage } from "@/lib/staff";

export type PlanTierFormState = {
  errors: PlanTierErrors;
  formError: string | null;
  saved: boolean;
  values: Record<string, string>;
};

export async function updatePlanTier(_previous: PlanTierFormState, formData: FormData): Promise<PlanTierFormState> {
  const { supabase } = await requireStaff();
  const values = Object.fromEntries(planTierFieldNames.map((name) => [name, String(formData.get(name) ?? "")]));
  const key = planKeys.find((candidate) => candidate === String(formData.get("key") ?? ""));
  if (!key) return { errors: {}, formError: "This plan no longer exists. Refresh the page.", saved: false, values };

  const { fields, errors } = readPlanTierForm(key, (name: PlanTierFieldName) => values[name] ?? "");
  if (!fields) return { errors, formError: "Check the highlighted fields.", saved: false, values };

  const { error } = await supabase.rpc("staff_update_plan_tier", {
    tier_key: key,
    name_input: fields.name,
    academy_picks_input: fields.academyPicks,
    club_access_input: fields.clubAccess,
    monthly_credits_input: fields.monthlyCredits,
    coach_sessions_input: fields.coachSessions,
    event_tickets_input: fields.eventTickets,
    trial_days_input: fields.trialDays
  });
  if (error) return { errors: {}, formError: staffMessage(error, "The plan could not be saved. Try again."), saved: false, values };

  revalidatePath("/plans");
  return { errors: {}, formError: null, saved: true, values };
}

export type GrantFormState = {
  errors: GrantErrors;
  formError: string | null;
  // Who was changed, and the plan the database says they now have -- which
  // can be higher than the one given, when they also bought one.
  result: { email: string; tier: string } | null;
  values: Record<string, string>;
};

const grantFieldNames: GrantFieldName[] = ["email", "tier", "until", "note"];

export async function setPlan(_previous: GrantFormState, formData: FormData): Promise<GrantFormState> {
  const { supabase } = await requireStaff();
  const values = Object.fromEntries(grantFieldNames.map((name) => [name, String(formData.get(name) ?? "")]));
  const { fields, errors } = readGrantForm((name) => values[name] ?? "", new Date());
  if (!fields) return { errors, formError: "Check the highlighted fields.", result: null, values };

  const { data, error } = await supabase.rpc("staff_set_plan", {
    target_email: fields.email,
    tier_input: fields.tier,
    ends_at_input: fields.endsAt,
    note_input: fields.note
  });
  if (error) return { errors: {}, formError: staffMessage(error, "The plan could not be saved. Try again."), result: null, values };

  revalidatePath("/plans");
  // A saved grant clears the form for the next rider.
  return {
    errors: {},
    formError: null,
    result: { email: fields.email, tier: typeof data === "string" ? data : fields.tier },
    values: { email: "", tier: "mid", until: "", note: "" }
  };
}
