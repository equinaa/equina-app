import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { staffState } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage() {
  const state = await staffState(await createClient());
  if (state.kind === "ready") redirect("/");
  if (state.kind === "needs-code" || state.kind === "needs-enrollment") redirect("/mfa");

  return (
    <main className="gate">
      <section className="gate-card" aria-labelledby="sign-in-title">
        <header>
          <p className="wordmark">Equina <span>Admin</span></p>
          <h1 id="sign-in-title">Sign in</h1>
          <p className="meta">For Equina staff. You will confirm a code from your authenticator app next.</p>
        </header>
        {state.kind === "not-staff" ? (
          <div className="form">
            <p className="form-error" role="alert">
              {state.email || "This account"} does not have staff access.
            </p>
            <form action={signOut}>
              <button type="submit" className="button">Use another account</button>
            </form>
          </div>
        ) : (
          <LoginForm />
        )}
      </section>
    </main>
  );
}
