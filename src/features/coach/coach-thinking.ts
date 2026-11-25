import type { CoachDisplayMessage } from "./coach-types";

type Shown = Pick<CoachDisplayMessage, "id" | "role" | "status" | "clientNonce">;

/**
 * Whether Ralf's "Thinking" row shows: a question is on its way and nothing has
 * answered it yet.
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

/** The answer to a question: the server stores it with the question's nonce. */
const answered = (question: Shown, messages: readonly Shown[]): boolean =>
  question.clientNonce !== "" &&
  messages.some((message) => message.role === "assistant" && message.clientNonce === question.clientNonce);

/**
 * Whether "Sending..." shows under a question. Never while a send is in flight,
 * since the Thinking row says it then, and never once the question's answer is
 * on screen: Realtime can deliver the answer before the send returns, and a
 * late copy of the question can arrive still marked pending.
 */
export const showsSendingLine = (message: Shown, messages: readonly Shown[], sending: boolean): boolean =>
  message.role === "user" && message.status === "pending" && !sending && !answered(message, messages);

/**
 * Whether an answer arrives now, and so fades in: its question was on screen
 * before it, and the answer was not. What comes in together with its question
 * (a conversation opening, the demo restoring a saved one) is simply there.
 * `shown` holds the keys of the messages already on screen.
 */
export const ralfAnswerArrives = (
  message: Shown,
  messages: readonly Shown[],
  shown: ReadonlySet<string>
): boolean => {
  if (message.role !== "assistant" || message.clientNonce === "" || shown.has(coachMessageKey(message))) return false;
  const question = messages.find((entry) => entry.role === "user" && entry.clientNonce === message.clientNonce);
  return question !== undefined && shown.has(coachMessageKey(question));
};
