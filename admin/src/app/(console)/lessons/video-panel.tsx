"use client";

import { createUpload, type UpChunk } from "@mux/upchunk";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { VideoStatus } from "@/lib/lessons";
import { removeVideo, startVideoUpload } from "./video-actions";

type Video = { status: VideoStatus; failureReason: string | null } | null;

// What this tab is doing, on top of what the server says about the video.
type Local =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "sending"; percent: number }
  | { phase: "sent" }
  | { phase: "removing" };

const statusText = (video: Video, sentFromHere: boolean) => {
  if (!video) return "No video yet.";
  switch (video.status) {
    case "uploading":
      return sentFromHere
        ? "Upload finished. Mux is picking up the file."
        : "An upload was started but the file never arrived. Upload it again.";
    case "processing":
      return "Mux is preparing the video for riders. This usually takes a minute or two; the page updates by itself.";
    case "ready":
      return "Ready to watch.";
    case "failed":
      return `The video could not be processed${video.failureReason ? `: ${video.failureReason}` : "."} Upload it again.`;
  }
};

export function VideoPanel({ lessonId, published, video }: { lessonId: string; published: boolean; video: Video }) {
  const router = useRouter();
  const [local, setLocal] = useState<Local>({ phase: "idle" });
  const [error, setError] = useState<string | null>(null);
  const upload = useRef<UpChunk | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // While Mux works on the file, ask the server again every few seconds; the
  // webhook moves the video along and the page follows.
  const waiting = local.phase === "sent" || video?.status === "processing";
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setInterval(() => router.refresh(), 4000);
    return () => window.clearInterval(timer);
  }, [waiting, router]);

  // Once the server reports the outcome, this tab has nothing left to track.
  useEffect(() => {
    if (local.phase === "sent" && (video?.status === "ready" || video?.status === "failed")) setLocal({ phase: "idle" });
  }, [local.phase, video?.status]);

  // Leaving mid-upload abandons the file.
  useEffect(() => {
    if (local.phase !== "sending") return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [local.phase]);

  useEffect(() => () => upload.current?.abort(), []);

  const send = async (file: File) => {
    setError(null);
    setLocal({ phase: "starting" });
    const started = await startVideoUpload(lessonId);
    if (started.error !== null) {
      setError(started.error);
      setLocal({ phase: "idle" });
      return;
    }
    const chunked = createUpload({ endpoint: started.uploadUrl, file });
    upload.current = chunked;
    setLocal({ phase: "sending", percent: 0 });
    chunked.on("progress", (event) => setLocal({ phase: "sending", percent: Math.floor(Number(event.detail) || 0) }));
    chunked.on("success", () => {
      upload.current = null;
      setLocal({ phase: "sent" });
      router.refresh();
    });
    chunked.on("error", (event) => {
      upload.current = null;
      const detail = (event.detail as { message?: unknown } | undefined)?.message;
      setError(typeof detail === "string" && detail ? `The upload stopped: ${detail}` : "The upload stopped. Try again.");
      setLocal({ phase: "idle" });
    });
  };

  const remove = async () => {
    if (!window.confirm("Remove this lesson's video? It is deleted at Mux too.")) return;
    setError(null);
    setLocal({ phase: "removing" });
    const result = await removeVideo(lessonId);
    if (result.error) setError(result.error);
    setLocal({ phase: "idle" });
    router.refresh();
  };

  const busy = local.phase !== "idle" && local.phase !== "sent";
  return (
    <div className="form">
      {local.phase === "sending" ? (
        <div className="field">
          <span className="meta" role="status">Uploading… {local.percent}%</span>
          <progress className="progress" max={100} value={local.percent} aria-label="Upload progress" />
          <p className="hint">Keep this page open until the upload finishes.</p>
        </div>
      ) : (
        <p className="meta" role="status">{local.phase === "starting" ? "Preparing the upload…" : statusText(video, local.phase === "sent")}</p>
      )}

      {error ? <p className="form-error" role="alert">{error}</p> : null}

      {published ? (
        <p className="hint">Unpublish the lesson to replace its video.</p>
      ) : (
        <div className="actions">
          <input
            ref={picker}
            type="file"
            accept="video/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void send(file);
            }}
          />
          <button type="button" className={video ? "button" : "button primary"} disabled={busy} onClick={() => picker.current?.click()}>
            {video ? "Replace video" : "Upload video"}
          </button>
          {video && local.phase === "idle" ? (
            <button type="button" className="button quiet" onClick={() => void remove()}>Remove video</button>
          ) : null}
        </div>
      )}
    </div>
  );
}
