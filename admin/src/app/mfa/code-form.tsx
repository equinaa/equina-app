"use client";

import { useActionState } from "react";
import { confirmCode, type CodeState } from "./actions";

const initial: CodeState = { error: null };

export function CodeForm({ factorId, submitLabel }: { factorId: string; submitLabel: string }) {
  const [state, action, pending] = useActionState(confirmCode, initial);
  return (
    <form action={action} className="form" noValidate>
      <input type="hidden" name="factorId" value={factorId} />
      <div className="field">
        <label className="label" htmlFor="code">6-digit code</label>
        <input
          id="code"
          name="code"
          className="input code-input"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={7}
          required
          autoFocus
          aria-invalid={state.error ? true : undefined}
          aria-describedby={state.error ? "code-error" : undefined}
        />
      </div>
      {state.error ? <p id="code-error" className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="button primary" disabled={pending}>
        {pending ? "Checking…" : submitLabel}
      </button>
    </form>
  );
}
