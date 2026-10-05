import { useCallback, useEffect, useRef, useState } from "react";
import type { EquinaBackend, PlanState } from "../../backend";
import { foundingPlan, lessonOpen } from "./plan-rules";

/**
 * The rider's plan: what it holds, which paid lessons they picked, and how
 * much of the Club it opens.
 *
 * Until the plan loads -- and in the demo, and if it cannot load -- the app
 * assumes the founding phase, where everything is open. That is safe because
 * the database enforces every limit itself: the worst a stale answer does is
 * show a lesson whose video then says it is part of a plan.
 */
export function usePlan({
  backend,
  enabled
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
}) {
  const [plan, setPlan] = useState<PlanState>(foundingPlan);
  const [loaded, setLoaded] = useState(false);
  const latestLoad = useRef(0);

  const refresh = useCallback(async () => {
    if (!backend || !enabled) return;
    const request = ++latestLoad.current;
    try {
      const next = await backend.plans.mine();
      if (request === latestLoad.current) setPlan(next);
    } catch {
      // Kept as it was: see above.
    } finally {
      if (request === latestLoad.current) setLoaded(true);
    }
  }, [backend, enabled]);

  useEffect(() => {
    if (!backend || !enabled) {
      latestLoad.current += 1;
      setPlan(foundingPlan);
      setLoaded(false);
      return;
    }
    void refresh();
  }, [backend, enabled, refresh]);

  /**
   * Spends one of the rider's picks on a paid lesson. Throws the backend's
   * `no_picks_left` when the plan is full; answers whether the lesson is open.
   */
  const pickLesson = useCallback(async (lessonId: string) => {
    if (!backend || !enabled) return true;
    const next = await backend.plans.pickLesson(lessonId);
    latestLoad.current += 1;
    setPlan(next);
    setLoaded(true);
    return lessonOpen(next, { id: lessonId, access: "paid" });
  }, [backend, enabled]);

  return { plan, loaded, refresh, pickLesson };
}
