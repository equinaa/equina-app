import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import type {
  EquinaBackend,
  HorseRecord,
  HorseRecordFile,
  HorseTimelineRecord,
  UploadAsset
} from "../../backend";
import { horseToPromote, ownPrimary, selectionAfterLoad, withPrimary } from "./horse-selection";

export type HorseInput = {
  name: string;
  breed?: string;
  discipline?: HorseRecord["discipline"];
  birthDate?: string;
  sex?: HorseRecord["sex"];
  heightCm?: number;
  isPrimary?: boolean;
};

export type TimelineRecordInput = {
  recordType: HorseTimelineRecord["recordType"];
  status: HorseTimelineRecord["status"];
  title: string;
  occurredOn: string;
  dueOn?: string;
  providerName?: string;
  notes?: string;
  source: HorseTimelineRecord["source"];
  details: Record<string, unknown>;
};

const messageFor = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message.trim()) {
    if (/row-level security|permission|forbidden|not enabled/i.test(error.message)) {
      return "You do not have permission to make that change.";
    }
    if (/network|fetch|offline/i.test(error.message)) {
      return "Equina is offline. Reconnect and try again.";
    }
    return error.message;
  }
  return fallback;
};

export function useHorseRecords({
  backend,
  enabled,
  canManageHorse,
  canMutateRecords,
  userId,
  onPersist
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
  canManageHorse: boolean;
  canMutateRecords: boolean;
  /** The signed-in rider: only their own horses can become the main horse. */
  userId?: string;
  onPersist?: () => Promise<unknown> | void;
}) {
  const [horses, setHorses] = useState<HorseRecord[]>([]);
  const [selectedHorseId, setSelectedHorseIdState] = useState("");
  // The pick as of now, for code that runs after an await: a refresh that
  // started before a switch must not put the old horse back.
  const selectedRef = useRef("");
  const setSelectedHorseId = useCallback((horseId: string) => {
    selectedRef.current = horseId;
    setSelectedHorseIdState(horseId);
  }, []);
  // The primary horse as the server last confirmed it, and the picks being
  // saved, one at a time in tap order. A pick decided from the rendered list
  // could skip its save while an earlier pick was still on its way.
  const primaryRef = useRef("");
  const switchChain = useRef<Promise<unknown>>(Promise.resolve());
  const [records, setRecords] = useState<HorseTimelineRecord[]>([]);
  const [filesByRecord, setFilesByRecord] = useState<Record<string, HorseRecordFile[]>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // The horse list has been fetched (or failed), whether or not the selected
  // horse's timeline has arrived yet. Home needs only the horses: waiting for
  // `loaded` held the hero photo behind every record and file in the timeline.
  const [horsesLoaded, setHorsesLoaded] = useState(false);
  // The horse list actually arrived. A failed load also ends horsesLoaded, but
  // must not be read as "this rider has no horse".
  const [horsesListed, setHorsesListed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [offline, setOffline] = useState(false);
  const horsesRequest = useRef(0);
  const recordsRequest = useRef(0);

  const loadRecords = useCallback(async (horseId: string) => {
    if (!backend || !enabled || !horseId) {
      setRecords([]);
      setFilesByRecord({});
      return;
    }
    const request = ++recordsRequest.current;
    setError("");
    try {
      const nextRecords = await backend.records.timeline(horseId);
      if (request !== recordsRequest.current) return;
      setRecords(nextRecords);
      const fileEntries = await Promise.all(nextRecords.map(async (record) => {
        try {
          return [record.id, await backend.records.recordFiles(record.id)] as const;
        } catch {
          return [record.id, []] as const;
        }
      }));
      if (request === recordsRequest.current) {
        setFilesByRecord(Object.fromEntries(fileEntries));
      }
    } catch (loadError) {
      if (request === recordsRequest.current) {
        setRecords([]);
        setFilesByRecord({});
        setError(messageFor(loadError, "Horse records could not be loaded."));
      }
    }
  }, [backend, enabled]);

  /** Reloads the horses. `pick` selects a horse once a list that has it arrives. */
  const refresh = useCallback(async (pick?: string) => {
    if (!backend || !enabled) {
      setHorses([]);
      setSelectedHorseId("");
      setRecords([]);
      setFilesByRecord({});
      setLoading(false);
      setRefreshing(false);
      setLoaded(false);
      setHorsesLoaded(false);
      setHorsesListed(false);
      return;
    }
    const request = ++horsesRequest.current;
    if (horses.length === 0) setLoading(true);
    else setRefreshing(true);
    setError("");
    try {
      const nextHorses = await backend.records.listHorses();
      if (request !== horsesRequest.current) return;
      setHorses(nextHorses);
      primaryRef.current = ownPrimary(nextHorses, userId);
      const wanted = pick && nextHorses.some((horse) => horse.id === pick) ? pick : selectedRef.current;
      const nextSelected = selectionAfterLoad(nextHorses, wanted);
      setSelectedHorseId(nextSelected);
      setHorsesListed(true);
      setHorsesLoaded(true);
      await loadRecords(nextSelected);
    } catch (loadError) {
      if (request === horsesRequest.current) {
        setError(messageFor(loadError, "Horse profiles could not be loaded."));
      }
    } finally {
      if (request === horsesRequest.current) {
        setLoading(false);
        setRefreshing(false);
        setLoaded(true);
        setHorsesLoaded(true);
      }
    }
  }, [backend, enabled, horses.length, loadRecords, setSelectedHorseId, userId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      // Only no network at all; see useRideJournal for why reachability is not trusted.
      setOffline(state.isConnected === false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void refresh();
  }, [backend, enabled]);

  const selectHorse = useCallback((horseId: string) => {
    if (horseId === selectedRef.current) return;
    setSelectedHorseId(horseId);
    void loadRecords(horseId);
  }, [loadRecords, setSelectedHorseId]);

  const runMutation = useCallback(async <T,>(
    key: string,
    operation: () => Promise<T>,
    fallback: string
  ): Promise<T> => {
    if (offline) throw new Error("Equina is offline. Reconnect and try again.");
    setSaving(key);
    setError("");
    try {
      return await operation();
    } catch (mutationError) {
      const nextMessage = messageFor(mutationError, fallback);
      setError(nextMessage);
      throw new Error(nextMessage);
    } finally {
      setSaving("");
    }
  }, [offline]);

  /**
   * A new horse is the one the rider is about to work with, so it becomes the
   * picked horse, and with it the primary: Home shows the last horse picked.
   */
  const createHorse = useCallback(async (input: HorseInput, photo?: UploadAsset) => {
    if (!backend || !canManageHorse) throw new Error("Horse management is not enabled for this account.");
    return await runMutation("horse:create", async () => {
      const wantsPrimary = input.isPrimary ?? true;
      const firstHorse = !horses.some((horse) => !horse.archivedAt && (!userId || horse.ownerId === userId));
      // With a photo, the new horse becomes primary only once the photo is
      // in: a failed upload archives it, and making it primary first would
      // have already taken the flag off the rider's current horse.
      const created = await backend.records.createHorse({
        ...input,
        isPrimary: wantsPrimary && (!photo || firstHorse)
      });
      try {
        if (photo) await backend.records.uploadHorsePhoto(created.id, photo);
      } catch (uploadError) {
        await backend.records.archiveHorse(created.id).catch(() => undefined);
        throw uploadError;
      }
      // The horse exists from here on: nothing below may fail the add, or a
      // retry would create it twice. A promotion that fails leaves it as this
      // session's pick, and the next switch saves it.
      if (wantsPrimary && !created.isPrimary) {
        await backend.records.updateHorse(created.id, { isPrimary: true }).catch(() => undefined);
      }
      await refresh(created.id);
      await Promise.resolve(onPersist?.()).catch(() => undefined);
      return created;
    }, "Horse profile could not be created.");
  }, [backend, canManageHorse, horses, onPersist, refresh, runMutation, userId]);

  const updateHorse = useCallback(async (horseId: string, input: Partial<HorseInput>, photo?: UploadAsset) => {
    if (!backend || !canManageHorse) throw new Error("Horse management is not enabled for this account.");
    return await runMutation(`horse:${horseId}`, async () => {
      const updated = await backend.records.updateHorse(horseId, input);
      if (photo) await backend.records.uploadHorsePhoto(horseId, photo);
      await refresh();
      await onPersist?.();
      return updated;
    }, "Horse profile could not be updated.");
  }, [backend, canManageHorse, onPersist, refresh, runMutation]);

  const setPrimaryHorse = useCallback(async (horseId: string) => {
    await updateHorse(horseId, { isPrimary: true });
    setSelectedHorseId(horseId);
  }, [setSelectedHorseId, updateHorse]);

  /**
   * Picking a horse, anywhere: Home, the Stable, the ride setup. The screen
   * changes at once, and the pick is saved as the primary horse so it is
   * still the horse on the next launch. A pick that cannot be saved is taken
   * back, so the screen never shows a horse the account does not have.
   * Without horse management, or for a horse someone shared, the pick is for
   * this session only: only an owner can make a horse their main one.
   */
  const switchHorse = useCallback(async (horseId: string, options: { keepOnFailure?: boolean } = {}) => {
    const previous = selectedRef.current;
    if (!horseId || horseId === previous) return;
    selectHorse(horseId);
    const horse = horses.find((entry) => entry.id === horseId);
    if (!backend || !canManageHorse || !horse || horse.ownerId !== userId) return;
    // Saved after any pick still on its way, and only if no later pick has
    // replaced it, so the last horse picked is the last one written.
    const save = switchChain.current.catch(() => undefined).then(async () => {
      if (selectedRef.current !== horseId || primaryRef.current === horseId) return false;
      await runMutation(`horse:${horseId}`, async () => {
        await backend.records.updateHorse(horseId, { isPrimary: true });
      }, "That horse could not be kept as your main horse.");
      primaryRef.current = horseId;
      setHorses((current) => withPrimary(current, horseId));
      return true;
    });
    switchChain.current = save;
    let saved = false;
    try {
      saved = await save;
    } catch (switchError) {
      // Opened to look at (the Horse tab), it stays on screen; picked on
      // Home, a pick that was not kept is taken back.
      if (!options.keepOnFailure && selectedRef.current === horseId && previous) selectHorse(previous);
      throw switchError;
    }
    // The pick is saved. An account refresh that fails is only a stale
    // snapshot, never a reason to take the pick back.
    if (saved) await Promise.resolve(onPersist?.()).catch(() => undefined);
  }, [backend, canManageHorse, horses, onPersist, runMutation, selectHorse, userId]);

  const archiveHorse = useCallback(async (horseId: string) => {
    if (!backend || !canManageHorse) throw new Error("Horse management is not enabled for this account.");
    await runMutation(`horse:${horseId}`, async () => {
      const promote = horseToPromote(horses, horseId, selectedRef.current);
      await backend.records.archiveHorse(horseId);
      // The archive has happened; a promotion that fails leaves no primary
      // until the next pick, which saves one. The list reloads either way.
      if (promote) await backend.records.updateHorse(promote, { isPrimary: true }).catch(() => undefined);
      await refresh(promote ?? undefined);
      await Promise.resolve(onPersist?.()).catch(() => undefined);
    }, "Horse profile could not be archived.");
  }, [backend, canManageHorse, horses, onPersist, refresh, runMutation]);

  const createRecord = useCallback(async (input: TimelineRecordInput, asset?: UploadAsset) => {
    if (!backend || !canMutateRecords || !selectedHorseId) {
      throw new Error("Record editing is not enabled for this account.");
    }
    return await runMutation("record:create", async () => {
      const created = await backend.records.createRecord({
        ...input,
        horseId: selectedHorseId
      });
      try {
        if (asset) await backend.records.attachRecordFile(created.id, asset);
      } catch (uploadError) {
        await backend.records.deleteRecord(created.id).catch(() => undefined);
        throw uploadError;
      }
      await loadRecords(selectedHorseId);
      return created;
    }, "Horse record could not be saved.");
  }, [backend, canMutateRecords, loadRecords, runMutation, selectedHorseId]);

  const updateRecord = useCallback(async (
    recordId: string,
    patch: Partial<Pick<TimelineRecordInput, "status" | "title" | "occurredOn" | "dueOn" | "providerName" | "notes" | "source" | "details">>,
    asset?: UploadAsset
  ) => {
    if (!backend || !canMutateRecords || !selectedHorseId) {
      throw new Error("Record editing is not enabled for this account.");
    }
    return await runMutation(`record:${recordId}`, async () => {
      const updated = await backend.records.updateRecord(recordId, patch);
      if (asset) await backend.records.attachRecordFile(recordId, asset);
      await loadRecords(selectedHorseId);
      return updated;
    }, "Horse record could not be updated.");
  }, [backend, canMutateRecords, loadRecords, runMutation, selectedHorseId]);

  const deleteRecord = useCallback(async (recordId: string) => {
    if (!backend || !canMutateRecords || !selectedHorseId) {
      throw new Error("Record editing is not enabled for this account.");
    }
    await runMutation(`record:${recordId}`, async () => {
      await backend.records.deleteRecord(recordId);
      await loadRecords(selectedHorseId);
    }, "Horse record could not be removed.");
  }, [backend, canMutateRecords, loadRecords, runMutation, selectedHorseId]);

  const removeRecordFile = useCallback(async (recordId: string, fileId: string) => {
    if (!backend || !canMutateRecords || !selectedHorseId) {
      throw new Error("Record editing is not enabled for this account.");
    }
    await runMutation(`file:${fileId}`, async () => {
      await backend.records.removeRecordFile(fileId);
      await loadRecords(selectedHorseId);
    }, "Attachment could not be removed.");
  }, [backend, canMutateRecords, loadRecords, runMutation, selectedHorseId]);

  const selectedHorse = horses.find((horse) => horse.id === selectedHorseId) ?? null;

  return {
    horses,
    selectedHorse,
    selectedHorseId,
    records,
    filesByRecord,
    loading,
    loaded,
    horsesLoaded,
    horsesListed,
    refreshing,
    saving,
    error,
    offline,
    canManageHorse,
    canMutateRecords,
    clearError: () => setError(""),
    selectHorse,
    switchHorse,
    refresh,
    createHorse,
    updateHorse,
    setPrimaryHorse,
    archiveHorse,
    createRecord,
    updateRecord,
    deleteRecord,
    removeRecordFile
  };
}

export type HorseRecordsController = ReturnType<typeof useHorseRecords>;
