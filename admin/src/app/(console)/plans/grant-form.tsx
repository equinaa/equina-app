"use client";

import { useActionState } from "react";
import type { GrantFieldName } from "@/lib/plans";
import { setPlan, type GrantFormState } from "./actions";

export function GrantForm({ names }: { names: Record<string, string> }) {
  const [state, action, pending] = useActionState<GrantFormState, FormData>(
    setPlan,
    { errors: {}, formError: null, result: null, values: { email: "", tier: "mid", until: "", note: "" } }
  );
  const value = (name: GrantFieldName) => state.values[name] ?? "";
  const invalid = (name: GrantFieldName) => (state.errors[name] ? true : undefined);
  const describedBy = (name: GrantFieldName, hint?: boolean) =>
    [state.errors[name] ? `grant-${name}-error` : null, hint ? `grant-${name}-hint` : null].filter(Boolean).join(" ") || undefined;
  const error = (name: GrantFieldName) =>
    state.errors[name] ? <p id={`grant-${name}-error`} className="field-error">{state.errors[name]}</p> : null;
  const nameOf = (key: string) => names[key] ?? key;

  return (
    <form action={action} className="form" noValidate>
      <div className="field">
        <label className="label" htmlFor="grant-email">Rider’s email</label>
        <input id="grant-email" name="email" type="email" className="input" defaultValue={value("email")} autoComplete="off"
          aria-invalid={invalid("email")} aria-describedby={describedBy("email", true)} required />
        <p id="grant-email-hint" className="hint">The email they sign in to Equina with.</p>
        {error("email")}
      </div>

      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor="grant-tier">Plan</label>
          <select id="grant-tier" name="tier" className="select" defaultValue={value("tier")}
            aria-invalid={invalid("tier")} aria-describedby={describedBy("tier", true)}>
            <option value="mid">{nameOf("mid")}</option>
            <option value="premium">{nameOf("premium")}</option>
            <option value="free">{nameOf("free")} (remove the plan staff gave)</option>
          </select>
          <p id="grant-tier-hint" className="hint">A plan bought in the store is the store’s to end.</p>
          {error("tier")}
        </div>
        <div className="field">
          <label className="label" htmlFor="grant-until">Until</label>
          <input id="grant-until" name="until" type="date" className="input" defaultValue={value("until")}
            aria-invalid={invalid("until")} aria-describedby={describedBy("until", true)} />
          <p id="grant-until-hint" className="hint">Through the end of that day. Empty: no end date.</p>
          {error("until")}
        </div>
      </div>

      <div className="field">
        <label className="label" htmlFor="grant-note">Note for the record (optional)</label>
        <input id="grant-note" name="note" className="input" defaultValue={value("note")} maxLength={500}
          placeholder="Beta tester, founding coach…" aria-invalid={invalid("note")} aria-describedby={describedBy("note")} />
        {error("note")}
      </div>

      {state.formError ? <p className="form-error" role="alert">{state.formError}</p> : null}
      <div className="actions">
        <button type="submit" className="button primary" disabled={pending}>{pending ? "Saving…" : "Save"}</button>
        {state.result && !pending ? (
          <span className="meta" role="status">{state.result.email} is now on {nameOf(state.result.tier)}.</span>
        ) : null}
      </div>
    </form>
  );
}
