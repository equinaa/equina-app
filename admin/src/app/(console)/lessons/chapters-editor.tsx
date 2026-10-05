"use client";

import { startTransition, useActionState, useState } from "react";
import { saveChapters, type ChaptersState } from "./actions";

type Row = { key: number; time: string; title: string };

export function ChaptersEditor({ lessonId, chapters }: { lessonId: string; chapters: Array<{ time: string; title: string }> }) {
  const [state, action, pending] = useActionState<ChaptersState, FormData>(saveChapters, { error: null, saved: false });
  const [rows, setRows] = useState<Row[]>(() =>
    (chapters.length ? chapters : [{ time: "0:00", title: "" }]).map((chapter, key) => ({ key, ...chapter }))
  );
  const [nextKey, setNextKey] = useState(rows.length);

  const change = (key: number, patch: Partial<Row>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const add = () => {
    setRows((current) => [...current, { key: nextKey, time: "", title: "" }]);
    setNextKey((key) => key + 1);
  };
  const remove = (key: number) => setRows((current) => current.filter((row) => row.key !== key));

  // Submitted by hand rather than through the form's action prop: React
  // resets a form after an action runs, and these rows are the editor's state.
  return (
    <form
      className="form"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        startTransition(() => action(data));
      }}
    >
      <input type="hidden" name="lessonId" value={lessonId} />
      <p className="hint">When each chapter starts (m:ss) and what it covers. Riders jump to it from the lesson.</p>
      {rows.map((row, index) => (
        <div key={row.key} className="chapter-row">
          <input
            name="chapterTime"
            className="input"
            value={row.time}
            placeholder="4:20"
            inputMode="numeric"
            aria-label={`Chapter ${index + 1} starts at`}
            onChange={(event) => change(row.key, { time: event.target.value })}
          />
          <input
            name="chapterTitle"
            className="input"
            value={row.title}
            maxLength={120}
            aria-label={`Chapter ${index + 1} title`}
            onChange={(event) => change(row.key, { title: event.target.value })}
          />
          <button type="button" className="button quiet" onClick={() => remove(row.key)} aria-label={`Remove chapter ${index + 1}`}>
            Remove
          </button>
        </div>
      ))}
      {state.error ? <p className="form-error" role="alert">{state.error}</p> : null}
      <div className="actions">
        <button type="button" className="button" onClick={add} disabled={rows.length >= 60}>Add chapter</button>
        <button type="submit" className="button primary" disabled={pending}>{pending ? "Saving…" : "Save chapters"}</button>
        {state.saved && !pending ? <span className="meta" role="status">Saved.</span> : null}
      </div>
    </form>
  );
}
