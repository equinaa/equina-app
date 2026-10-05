"use client";

import { useState, useTransition } from "react";
import { startEnrollment, type Enrollment } from "./actions";
import { CodeForm } from "./code-form";

export function EnrollPanel() {
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [pending, startTransition] = useTransition();

  if (enrollment?.factorId) {
    return (
      <div className="form">
        <p className="meta">
          Scan this with an authenticator app (1Password, Google Authenticator, Authy), then enter the code it shows.
        </p>
        {/* A data: URI from Supabase; next/image would only re-encode it. */}
        <img className="qr" src={enrollment.qrCode} alt="QR code for your authenticator app" />
        <details>
          <summary className="meta">Can’t scan it? Enter this key instead</summary>
          <p className="secret">{enrollment.secret}</p>
        </details>
        <CodeForm factorId={enrollment.factorId} submitLabel="Turn on and continue" />
      </div>
    );
  }

  return (
    <div className="form">
      <p className="meta">
        Staff accounts need a second step at every sign-in: a code from an authenticator app on your phone.
        Set it up once now.
      </p>
      {enrollment?.error ? <p className="form-error" role="alert">{enrollment.error}</p> : null}
      <button
        type="button"
        className="button primary"
        disabled={pending}
        onClick={() => startTransition(async () => setEnrollment(await startEnrollment()))}
      >
        {pending ? "Preparing…" : "Set up authenticator"}
      </button>
    </div>
  );
}
