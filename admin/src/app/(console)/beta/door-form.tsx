"use client";

import { useActionState, useState } from "react";
import { doorConfirmation, type DoorDecision } from "@/lib/beta";
import { setDoor, type DoorFormState } from "./actions";

// Opening Equina to everyone is the launch. It takes a ticked box before the
// button does anything, and so does closing it again.
export function DoorForm({ decision }: { decision: DoorDecision }) {
  const [state, action, pending] = useActionState<DoorFormState, FormData>(setDoor, { error: null });
  const [confirmed, setConfirmed] = useState(false);
  const confirmId = `door-${decision}-confirm`;

  return (
    <form action={action} className="form">
      <input type="hidden" name="decision" value={decision} />
      <label className="check" htmlFor={confirmId}>
        <input id={confirmId} name="confirm" type="checkbox" value="yes" checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)} />
        <span>{doorConfirmation[decision]}</span>
      </label>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="actions">
        <button type="submit" className={decision === "open" ? "button primary" : "button danger"} disabled={!confirmed || pending}>
          {pending ? "Saving…" : decision === "open" ? "Open Equina to everyone" : "Close to invited riders"}
        </button>
      </div>
    </form>
  );
}
