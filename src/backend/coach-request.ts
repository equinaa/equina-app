import { COACH_EFFORT_LIMIT, type CoachSendInput } from "./contracts";

/**
 * What coach-chat is sent for one question. The effort numbers ride in their
 * own field, never in `message`: the message is what the server saves, and
 * a server from before the field drops it unread, so nothing of them is kept
 * either way. Over the server's limit they would make it refuse the whole
 * question, so they are cut here as a last guard. Pure, so it is tested.
 */
export const coachSendBody = (input: CoachSendInput) => {
  const rideEffort = input.rideEffort?.trim().slice(0, COACH_EFFORT_LIMIT);
  return {
    conversationId: input.conversationId,
    selectedHorseId: input.selectedHorseId,
    message: input.message,
    clientNonce: input.clientNonce,
    context: input.context,
    ...(rideEffort ? { rideEffort } : {})
  };
};
