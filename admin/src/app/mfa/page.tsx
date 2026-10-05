import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { staffState } from "@/lib/staff";
import { createClient } from "@/lib/supabase/server";
import { CodeForm } from "./code-form";
import { EnrollPanel } from "./enroll-panel";

export const metadata: Metadata = { title: "Confirm it’s you" };

export default async function SecondFactorPage() {
  const state = await staffState(await createClient());
  if (state.kind === "ready") redirect("/");
  if (state.kind === "signed-out" || state.kind === "not-staff") redirect("/login");

  const enrolling = state.kind === "needs-enrollment";
  return (
    <main className="gate">
      <section className="gate-card" aria-labelledby="mfa-title">
        <header>
          <p className="wordmark">Equina <span>Admin</span></p>
          <h1 id="mfa-title">{enrolling ? "Set up your second step" : "Enter your code"}</h1>
          <p className="meta">Signed in as {state.email}.</p>
        </header>
        {enrolling ? (
          <EnrollPanel />
        ) : (
          <>
            <p className="meta">Open your authenticator app and enter the code for Equina Admin.</p>
            <CodeForm factorId={state.factorId} submitLabel="Continue" />
          </>
        )}
        <form action={signOut}>
          <button type="submit" className="button quiet">Sign out</button>
        </form>
      </section>
    </main>
  );
}
