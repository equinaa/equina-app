"use client";

import { useActionState } from "react";
import { clubAccessLabel, clubAccessLevels, type PlanKey, type PlanTierFieldName } from "@/lib/plans";
import { updatePlanTier, type PlanTierFormState } from "./actions";

export function PlanTierForm({ planKey, values }: { planKey: PlanKey; values: Record<string, string> }) {
  const [state, action, pending] = useActionState<PlanTierFormState, FormData>(
    updatePlanTier,
    { errors: {}, formError: null, saved: false, values }
  );
  const value = (name: PlanTierFieldName) => state.values[name] ?? "";
  const id = (name: PlanTierFieldName) => `${planKey}-${name}`;
  const invalid = (name: PlanTierFieldName) => (state.errors[name] ? true : undefined);
  const describedBy = (name: PlanTierFieldName, hint?: boolean) =>
    [state.errors[name] ? `${id(name)}-error` : null, hint ? `${id(name)}-hint` : null].filter(Boolean).join(" ") || undefined;
  const error = (name: PlanTierFieldName) =>
    state.errors[name] ? <p id={`${id(name)}-error`} className="field-error">{state.errors[name]}</p> : null;

  return (
    <form action={action} className="form" noValidate>
      <input type="hidden" name="key" value={planKey} />

      <div className="field">
        <label className="label" htmlFor={id("name")}>Name riders see</label>
        <input id={id("name")} name="name" className="input" defaultValue={value("name")} maxLength={40}
          aria-invalid={invalid("name")} aria-describedby={describedBy("name")} required />
        {error("name")}
      </div>

      <div className="field">
        <label className="label" htmlFor={id("academyPicks")}>Paid lessons to pick</label>
        <input id={id("academyPicks")} name="academyPicks" className="input" defaultValue={value("academyPicks")}
          inputMode="numeric" placeholder="Every lesson"
          aria-invalid={invalid("academyPicks")} aria-describedby={describedBy("academyPicks", true)} />
        <p id={`${id("academyPicks")}-hint`} className="hint">Free lessons are open on every plan. Empty opens every paid lesson too.</p>
        {error("academyPicks")}
      </div>

      <div className="field">
        <label className="label" htmlFor={id("clubAccess")}>Club</label>
        <select id={id("clubAccess")} name="clubAccess" className="select" defaultValue={value("clubAccess")}
          aria-invalid={invalid("clubAccess")} aria-describedby={describedBy("clubAccess")}>
          {clubAccessLevels.map((level) => <option key={level} value={level}>{clubAccessLabel[level]}</option>)}
        </select>
        {error("clubAccess")}
      </div>

      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor={id("monthlyCredits")}>Ralf credits a month</label>
          <input id={id("monthlyCredits")} name="monthlyCredits" className="input" defaultValue={value("monthlyCredits")}
            inputMode="numeric" aria-invalid={invalid("monthlyCredits")} aria-describedby={describedBy("monthlyCredits", true)} />
          <p id={`${id("monthlyCredits")}-hint`} className="hint">A message costs 1, one with a photo 3.</p>
          {error("monthlyCredits")}
        </div>
        <div className="field">
          <label className="label" htmlFor={id("coachSessions")}>1-on-1 coach sessions</label>
          <input id={id("coachSessions")} name="coachSessions" className="input" defaultValue={value("coachSessions")}
            inputMode="numeric" aria-invalid={invalid("coachSessions")} aria-describedby={describedBy("coachSessions")} />
          {error("coachSessions")}
        </div>
        <div className="field">
          <label className="label" htmlFor={id("eventTickets")}>Annual event tickets</label>
          <input id={id("eventTickets")} name="eventTickets" className="input" defaultValue={value("eventTickets")}
            inputMode="numeric" aria-invalid={invalid("eventTickets")} aria-describedby={describedBy("eventTickets")} />
          {error("eventTickets")}
        </div>
        {planKey === "free" ? null : (
          <div className="field">
            <label className="label" htmlFor={id("trialDays")}>Free trial, in days</label>
            <input id={id("trialDays")} name="trialDays" className="input" defaultValue={value("trialDays")}
              inputMode="numeric" aria-invalid={invalid("trialDays")} aria-describedby={describedBy("trialDays", true)} />
            <p id={`${id("trialDays")}-hint`} className="hint">Shown in the app. The store’s own offer decides who gets one.</p>
            {error("trialDays")}
          </div>
        )}
      </div>

      {state.formError ? <p className="form-error" role="alert">{state.formError}</p> : null}
      <div className="actions">
        <button type="submit" className="button primary" disabled={pending}>{pending ? "Saving…" : "Save plan"}</button>
        {state.saved && !pending ? <span className="meta" role="status">Saved. Riders see it on their next visit.</span> : null}
      </div>
    </form>
  );
}
