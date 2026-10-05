import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type Client = Awaited<ReturnType<typeof createClient>>;
export type StaffRole = "admin" | "moderator";

// Where a session stands on the way into the admin. Staff powers in the
// database need both the role and a verified second factor (202610050001), so
// the admin walks a staff member through the same two steps.
export type StaffState =
  | { kind: "signed-out" }
  | { kind: "not-staff"; email: string }
  | { kind: "needs-enrollment"; email: string }
  | { kind: "needs-code"; email: string; factorId: string }
  | { kind: "ready"; email: string; role: StaffRole };

export const staffState = async (supabase: Client): Promise<StaffState> => {
  // getClaims checks the session's signature rather than trusting the cookie.
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return { kind: "signed-out" };
  const email = typeof claims.email === "string" ? claims.email : "";

  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", claims.sub)
    .in("role", ["admin", "moderator"]);
  const held = (roles ?? []).map((row) => row.role as StaffRole);
  if (!held.length) return { kind: "not-staff", email };
  const role: StaffRole = held.includes("admin") ? "admin" : "moderator";

  if (claims.aal === "aal2") return { kind: "ready", email, role };

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const verified = factors?.totp[0];
  return verified
    ? { kind: "needs-code", email, factorId: verified.id }
    : { kind: "needs-enrollment", email };
};

// For every page and action behind the login: anything short of a staff
// session with its second factor is sent back to the step it is missing.
export const requireStaff = async () => {
  const supabase = await createClient();
  const state = await staffState(supabase);
  switch (state.kind) {
    case "ready":
      return { supabase, email: state.email, role: state.role };
    case "needs-enrollment":
    case "needs-code":
      redirect("/mfa");
    default:
      redirect("/login");
  }
};

// Database refusals, in words for staff. Messages raised by the staff
// functions (P0001, P0002) are already written for people and pass through.
export const staffMessage = (error: { code?: string; message: string }, fallback: string) => {
  if (error.code === "P0001" || error.code === "P0002") return error.message;
  if (error.code === "42501") return "Your session no longer has staff access. Sign in again.";
  return fallback;
};
