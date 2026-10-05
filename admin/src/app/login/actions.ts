"use server";

import { redirect } from "next/navigation";
import { staffState } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export type SignInState = { error: string | null; email: string };

export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Enter your email and password.", email };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.status === 429) return { error: "Too many attempts. Wait a minute, then try again.", email };
    if (error.code === "email_not_confirmed") return { error: "This email address has not been confirmed yet.", email };
    return { error: "That email and password do not match.", email };
  }

  // A rider account that signs in here gets no session out of it.
  const state = await staffState(supabase);
  if (state.kind === "not-staff" || state.kind === "signed-out") {
    await supabase.auth.signOut();
    return { error: "This account does not have staff access.", email };
  }
  redirect(state.kind === "ready" ? "/" : "/mfa");
}
