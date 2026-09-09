import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import type {
  CoachConversationRecord,
  CoachMessageRecord,
  EquinaBackend
} from "../../backend";
import type { AccountMode } from "../account/account-types";
import type { CoachConversationContext, CoachDisplayMessage } from "./coach-types";

const demoStorageKey = "@equina/demo-ralf-conversation-v2";

export const clearDemoCoachHistory = async () => {
  await AsyncStorage.removeItem(demoStorageKey);
};

const toDisplay = (message: CoachMessageRecord): CoachDisplayMessage => ({
  id: message.id,
  role: message.role,
  text: message.body,
  clientNonce: message.clientNonce,
  status: message.status,
  basedOn: message.basedOn,
  confidence: message.confidence,
  safetyCategory: message.safetyCategory,
  createdAt: message.createdAt
});

const mergeMessages = (
  current: CoachDisplayMessage[],
  incoming: CoachDisplayMessage[]
) => {
  const map = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    const optimistic = current.find((entry) =>
      entry.clientNonce === message.clientNonce && entry.role === message.role
    );
    if (optimistic && optimistic.id !== message.id) map.delete(optimistic.id);
    map.set(message.id, message);
  }
  return [...map.values()].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt) || left.id.localeCompare(right.id)
  );
};

const demoReply = (message: string, context: CoachConversationContext) => {
  if (/\b(colic|lame|lameness|swollen|injury|pain|medication|fever|bleeding)\b/i.test(message)) {
    return {
      text: "Pause training and contact your veterinarian, especially if the change is sudden or getting worse. Note when it started, appetite, behavior, and visible swelling. I cannot diagnose or clear your horse to work.",
      safetyCategory: "health_escalation",
      status: "blocked" as const
    };
  }
  return {
    text: context.hasHorse
      ? `For ${context.horseName}'s ${context.focus.toLowerCase()} work, keep one clear question: establish a repeatable rhythm, change only one variable, and finish after the first easy repetition. Keep the session appropriate for the horse and rider in front of you.`
      : `For your ${context.focus.toLowerCase()} work, keep one clear question: establish a repeatable rhythm, change only one variable, and finish after the first easy repetition. Adapt the session to the horse you are riding that day.`,
    safetyCategory: "none",
    status: "complete" as const
  };
};

export function useCoachConversation({
  mode,
  backend,
  enabled,
  context
}: {
  mode: AccountMode;
  backend: EquinaBackend | null;
  enabled: boolean;
  context: CoachConversationContext;
}) {
  const [conversations, setConversations] = useState<CoachConversationRecord[]>([]);
  const [activeConversationId, setActiveConversationId] = useState("");
  const [messages, setMessages] = useState<CoachDisplayMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const messagesRef = useRef<CoachDisplayMessage[]>([]);
  messagesRef.current = messages;
  const activeConversation = useMemo(
    () => conversations.find((entry) => entry.id === activeConversationId),
    [activeConversationId, conversations]
  );
  const contextRef = useRef(context);
  contextRef.current = context;

  useEffect(() => {
    if (mode !== "demo") return;
    let active = true;
    void AsyncStorage.getItem(demoStorageKey).then((raw) => {
      if (!active || !raw) return;
      try {
        setMessages(JSON.parse(raw) as CoachDisplayMessage[]);
      } catch {
        void AsyncStorage.removeItem(demoStorageKey);
      }
    });
    return () => { active = false; };
  }, [mode]);

  const persistDemo = useCallback(async (next: CoachDisplayMessage[]) => {
    setMessages(next);
    await AsyncStorage.setItem(demoStorageKey, JSON.stringify(next));
  }, []);

  const loadConversation = useCallback(async (conversationId: string) => {
    if (!backend || mode !== "connected" || !enabled) return;
    setLoading(true);
    setError("");
    try {
      const next = await backend.coach.messages(conversationId);
      setMessages(next.map(toDisplay));
      setActiveConversationId(conversationId);
      setHistoryOpen(false);
    } catch {
      setError("Ralf history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [backend, enabled, mode]);

  const loadHistory = useCallback(async () => {
    if (!backend || mode !== "connected" || !enabled) return;
    setLoading(true);
    setError("");
    try {
      const next = await backend.coach.conversations();
      setConversations(next);
      if (!activeConversationId && next[0]) {
        await loadConversation(next[0].id);
      }
    } catch {
      setError("Ralf history could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [activeConversationId, backend, enabled, loadConversation, mode]);

  useEffect(() => {
    if (mode === "connected" && enabled) void loadHistory();
  }, [enabled, loadHistory, mode]);

  useEffect(() => {
    if (!backend || mode !== "connected" || !enabled || !activeConversationId) return;
    return backend.coach.subscribe(activeConversationId, (message) => {
      setMessages((current) => mergeMessages(current, [toDisplay(message)]));
    });
  }, [activeConversationId, backend, enabled, mode]);

  const send = useCallback(async (raw: string, reuseNonce?: string) => {
    const text = raw.trim();
    if (!text || sending) return false;
    const nonce = reuseNonce ?? Crypto.randomUUID();
    const now = new Date().toISOString();
    const optimistic: CoachDisplayMessage = {
      id: `pending-${nonce}`,
      role: "user",
      text,
      clientNonce: nonce,
      status: "pending",
      basedOn: [],
      safetyCategory: "none",
      createdAt: now
    };
    setSending(true);
    setError("");
    setMessages((current) => mergeMessages(current, [optimistic]));

    if (mode === "demo") {
      const reply = demoReply(text, contextRef.current);
      const assistant: CoachDisplayMessage = {
        id: `demo-ralf-${nonce}`,
        role: "assistant",
        text: reply.text,
        clientNonce: nonce,
        status: reply.status,
        basedOn: ["demo rider profile", "current question"],
        confidence: "low",
        safetyCategory: reply.safetyCategory,
        createdAt: new Date(Date.now() + 1).toISOString()
      };
      await persistDemo(mergeMessages(messagesRef.current, [
        { ...optimistic, status: "complete" },
        assistant
      ]));
      setSending(false);
      return true;
    }

    if (!backend || !enabled) {
      setMessages((current) => current.map((message) =>
        message.id === optimistic.id ? { ...message, status: "failed" } : message
      ));
      setError("Ralf is not connected for this account.");
      setSending(false);
      return false;
    }

    try {
      const result = await backend.coach.send({
        conversationId: activeConversationId || undefined,
        selectedHorseId: contextRef.current.selectedHorseId,
        message: text,
        clientNonce: nonce,
        context: {
          focus: contextRef.current.focus,
          load: contextRef.current.load,
          style: contextRef.current.style
        }
      });
      setActiveConversationId(result.conversation.id);
      setConversations((current) => {
        const without = current.filter((entry) => entry.id !== result.conversation.id);
        return [result.conversation, ...without];
      });
      setMessages((current) => mergeMessages(current, [
        toDisplay(result.userMessage),
        toDisplay(result.assistantMessage)
      ]));
      return true;
    } catch {
      setMessages((current) => current.map((message) =>
        message.clientNonce === nonce && message.role === "user"
          ? { ...message, status: "failed" }
          : message
      ));
      setError("Ralf could not answer safely right now. Retry when your connection is stable.");
      return false;
    } finally {
      setSending(false);
    }
  }, [activeConversationId, backend, enabled, mode, persistDemo, sending]);

  const retry = useCallback(async (message: CoachDisplayMessage) => {
    setMessages((current) => current.filter((entry) =>
      !(entry.clientNonce === message.clientNonce && entry.status === "failed")
    ));
    return await send(message.text, message.clientNonce);
  }, [send]);

  const startNew = useCallback(() => {
    if (mode === "demo") void persistDemo([]);
    setActiveConversationId("");
    setMessages([]);
    setHistoryOpen(false);
    setError("");
  }, [mode, persistDemo]);

  const updateContext = useCallback(async (next: CoachConversationContext) => {
    if (mode === "demo" || !activeConversation || !backend || !enabled) return;
    const updated = await backend.coach.updateConversation({
      id: activeConversation.id,
      title: activeConversation.title,
      selectedHorseId: next.selectedHorseId,
      focus: next.focus,
      load: next.load,
      style: next.style,
      archived: false
    });
    setConversations((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
  }, [activeConversation, backend, enabled, mode]);

  const rename = useCallback(async (title: string) => {
    const cleanTitle = title.trim().slice(0, 80);
    if (!cleanTitle || !activeConversation || !backend || mode !== "connected" || !enabled) return;
    const updated = await backend.coach.updateConversation({
      id: activeConversation.id,
      title: cleanTitle,
      selectedHorseId: activeConversation.selectedHorseId,
      focus: activeConversation.focus,
      load: activeConversation.load,
      style: activeConversation.style,
      archived: false
    });
    setConversations((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
  }, [activeConversation, backend, enabled, mode]);

  const archive = useCallback(async () => {
    if (mode === "demo") {
      await persistDemo([]);
      startNew();
      return;
    }
    if (!activeConversation || !backend || mode !== "connected" || !enabled) return;
    await backend.coach.updateConversation({
      id: activeConversation.id,
      title: activeConversation.title,
      selectedHorseId: activeConversation.selectedHorseId,
      focus: activeConversation.focus,
      load: activeConversation.load,
      style: activeConversation.style,
      archived: true
    });
    setConversations((current) => current.filter((entry) => entry.id !== activeConversation.id));
    startNew();
  }, [activeConversation, backend, enabled, mode, persistDemo, startNew]);

  const deleteConversation = useCallback(async () => {
    if (mode === "demo") {
      await persistDemo([]);
      startNew();
      return;
    }
    if (!activeConversation || !backend || !enabled) return;
    await backend.coach.deleteConversation(activeConversation.id);
    setConversations((current) => current.filter((entry) => entry.id !== activeConversation.id));
    startNew();
  }, [activeConversation, backend, enabled, mode, persistDemo, startNew]);

  const feedback = useCallback(async (messageId: string, useful: boolean) => {
    if (mode === "demo" || !backend || !enabled) return;
    await backend.coach.setFeedback(messageId, useful);
  }, [backend, enabled, mode]);

  return {
    connected: mode === "connected" && enabled,
    demo: mode === "demo",
    conversations,
    activeConversation,
    activeConversationId,
    messages,
    loading,
    sending,
    error,
    historyOpen,
    setHistoryOpen,
    loadHistory,
    loadConversation,
    send,
    retry,
    startNew,
    updateContext,
    rename,
    archive,
    deleteConversation,
    feedback
  };
}

export type CoachConversationController = ReturnType<typeof useCoachConversation>;
