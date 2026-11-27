/**
 * The reply text out of a provider response, for the three shapes Ralf's
 * provider can speak: Anthropic Messages, OpenAI Responses, and Chat
 * Completions.
 *
 * A reply can arrive split into several text parts. The parts are pieces of
 * one continuous text, so they are joined with nothing between them, the way
 * both providers' own SDKs do. Joining with a line break put a break inside a
 * word ("Condição seg" / "ura para parar") whenever a split fell mid-word.
 */

const textParts = (parts: unknown[]): string[] =>
  parts.flatMap((part) =>
    part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string"
      ? [(part as { text: string }).text]
      : []
  );

export const providerReplyText = (payload: Record<string, unknown>): string => {
  // Anthropic: { content: [{ type: "text", text }] }
  const anthropicText = Array.isArray(payload.content) ? textParts(payload.content).join("") : "";
  if (anthropicText) return anthropicText;

  // OpenAI Responses: a ready-made output_text, or output[].content[].text
  if (typeof payload.output_text === "string") return payload.output_text;
  if (Array.isArray(payload.output)) {
    return payload.output.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      return Array.isArray(content) ? textParts(content) : [];
    }).join("");
  }

  // Chat Completions: choices[0].message.content
  const first = Array.isArray(payload.choices) ? payload.choices[0] : undefined;
  const content = first && typeof first === "object"
    ? (first as { message?: { content?: unknown } }).message?.content
    : undefined;
  return typeof content === "string" ? content : "";
};
