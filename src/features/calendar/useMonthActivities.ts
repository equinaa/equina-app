import { useCallback, useEffect, useRef, useState } from "react";
import type { EquinaBackend, RideEntry } from "../../backend";
import { activityDayOf, journalCoversMonth, monthSpan } from "../../domain/activity-calendar";

/**
 * The activities of one month of the calendar. The journal already holds
 * every ride since the start of last month; an older month is read on its
 * own, once, and read again after the journal changes (an activity just
 * added a month back can belong to one).
 */
export function useMonthActivities({
  backend,
  enabled,
  month,
  journal,
  journalSince
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
  /** "2026-11". */
  month: string;
  journal: readonly RideEntry[];
  journalSince: Date;
}) {
  const covered = journalCoversMonth(month, journalSince);
  const [read, setRead] = useState<Record<string, RideEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);

  // A changed journal makes every month read on its own stale.
  useEffect(() => {
    request.current += 1;
    setRead({});
  }, [journal]);

  const load = useCallback(async () => {
    if (!backend || !enabled || covered) return;
    const asked = ++request.current;
    setLoading(true);
    setError("");
    try {
      const span = monthSpan(month);
      const entries = await backend.rides.listStartedBetween(span.from, span.to);
      if (asked !== request.current) return;
      setRead((current) => ({ ...current, [month]: entries }));
    } catch (loadError) {
      if (asked !== request.current) return;
      setError(loadError instanceof Error && loadError.message ? loadError.message : "That month's activities could not be loaded.");
    } finally {
      if (asked === request.current) setLoading(false);
    }
  }, [backend, enabled, covered, month]);

  const known = covered || read[month] !== undefined;
  useEffect(() => {
    if (known) {
      setLoading(false);
      setError("");
      return;
    }
    void load();
  }, [known, load]);

  const entries = covered
    ? journal.filter((entry) => activityDayOf(entry)?.slice(0, 7) === month)
    : read[month] ?? [];

  return { entries, loading: !known && loading, error: known ? "" : error, retry: load };
}
