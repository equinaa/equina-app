import { useCallback, useEffect, useRef, useState } from "react";
import type { AcademyLesson, AcademyPlaybackLink, AcademyProgress, EquinaBackend } from "../../backend";
import { networkUnreachable } from "../../backend/errors";

/**
 * The live Academy: the published catalogue and this rider's progress.
 *
 * Lessons are rows, so a lesson Ilinca publishes appears on the next load,
 * with no release. The catalogue can be empty, and that is a normal state:
 * the Academy then opens on Ralf rather than on lessons that do not exist.
 */
export function useAcademy({
  backend,
  enabled
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
}) {
  const [lessons, setLessons] = useState<AcademyLesson[]>([]);
  const [progress, setProgress] = useState<Record<string, AcademyProgress>>({});
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  // Progress writes sit behind the academy_progress flag. A rider without it
  // still watches; their place is kept for this session only, and the app
  // stops asking a server that has already said no.
  const progressSaving = useRef(true);
  const latestLoad = useRef(0);
  // Read synchronously by recordProgress, which must know whether a lesson
  // was already finished before deciding what to save.
  const progressRef = useRef(progress);
  const replaceProgress = (next: Record<string, AcademyProgress>) => {
    progressRef.current = next;
    setProgress(next);
  };

  const load = useCallback(async () => {
    if (!backend || !enabled) return;
    const request = ++latestLoad.current;
    try {
      const [catalogue, mine] = await Promise.all([backend.academy.lessons(), backend.academy.progress()]);
      if (request !== latestLoad.current) return;
      setLessons(catalogue);
      replaceProgress(Object.fromEntries(mine.map((entry) => [entry.lessonId, entry])));
      setError("");
    } catch {
      if (request === latestLoad.current) setError("Lessons could not be loaded.");
    } finally {
      if (request === latestLoad.current) setLoaded(true);
    }
  }, [backend, enabled]);

  useEffect(() => {
    if (!backend || !enabled) {
      latestLoad.current += 1;
      setLessons([]);
      replaceProgress({});
      setLoaded(false);
      setError("");
      progressSaving.current = true;
      return;
    }
    void load();
  }, [backend, enabled, load]);

  const recordProgress = useCallback(async (lessonId: string, positionSeconds: number, completed = false) => {
    if (!backend || !enabled) return;
    const now = new Date().toISOString();
    const previous = progressRef.current[lessonId];
    // Finishing is permanent: rewatching the opening minute of a finished
    // lesson moves the bookmark, not the achievement.
    const finished = completed || Boolean(previous?.completedAt);
    replaceProgress({
      ...progressRef.current,
      [lessonId]: {
        lessonId,
        positionSeconds: Math.max(0, Math.round(positionSeconds)),
        completedAt: finished ? previous?.completedAt ?? now : undefined,
        lastSeenAt: now
      }
    });
    if (!progressSaving.current) return;
    try {
      await backend.academy.record(lessonId, positionSeconds, finished);
    } catch (cause) {
      const code = (cause as { code?: unknown } | null)?.code;
      // Offline is temporary and the next save carries the newer position.
      // Anything else is a refusal, and asking again will not change it.
      if (code !== networkUnreachable) progressSaving.current = false;
    }
  }, [backend, enabled]);

  const playbackLink = useCallback(async (lessonId: string): Promise<AcademyPlaybackLink> => {
    if (!backend || !enabled) throw new Error("Sign in to watch lessons.");
    return backend.academy.playback(lessonId);
  }, [backend, enabled]);

  return {
    lessons,
    progress,
    loaded,
    error,
    refresh: load,
    recordProgress,
    playbackLink
  };
}

export type AcademyController = ReturnType<typeof useAcademy>;
