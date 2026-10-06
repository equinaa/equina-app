"use client";

import { useActionState } from "react";
import { changeInvite, type InviteChangeState } from "./actions";

// Revoke, or invite again, from the invite's row. Neither deletes anything:
// a revoked rider keeps their account and waits at the door.
export function InviteActions({ email, revoked }: { email: string; revoked: boolean }) {
  const [state, action, pending] = useActionState<InviteChangeState, FormData>(changeInvite, { error: null });
  return (
    <form action={action} className="row-actions">
      <input type="hidden" name="email" value={email} />
      {revoked ? (
        <button type="submit" name="decision" value="reinvite" className="button" disabled={pending}
          aria-label={`Invite ${email} again`}>
          Invite again
        </button>
      ) : (
        <button type="submit" name="decision" value="revoke" className="button quiet" disabled={pending}
          aria-label={`Revoke the invite for ${email}`}>
          Revoke
        </button>
      )}
      {state.error ? <p className="field-error" role="alert">{state.error}</p> : null}
    </form>
  );
}
