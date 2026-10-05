"use server";

import { redirect } from "next/navigation";
import { staffState } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";

export type Enrollment =
  | { factorId: string; qrCode: string; secret: string; error: null }
  | { factorId: null; qrCode: null; secret: null; error: string };

// Starts a new authenticator for a staff account that has none. An earlier
// attempt left unfinished is cleared first, or Supabase refuses a second
// factor with the same name.
export async function startEnrollment(): Promise<Enrollment> {
  const failed = (error: string): Enrollment => ({ factorId: null, qrCode: null, secret: null, error });
  const supabase = await createClient();
  const state = await staffState(supabase);
  if (state.kind !== "needs-enrollment") return failed("Refresh the page and start again.");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  for (const factor of factors?.all ?? []) {
    if (factor.factor_type === "totp" && factor.status === "unverified") {
      await supabase.auth.mfa.unenroll({ factorId: factor.id });
    }
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: "Equina Admin",
    issuer: "Equina Admin"
  });
  if (error || !data) return failed("The authenticator could not be set up. Try again in a moment.");
  return { factorId: data.id, qrCode: svgDataUri(data.totp.qr_code), secret: data.totp.secret, error: null };
}

// supabase-js hands the QR code over as `data:image/svg+xml;utf-8,<svg…>`
// with the markup unescaped, so a `#` in a colour would end the URI early.
// Encode the markup so the image survives whatever the SVG contains.
const svgDataUri = (qrCode: string) => {
  const markup = qrCode.replace(/^data:image\/svg\+xml;[^,]*,/, "");
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
};

export type CodeState = { error: string | null };

export async function confirmCode(_previous: CodeState, formData: FormData): Promise<CodeState> {
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { error: "Enter the 6-digit code from your authenticator app." };

  const supabase = await createClient();
  const state = await staffState(supabase);
  if (state.kind === "ready") redirect("/");
  if (state.kind !== "needs-code" && state.kind !== "needs-enrollment") redirect("/login");
  if (state.kind === "needs-code" && factorId !== state.factorId) return { error: "Refresh the page and try again." };

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    if (error.status === 429) return { error: "Too many attempts. Wait a minute, then try again." };
    return { error: "That code did not match. Codes change every 30 seconds; use the current one." };
  }
  redirect("/");
}
