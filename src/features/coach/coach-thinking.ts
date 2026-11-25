import type { CoachDisplayMessage } from "./coach-types";

type Shown = Pick<CoachDisplayMessage, "id" | "role" | "status" | "clientNonce">;

/**
 * Whether Ralf's "Thinking" row shows: a question is on its way and nothing has
 * answered it yet. The row stands in for the "Sending..." line under that
 * question, so it shows exactly while that line would.
 */
export const ralfIsThinking = (messages: readonly Shown[], sending: boolean): boolean => {
  if (!sending) return false;
  const last = messages[messages.length - 1];
  return last !== undefined && last.role === "user" && last.status === "pending";
};

/**
 * One key per message, the same for the copy shown while it is sent and the
 * copy the server returns (they have different ids, the same nonce).
 */
export const coachMessageKey = (message: Shown): string =>
  `${message.role}:${message.clientNonce || message.id}`;

/**
 * Whether an answer arrives now, and so fades in, instead of having been in the
 * conversation when it opened. `shown` holds the keys already on screen, and is
 * null while a conversation loads: nothing that loads with it animates.
 */
export const ralfAnswerArrives = (message: Shown, shown: ReadonlySet<string> | null): boolean =>
  shown !== null && message.role === "assistant" && !shown.has(coachMessageKey(message));
