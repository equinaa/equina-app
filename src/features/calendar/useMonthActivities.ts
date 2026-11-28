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
  journalSince,
  journalLoading,
  journalError,
  onRetryJournal
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
  /** "2026-11". */
  month: string;
  journal: readonly RideEntry[];
  journalSince: Date;
  /** The journal's first read is on its way: a month it covers is not known yet. */
  journalLoading: boolean;
  /** The journal could not be read: a month it covers is not known either. */
  journalError: string;
  onRetryJournal: () => void;
}) {
  const covered = journalCoversMonth(month, journalSince);
  const [read, setRead] = useState<Record<string, RideEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const request = useRef(0);
  // Bumped with the journal, so a month read on its own is read again.
  const [version, setVersion] = useState(0);

  // A changed journal makes every month read on its own stale; a read still
  // on its way belongs to the old journal and is dropped, so nothing waits on it.
  useEffect(() => {
    request.current += 1;
    setRead({});
    setLoading(false);
    setVersion((current) => current + 1);
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
  }, [known, load, version]);

  const entries = covered
    ? journal.filter((entry) => activityDayOf(entry)?.slice(0, 7) === month)
    : read[month] ?? [];

  if (covered) {
    // The journal's own state: "nothing logged" only once it has been read.
    return { entries, loading: journalLoading, error: journalLoading ? "" : journalError, retry: async () => onRetryJournal() };
  }
  return { entries, loading: !known && loading, error: known ? "" : error, retry: load };
}
