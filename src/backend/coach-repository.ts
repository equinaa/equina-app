import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type {
  CoachConversationRecord,
  CoachMessageRecord,
  CoachSendResult
} from "./contracts";
import { EdgeClient } from "./edge-client";
import { backendError, requireData } from "./errors";

type Row = Record<string, unknown>;

const optionalString = (value: unknown) =>
  typeof value === "string" && value.length > 0 ? value : undefined;

const mapConversation = (row: Row): CoachConversationRecord => ({
  id: String(row.id),
  userId: String(row.user_id),
  selectedHorseId: optionalString(row.selected_horse_id),
  title: String(row.title),
  focus: String(row.context_focus),
  load: String(row.context_load),
  style: String(row.response_style),
  archivedAt: optionalString(row.archived_at),
  createdAt: String(row.created_at),
  updatedAt: String(row.updated_at)
});

const mapMessage = (row: Row): CoachMessageRecord => ({
  id: String(row.id),
  conversationId: String(row.conversation_id),
  role: row.role as CoachMessageRecord["role"],
  body: String(row.body),
  clientNonce: String(row.client_nonce),
  status: row.status as CoachMessageRecord["status"],
  basedOn: Array.isArray(row.based_on) ? row.based_on.map(String) : [],
  confidence: optionalString(row.confidence) as CoachMessageRecord["confidence"],
  safetyCategory: row.safety_category as CoachMessageRecord["safetyCategory"],
  publicMetadata: row.public_metadata && typeof row.public_metadata === "object"
    ? row.public_metadata as Record<string, unknown>
    : {},
  createdAt: String(row.created_at)
});

export class CoachRepository {
  private readonly edge: EdgeClient;

  constructor(private readonly client: SupabaseClient) {
    this.edge = new EdgeClient(client);
  }

  async conversations(includeArchived = false): Promise<CoachConversationRecord[]> {
    let query = this.client.from("coach_conversations").select("*").order("updated_at", { ascending: false });
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw backendError(error, "Ralf history could not be loaded.");
    return (data ?? []).map((row) => mapConversation(row as Row));
  }

  async createConversation(input: {
    selectedHorseId?: string;
    focus: string;
    load: string;
    style: string;
  }): Promise<CoachConversationRecord> {
    const { data, error } = await this.client.rpc("create_coach_conversation", {
      target_horse_id: input.selectedHorseId ?? null,
      focus_input: input.focus,
      load_input: input.load,
      style_input: input.style
    });
    return mapConversation(requireData(data as Row | null, error, "Ralf conversation could not be created."));
  }

  async updateConversation(input: {
    id: string;
    title: string;
    selectedHorseId?: string;
    focus: string;
    load: string;
    style: string;
    archived: boolean;
  }): Promise<CoachConversationRecord> {
    const { data, error } = await this.client.rpc("update_coach_conversation", {
      target_conversation_id: input.id,
      title_input: input.title,
      target_horse_id: input.selectedHorseId ?? null,
      focus_input: input.focus,
      load_input: input.load,
      style_input: input.style,
      archive_input: input.archived
    });
    return mapConversation(requireData(data as Row | null, error, "Ralf conversation could not be updated."));
  }

  async deleteConversation(id: string): Promise<void> {
    const { data, error } = await this.client.rpc("delete_coach_conversation", {
      target_conversation_id: id
    });
    if (error || data !== true) throw backendError(error, "Ralf conversation could not be deleted.");
  }

  async clearHistory(): Promise<number> {
    const { data, error } = await this.client.rpc("delete_my_coach_history");
    if (error) throw backendError(error, "Ralf history could not be deleted.");
    return Number(data ?? 0);
  }

  async messages(conversationId: string, before?: string): Promise<CoachMessageRecord[]> {
    let query = this.client.from("coach_messages").select("*")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(50);
    if (before) query = query.lt("created_at", before);
    const { data, error } = await query;
    if (error) throw backendError(error, "Ralf messages could not be loaded.");
    return (data ?? []).reverse().map((row) => mapMessage(row as Row));
  }

  async send(input: {
    conversationId?: string;
    selectedHorseId?: string;
    message: string;
    clientNonce: string;
    context: { focus: string; load: string; style: string };
  }): Promise<CoachSendResult> {
    const response = await this.edge.invoke<{
      conversation: Row;
      userMessage: Row;
      assistantMessage: Row;
      idempotent: boolean;
    }>("coach-chat", {
      conversationId: input.conversationId,
      selectedHorseId: input.selectedHorseId,
      message: input.message,
      clientNonce: input.clientNonce,
      context: input.context
    });
    return {
      conversation: mapConversation(response.conversation),
      userMessage: mapMessage(response.userMessage),
      assistantMessage: mapMessage(response.assistantMessage),
      idempotent: response.idempotent
    };
  }

  async setFeedback(messageId: string, useful: boolean, reason?: string): Promise<void> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication is required."), "Authentication is required.");
    const { error } = await this.client.from("coach_message_feedback").upsert({
      user_id: auth.user.id,
      message_id: messageId,
      useful,
      reason: reason?.trim() || null
    }, { onConflict: "user_id,message_id" });
    if (error) throw backendError(error, "Feedback could not be saved.");
  }

  subscribe(conversationId: string, onMessage: (message: CoachMessageRecord) => void): () => void {
    const channel: RealtimeChannel = this.client.channel(`coach:${conversationId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "coach_messages", filter: `conversation_id=eq.${conversationId}` },
      (payload) => onMessage(mapMessage(payload.new as Row))
    ).subscribe();
    return () => { void this.client.removeChannel(channel); };
  }
}
