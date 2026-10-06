"use client";

import { useActionState } from "react";
import { inviteNoteLimit, type InviteFieldName } from "@/lib/beta";
import { inviteRider, type InviteFormState } from "./actions";

export function InviteForm() {
  const [state, action, pending] = useActionState<InviteFormState, FormData>(
    inviteRider,
    { errors: {}, formError: null, invited: null, values: { email: "", note: "" } }
  );
  const value = (name: InviteFieldName) => state.values[name] ?? "";
  const invalid = (name: InviteFieldName) => (state.errors[name] ? true : undefined);
  const describedBy = (name: InviteFieldName, hint?: boolean) =>
    [state.errors[name] ? `invite-${name}-error` : null, hint ? `invite-${name}-hint` : null].filter(Boolean).join(" ") || undefined;
  const error = (name: InviteFieldName) =>
    state.errors[name] ? <p id={`invite-${name}-error`} className="field-error">{state.errors[name]}</p> : null;

  return (
    <form action={action} className="form" noValidate>
      <div className="field">
        <label className="label" htmlFor="invite-email">Email</label>
        <input id="invite-email" name="email" type="email" className="input" defaultValue={value("email")} autoComplete="off"
          aria-invalid={invalid("email")} aria-describedby={describedBy("email", true)} required />
        <p id="invite-email-hint" className="hint">
          The address they sign up with. It counts once they confirm it; Sign in with Apple can hide it behind a relay address.
        </p>
        {error("email")}
      </div>

      <div className="field">
        <label className="label" htmlFor="invite-note">Note for staff (optional)</label>
        <input id="invite-note" name="note" className="input" defaultValue={value("note")} maxLength={inviteNoteLimit}
          placeholder="Coach, TestFlight cohort, friend of Equina…" aria-invalid={invalid("note")} aria-describedby={describedBy("note")} />
        {error("note")}
      </div>

      {state.formError ? <p className="form-error" role="alert">{state.formError}</p> : null}
      <div className="actions">
        <button type="submit" className="button primary" disabled={pending}>{pending ? "Inviting…" : "Invite"}</button>
        {state.invited && !pending ? (
          <span className="meta" role="status">{state.invited} is invited. Nobody is emailed: tell them yourself.</span>
        ) : null}
      </div>
    </form>
  );
}
