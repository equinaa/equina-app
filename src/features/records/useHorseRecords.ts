import { useCallback, useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import type {
  EquinaBackend,
  HorseRecord,
  HorseRecordFile,
  HorseTimelineRecord,
  UploadAsset
} from "../../backend";

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
  onPersist
}: {
  backend: EquinaBackend | null;
  enabled: boolean;
  canManageHorse: boolean;
  canMutateRecords: boolean;
  onPersist?: () => Promise<unknown> | void;
}) {
  const [horses, setHorses] = useState<HorseRecord[]>([]);
  const [selectedHorseId, setSelectedHorseId] = useState("");
  const [records, setRecords] = useState<HorseTimelineRecord[]>([]);
  const [filesByRecord, setFilesByRecord] = useState<Record<string, HorseRecordFile[]>>({});
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
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

  const refresh = useCallback(async () => {
    if (!backend || !enabled) {
      setHorses([]);
      setSelectedHorseId("");
      setRecords([]);
      setFilesByRecord({});
      setLoading(false);
      setRefreshing(false);
      setLoaded(false);
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
      const nextSelected = nextHorses.some((horse) => horse.id === selectedHorseId)
        ? selectedHorseId
        : nextHorses.find((horse) => horse.isPrimary)?.id ?? nextHorses[0]?.id ?? "";
      setSelectedHorseId(nextSelected);
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
      }
    }
  }, [backend, enabled, horses.length, loadRecords, selectedHorseId]);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setOffline(state.isConnected === false || state.isInternetReachable === false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    void refresh();
  }, [backend, enabled]);

  const selectHorse = useCallback((horseId: string) => {
    if (horseId === selectedHorseId) return;
    setSelectedHorseId(horseId);
    void loadRecords(horseId);
  }, [loadRecords, selectedHorseId]);

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

  const createHorse = useCallback(async (input: HorseInput, photo?: UploadAsset) => {
    if (!backend || !canManageHorse) throw new Error("Horse management is not enabled for this account.");
    return await runMutation("horse:create", async () => {
      const created = await backend.records.createHorse({
        ...input,
        isPrimary: input.isPrimary ?? horses.length === 0
      });
      try {
        if (photo) await backend.records.uploadHorsePhoto(created.id, photo);
      } catch (uploadError) {
        await backend.records.archiveHorse(created.id).catch(() => undefined);
        throw uploadError;
      }
      await refresh();
      await onPersist?.();
      return created;
    }, "Horse profile could not be created.");
  }, [backend, canManageHorse, horses.length, onPersist, refresh, runMutation]);

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
  }, [updateHorse]);

  const archiveHorse = useCallback(async (horseId: string) => {
    if (!backend || !canManageHorse) throw new Error("Horse management is not enabled for this account.");
    await runMutation(`horse:${horseId}`, async () => {
      await backend.records.archiveHorse(horseId);
      await refresh();
      await onPersist?.();
    }, "Horse profile could not be archived.");
  }, [backend, canManageHorse, onPersist, refresh, runMutation]);

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
    refreshing,
    saving,
    error,
    offline,
    canManageHorse,
    canMutateRecords,
    clearError: () => setError(""),
    selectHorse,
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
