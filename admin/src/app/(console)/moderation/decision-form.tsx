"use client";

import { useActionState } from "react";
import { decide, type DecisionState } from "./actions";

export function DecisionForm({
  contentType,
  contentId,
  restoreLabel
}: {
  contentType: "post" | "comment";
  contentId: string;
  restoreLabel: string;
}) {
  const [state, action, pending] = useActionState<DecisionState, FormData>(decide, { error: null });
  const noteId = `note-${contentId}`;
  return (
    <form action={action} className="form">
      <input type="hidden" name="contentType" value={contentType} />
      <input type="hidden" name="contentId" value={contentId} />
      <div className="field">
        <label className="label" htmlFor={noteId}>Note for the record (optional)</label>
        <input id={noteId} name="note" className="input" maxLength={1000} placeholder="Why you decided this" />
      </div>
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="actions">
        <button type="submit" name="decision" value="restore" className="button" disabled={pending}>{restoreLabel}</button>
        <button type="submit" name="decision" value="remove" className="button danger" disabled={pending}>Remove</button>
      </div>
    </form>
  );
}
