import { useCallback, useEffect, useRef, useState } from "react";
import { useVideoPlayer } from "expo-video";
import type { AcademyPlaybackLink } from "../../backend";
import { lessonVideoErrorMessage, type AcademyLessonView } from "./academy-catalog";

// Saving on every tick would be a write every half second. Fifteen seconds
// loses at most a few seconds of place if the app is killed mid-lesson.
const saveIntervalSeconds = 15;
// Crossing this mark while playing finishes the lesson. A jump past it is a
// seek, not watching, and does not count.
const finishedFraction = 0.95;
const playbackTickSeconds = 0.5;
// Resuming in the first few seconds or the last stretch only gets in the way.
const resumeWindowSeconds = { start: 5, end: 15 };

export type LessonVideoState =
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "error"; message: string; code?: string };

const codeOf = (cause: unknown) => {
  const code = cause && typeof cause === "object" ? (cause as { code?: unknown }).code : undefined;
  return typeof code === "string" ? code : undefined;
};

/**
 * One player for the lesson on screen.
 *
 * A live lesson plays from a signed link that expires after a few hours, so
 * the link is fetched when the lesson opens, and fetched again if the host
 * starts refusing it mid-lesson. The rider's place is saved as they watch and
 * restored when they come back.
 */
export function useLessonVideo({
  lesson,
  locked = false,
  previewSource,
  playbackLink,
  onProgress
}: {
  lesson: AcademyLessonView;
  /**
   * A paid lesson the rider's plan does not open yet. Nothing is fetched: the
   * server would refuse the link, and the page offers a pick instead. Opening
   * it (a pick) loads the video then.
   */
  locked?: boolean;
  /** The bundled clip every preview lesson plays. */
  previewSource: number;
  playbackLink: (lessonId: string) => Promise<AcademyPlaybackLink>;
  onProgress: (lessonId: string, positionSeconds: number, completed: boolean) => void;
}) {
  const player = useVideoPlayer(null, (created) => {
    created.loop = false;
    created.timeUpdateEventInterval = playbackTickSeconds;
  });
  const [state, setState] = useState<LessonVideoState>({ phase: "loading" });
  const [attempt, setAttempt] = useState(0);

  // Everything the listeners need without re-subscribing on every render.
  const lessonRef = useRef(lesson);
  lessonRef.current = lesson;
  const onProgressRef = useRef(onProgress);
  onProgressRef.current = onProgress;
  const position = useRef(0);
  const lastSaved = useRef(0);
  const finishedHere = useRef(false);
  const resumeAt = useRef<number | null>(null);
  const relinked = useRef(false);

  const live = lesson.video === "live";

  const save = useCallback((completed = false) => {
    const current = lessonRef.current;
    if (current.video !== "live") return;
    lastSaved.current = position.current;
    onProgressRef.current(current.id, position.current, completed);
  }, []);

  const load = useCallback(async (lessonId: string, keepPosition: boolean) => {
    const current = lessonRef.current;
    if (current.video === "preview") {
      player.muted = true;
      await player.replaceAsync(previewSource);
      return;
    }
    player.muted = false;
    const link = await playbackLink(lessonId);
    if (lessonRef.current.id !== lessonId) return;
    if (!keepPosition) {
      const saved = current.completed ? 0 : current.positionSeconds;
      const end = (current.durationSeconds ?? 0) - resumeWindowSeconds.end;
      resumeAt.current = saved > resumeWindowSeconds.start && saved < end ? saved : null;
    }
    await player.replaceAsync({
      uri: link.url,
      contentType: "hls",
      metadata: { title: current.title, artist: current.coach }
    });
  }, [playbackLink, player, previewSource]);

  // A new lesson: stop, remember where the last one was left, load this one.
  useEffect(() => {
    let cancelled = false;
    // Captured now: by the time this cleanup runs, lessonRef already holds
    // the next lesson, and the place belongs to this one.
    const openedId = lesson.id;
    const openedLive = lesson.video === "live";
    player.pause();
    position.current = 0;
    lastSaved.current = 0;
    finishedHere.current = false;
    relinked.current = false;
    resumeAt.current = null;
    setState({ phase: "loading" });
    if (locked) return () => undefined;
    load(lesson.id, false).catch((cause: unknown) => {
      if (!cancelled) setState({ phase: "error", message: lessonVideoErrorMessage(cause), code: codeOf(cause) });
    });
    return () => {
      cancelled = true;
      if (openedLive && position.current > 0 && position.current !== lastSaved.current) {
        onProgressRef.current(openedId, position.current, false);
      }
    };
  }, [attempt, lesson.id, lesson.video, load, locked, player]);

  useEffect(() => {
    const statusSubscription = player.addListener("statusChange", ({ status }) => {
      if (status === "readyToPlay") {
        if (resumeAt.current !== null) {
          player.currentTime = resumeAt.current;
          position.current = resumeAt.current;
          resumeAt.current = null;
        }
        setState((current) => (current.phase === "ready" ? current : { phase: "ready" }));
        return;
      }
      if (status !== "error") return;
      // An expired link is the likely cause after a long pause. Ask for a
      // fresh one once and carry on from the same place; a second failure
      // is real and is shown.
      if (lessonRef.current.video === "live" && !relinked.current) {
        relinked.current = true;
        resumeAt.current = position.current > 0 ? position.current : null;
        const lessonId = lessonRef.current.id;
        load(lessonId, true).catch((cause: unknown) => {
          if (lessonRef.current.id === lessonId) {
            setState({ phase: "error", message: lessonVideoErrorMessage(cause), code: codeOf(cause) });
          }
        });
        return;
      }
      setState({ phase: "error", message: lessonVideoErrorMessage(null) });
    });

    const timeSubscription = player.addListener("timeUpdate", ({ currentTime }) => {
      const previous = position.current;
      position.current = currentTime;
      const duration = player.duration || lessonRef.current.durationSeconds || 0;
      const playedThrough = currentTime - previous > 0 && currentTime - previous < playbackTickSeconds * 4;
      if (!finishedHere.current && duration > 0 && playedThrough && currentTime >= duration * finishedFraction) {
        finishedHere.current = true;
        save(true);
        return;
      }
      if (Math.abs(currentTime - lastSaved.current) >= saveIntervalSeconds) save();
    });

    const playingSubscription = player.addListener("playingChange", ({ isPlaying }) => {
      if (!isPlaying && position.current !== lastSaved.current) save();
    });

    return () => {
      statusSubscription.remove();
      timeSubscription.remove();
      playingSubscription.remove();
    };
  }, [load, player, save]);

  return {
    player,
    state,
    live,
    /** Where the rider is now, for "Complete lesson". */
    currentPosition: () => position.current,
    retry: () => setAttempt((value) => value + 1)
  };
}
