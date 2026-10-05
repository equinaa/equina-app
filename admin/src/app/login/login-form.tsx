"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "./actions";

const initial: SignInState = { error: null, email: "" };

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="form" noValidate>
      <div className="field">
        <label className="label" htmlFor="email">Email</label>
        <input
          id="email"
          name="email"
          type="email"
          className="input"
          autoComplete="username"
          defaultValue={state.email}
          required
          autoFocus
        />
      </div>
      <div className="field">
        <label className="label" htmlFor="password">Password</label>
        <input id="password" name="password" type="password" className="input" autoComplete="current-password" required />
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="button primary" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
