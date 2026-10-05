"use client";

import { startTransition, useActionState } from "react";
import { deleteDraft, setPublished, type PublishState } from "./actions";

const idle: PublishState = { error: null };

export function PublishButton({ lessonId, published, blocked }: { lessonId: string; published: boolean; blocked: boolean }) {
  const [state, action, pending] = useActionState(setPublished, idle);
  return (
    <form action={action} className="form">
      <input type="hidden" name="lessonId" value={lessonId} />
      <input type="hidden" name="publish" value={published ? "false" : "true"} />
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" className={published ? "button" : "button primary"} disabled={pending || (!published && blocked)}>
        {published ? (pending ? "Unpublishing…" : "Unpublish") : pending ? "Publishing…" : "Publish to riders"}
      </button>
    </form>
  );
}

export function DeleteDraftButton({ lessonId, title }: { lessonId: string; title: string }) {
  const [state, action, pending] = useActionState(deleteDraft, idle);
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!window.confirm(`Delete the draft “${title}”? This cannot be undone.`)) return;
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="lessonId" value={lessonId} />
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <button type="submit" className="button danger" disabled={pending}>{pending ? "Deleting…" : "Delete draft"}</button>
    </form>
  );
}
