import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type {
  EquinaBackend,
  MarketplaceMessage,
  MarketplaceReportReason,
  MarketplaceThread
} from "../../backend";
import type { AccountMode } from "../account/account-types";

const draftPrefix = "@equina/shop-draft-v1:";

export type ShopDisplayMessage = MarketplaceMessage & {
  clientStatus: "pending" | "complete" | "failed";
};

const asDisplay = (message: MarketplaceMessage): ShopDisplayMessage => ({
  ...message,
  clientStatus: "complete"
});

const mergeMessages = (
  current: ShopDisplayMessage[],
  incoming: ShopDisplayMessage[]
) => {
  const map = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const optimistic = current.find((entry) =>
      entry.clientNonce === message.clientNonce && entry.senderId === message.senderId
    );
    if (optimistic && optimistic.id !== message.id) map.delete(optimistic.id);
    map.set(message.id, message);
  }
  return [...map.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
  );
};

export async function clearShopDrafts(userId?: string) {
  const keys = await AsyncStorage.getAllKeys();
  const prefix = userId ? `${draftPrefix}${userId}:` : draftPrefix;
  const privateKeys = keys.filter((key) => key.startsWith(prefix));
  if (privateKeys.length) await AsyncStorage.multiRemove(privateKeys);
}

export function useShopConversation({
  mode,
  backend,
  enabled,
  userId
}: {
  mode: AccountMode;
  backend: EquinaBackend | null;
  enabled: boolean;
  userId?: string;
}) {
  const [threads, setThreads] = useState<MarketplaceThread[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<ShopDisplayMessage[]>([]);
  const [draft, setDraftState] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  const [sending, setSending] = useState(false);
  const [hasEarlier, setHasEarlier] = useState(false);
  const [error, setError] = useState("");
  const activeThread = useMemo(
    () => threads.find((thread) => thread.conversation.id === activeConversationId),
    [activeConversationId, threads]
  );
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const loadThreads = useCallback(async () => {
    if (!backend || mode !== "connected" || !enabled) {
      setThreads([]);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setThreads(await backend.marketplace.threads());
    } catch {
      setError("Messages could not be loaded. Check your connection and retry.");
    } finally {
      setLoading(false);
    }
  }, [backend, enabled, mode]);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  const draftKey = activeConversationId && userId
    ? `${draftPrefix}${userId}:${activeConversationId}`
    : "";

  useEffect(() => {
    let active = true;
    setDraftState("");
    if (!draftKey) return () => { active = false; };
    void AsyncStorage.getItem(draftKey).then((value) => {
      if (active) setDraftState(value ?? "");
    });
    return () => { active = false; };
  }, [draftKey]);

  const setDraft = useCallback((value: string) => {
    setDraftState(value);
    if (draftKey) {
      if (value) void AsyncStorage.setItem(draftKey, value);
      else void AsyncStorage.removeItem(draftKey);
    }
  }, [draftKey]);

  const loadMessages = useCallback(async (conversationId: string) => {
    if (!backend || mode !== "connected" || !enabled) return;
    setLoading(true);
    setError("");
    try {
      const next = await backend.marketplace.messages(conversationId);
      setMessages(next.map(asDisplay));
      setHasEarlier(next.length === 50);
      setActiveConversationId(conversationId);
      await backend.marketplace.markConversationRead(conversationId);
      setThreads((current) => current.map((thread) =>
        thread.conversation.id === conversationId ? { ...thread, unreadCount: 0 } : thread
      ));
    } catch {
      setError("This conversation could not be opened.");
    } finally {
      setLoading(false);
    }
  }, [backend, enabled, mode]);

  const openThread = useCallback(async (thread: MarketplaceThread) => {
    await loadMessages(thread.conversation.id);
  }, [loadMessages]);

  const openConversationId = useCallback(async (conversationId: string) => {
    if (!conversationId) return false;
    await loadThreads();
    await loadMessages(conversationId);
    return true;
  }, [loadMessages, loadThreads]);

  const openListing = useCallback(async (listingId: string) => {
    if (!backend || mode !== "connected" || !enabled) {
      setError("Messaging is not active for this account yet.");
      return false;
    }
    setLoading(true);
    setError("");
    try {
      const conversationId = await backend.marketplace.startConversation(listingId);
      const nextThreads = await backend.marketplace.threads();
      setThreads(nextThreads);
      await loadMessages(conversationId);
      return true;
    } catch {
      setError("A conversation could not be opened for this listing.");
      return false;
    } finally {
      setLoading(false);
    }
  }, [backend, enabled, loadMessages, mode]);

  const loadEarlier = useCallback(async () => {
    const before = messagesRef.current[0]?.createdAt;
    if (!before || !activeConversationId || !backend || loadingEarlier) return;
    setLoadingEarlier(true);
    try {
      const earlier = await backend.marketplace.messages(activeConversationId, before);
      setMessages((current) => mergeMessages(earlier.map(asDisplay), current));
      setHasEarlier(earlier.length === 50);
    } catch {
      setError("Earlier messages could not be loaded.");
    } finally {
      setLoadingEarlier(false);
    }
  }, [activeConversationId, backend, loadingEarlier]);

  useEffect(() => {
    if (!backend || mode !== "connected" || !enabled || !activeConversationId) return;
    return backend.marketplace.subscribeToConversation(activeConversationId, (message) => {
      setMessages((current) => mergeMessages(current, [asDisplay(message)]));
      if (message.senderId !== userId) {
        void backend.marketplace.markConversationRead(activeConversationId).catch(() => undefined);
      }
      void loadThreads();
    });
  }, [activeConversationId, backend, enabled, loadThreads, mode, userId]);

  const send = useCallback(async (raw: string, reuseNonce?: string) => {
    const body = raw.trim();
    if (!body || !activeConversationId || !backend || !userId || sending || !enabled) return false;
    const clientNonce = reuseNonce ?? Crypto.randomUUID();
    const optimistic: ShopDisplayMessage = {
      id: `pending-${clientNonce}`,
      conversationId: activeConversationId,
      senderId: userId,
      clientNonce,
      body,
      deliveryStatus: "sent",
      createdAt: new Date().toISOString(),
      clientStatus: "pending"
    };
    setSending(true);
    setError("");
    setMessages((current) => mergeMessages(current, [optimistic]));
    try {
      const saved = await backend.marketplace.sendMessage(activeConversationId, body, clientNonce);
      setMessages((current) => mergeMessages(current, [asDisplay(saved)]));
      setDraft("");
      await loadThreads();
      return true;
    } catch {
      setMessages((current) => current.map((message) =>
        message.clientNonce === clientNonce && message.senderId === userId
          ? { ...message, clientStatus: "failed" }
          : message
      ));
      setError("Message not sent. Your draft is safe; retry when connected.");
      return false;
    } finally {
      setSending(false);
    }
  }, [activeConversationId, backend, enabled, loadThreads, sending, setDraft, userId]);

  const retry = useCallback(async (message: ShopDisplayMessage) => {
    setMessages((current) => current.filter((entry) =>
      !(entry.clientNonce === message.clientNonce && entry.clientStatus === "failed")
    ));
    return await send(message.body, message.clientNonce);
  }, [send]);

  const archive = useCallback(async () => {
    if (!backend || !activeConversationId) return;
    await backend.marketplace.archiveConversation(activeConversationId);
    setThreads((current) => current.filter((thread) =>
      thread.conversation.id !== activeConversationId
    ));
    setActiveConversationId("");
    setMessages([]);
  }, [activeConversationId, backend]);

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!backend) return;
    await backend.marketplace.deleteMessage(messageId);
    setMessages((current) => current.filter((message) => message.id !== messageId));
  }, [backend]);

  const report = useCallback(async (input: {
    reason: MarketplaceReportReason;
    messageId?: string;
    userId?: string;
    listingId?: string;
  }) => {
    if (!backend) return;
    await backend.marketplace.report(input);
  }, [backend]);

  const block = useCallback(async (blockedUserId: string) => {
    if (!backend) return;
    await backend.club.block(blockedUserId);
    setActiveConversationId("");
    setMessages([]);
    await loadThreads();
  }, [backend, loadThreads]);

  const close = useCallback(() => {
    setActiveConversationId("");
    setMessages([]);
    setError("");
  }, []);

  return {
    connected: mode === "connected" && enabled,
    threads,
    unreadCount: threads.reduce((sum, thread) => sum + thread.unreadCount, 0),
    activeThread,
    activeConversationId,
    messages,
    draft,
    loading,
    loadingEarlier,
    sending,
    hasEarlier,
    error,
    setDraft,
    loadThreads,
    openThread,
    openConversationId,
    openListing,
    loadEarlier,
    send,
    retry,
    archive,
    deleteMessage,
    report,
    block,
    close
  };
}

export type ShopConversationController = ReturnType<typeof useShopConversation>;
