"use client";

import { useActionState } from "react";
import { capitalized, lessonCategories, lessonDisciplines, lessonLevels, type LessonFieldName } from "@/lib/lessons";
import { createLesson, updateLesson, type LessonFormState } from "./actions";

type Props =
  | { mode: "create"; values: Record<string, string> }
  | { mode: "edit"; lessonId: string; values: Record<string, string>; videoLength?: string | null };

export function LessonForm(props: Props) {
  const [state, action, pending] = useActionState<LessonFormState, FormData>(
    props.mode === "create" ? createLesson : updateLesson,
    { errors: {}, formError: null, saved: false, values: props.values }
  );
  const value = (name: string) => state.values[name] ?? "";
  const invalid = (name: LessonFieldName) => (state.errors[name] ? true : undefined);
  const describedBy = (name: LessonFieldName, hint?: boolean) =>
    [state.errors[name] ? `${name}-error` : null, hint ? `${name}-hint` : null].filter(Boolean).join(" ") || undefined;
  const error = (name: LessonFieldName) =>
    state.errors[name] ? <p id={`${name}-error`} className="field-error">{state.errors[name]}</p> : null;
  // Once the video is ready its length is the lesson's, set by Mux. It is read
  // from the page rather than the form's state, so it shows up as soon as the
  // page refreshes, without resetting what staff are typing elsewhere.
  const videoLength = props.mode === "edit" ? props.videoLength ?? null : null;

  return (
    <form action={action} className="form" noValidate>
      {props.mode === "edit" ? <input type="hidden" name="lessonId" value={props.lessonId} /> : null}

      <div className="field">
        <label className="label" htmlFor="title">Title</label>
        <input id="title" name="title" className="input" defaultValue={value("title")} maxLength={120}
          aria-invalid={invalid("title")} aria-describedby={describedBy("title")} required />
        {error("title")}
      </div>

      <div className="field">
        <label className="label" htmlFor="summary">Summary</label>
        <textarea id="summary" name="summary" className="textarea" defaultValue={value("summary")} maxLength={500}
          aria-invalid={invalid("summary")} aria-describedby={describedBy("summary", true)} required />
        <p id="summary-hint" className="hint">Shown under the title in the app. One or two sentences.</p>
        {error("summary")}
      </div>

      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor="category">Filed under</label>
          <select id="category" name="category" className="select" defaultValue={value("category") || lessonCategories[0]}
            aria-invalid={invalid("category")} aria-describedby={describedBy("category")}>
            {lessonCategories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
          {error("category")}
        </div>
        <div className="field">
          <label className="label" htmlFor="discipline">Discipline</label>
          <select id="discipline" name="discipline" className="select" defaultValue={value("discipline")}
            aria-invalid={invalid("discipline")} aria-describedby={describedBy("discipline")}>
            <option value="">Every discipline</option>
            {lessonDisciplines.map((discipline) => <option key={discipline} value={discipline}>{capitalized(discipline)}</option>)}
          </select>
          {error("discipline")}
        </div>
        <div className="field">
          <label className="label" htmlFor="level">Level</label>
          <select id="level" name="level" className="select" defaultValue={value("level")}
            aria-invalid={invalid("level")} aria-describedby={describedBy("level")}>
            <option value="">Every level</option>
            {lessonLevels.map((level) => <option key={level} value={level}>{capitalized(level)}</option>)}
          </select>
          {error("level")}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor="duration">Length</label>
          {videoLength !== null ? (
            <input key="video-length" id="duration" name="duration" className="input" value={videoLength} readOnly
              aria-describedby="duration-hint" />
          ) : (
            <input key="typed-length" id="duration" name="duration" className="input" defaultValue={value("duration")} placeholder="14:30"
              inputMode="numeric" aria-invalid={invalid("duration")} aria-describedby={describedBy("duration", true)} />
          )}
          <p id="duration-hint" className="hint">
            {videoLength !== null ? "Taken from the video." : "Minutes and seconds. Filled in from the video once it is ready."}
          </p>
          {error("duration")}
        </div>
        <div className="field">
          <label className="label" htmlFor="access">Access</label>
          <select id="access" name="access" className="select" defaultValue={value("access") || "paid"}
            aria-invalid={invalid("access")} aria-describedby={describedBy("access", true)}>
            <option value="paid">Paid</option>
            <option value="free">Free</option>
          </select>
          <p id="access-hint" className="hint">Recorded now; every signed-in rider watches both until Plus launches.</p>
          {error("access")}
        </div>
        <div className="field">
          <label className="label" htmlFor="position">Order</label>
          <input id="position" name="position" className="input" defaultValue={value("position") || "0"} inputMode="numeric"
            aria-invalid={invalid("position")} aria-describedby={describedBy("position", true)} />
          <p id="position-hint" className="hint">Lower comes first within its topic.</p>
          {error("position")}
        </div>
      </div>

      <div className="field-row">
        <div className="field">
          <label className="label" htmlFor="coachName">Coach</label>
          <input id="coachName" name="coachName" className="input" defaultValue={value("coachName")} maxLength={120}
            aria-invalid={invalid("coachName")} aria-describedby={describedBy("coachName", true)} />
          <p id="coachName-hint" className="hint">A real person who taught it. Empty shows “Equina Academy”.</p>
          {error("coachName")}
        </div>
        <div className="field">
          <label className="label" htmlFor="coachTitle">Coach’s title</label>
          <input id="coachTitle" name="coachTitle" className="input" defaultValue={value("coachTitle")} maxLength={120}
            placeholder="FEI dressage trainer" aria-invalid={invalid("coachTitle")} aria-describedby={describedBy("coachTitle")} />
          {error("coachTitle")}
        </div>
      </div>

      {state.formError ? <p className="form-error" role="alert">{state.formError}</p> : null}
      <div className="actions">
        <button type="submit" className="button primary" disabled={pending}>
          {pending ? "Saving…" : props.mode === "create" ? "Create draft" : "Save changes"}
        </button>
        {state.saved && !pending ? <span className="meta" role="status">Saved.</span> : null}
      </div>
    </form>
  );
}
