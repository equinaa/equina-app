/**
 * Fixed Ralf replies for named accounts.
 *
 * The brand account asks Ralf one question on camera and the answer has to be
 * exactly the same every time, so it is not left to the model: coach-chat
 * returns this text as it is, without calling the provider or spending a
 * credit. Only the accounts whose ids are listed in the
 * EQUINA_SCRIPTED_REPLY_USER_IDS secret get it; with the secret unset, nobody
 * does and every rider is answered by the model as usual.
 *
 * Pure on purpose (no Deno or npm imports), so the Node tests import it.
 */

/** En dash between the days (U+2013), as the brand writes it. */
export const EQUINA_NEXT_STOP_REPLY = "Hong Kong. 29–31 January.";

// The whole message has to be this question, never a sentence that contains
// it, so a real question from the same account still reaches the model.
// "equine" is how iOS autocorrect tends to rewrite the brand name, and the app
// cannot turn autocorrect off for builds already in testers' hands.
const nextStopQuestion = /^(?:(?:ralf|ralph) )?where should equin[ae] go next$/;

/**
 * Lower case, one space between words, and none of the wrapping a phone keyboard
 * adds: curly or straight quotes, a no-break space, a full-width question mark,
 * a trailing "?", "." or "!", and an opening "Ralf,".
 */
export const normalizeCoachQuestion = (message: string): string =>
  message
    // NFKC turns no-break spaces into spaces and full-width "？" into "?".
    .normalize("NFKC")
    .toLowerCase()
    .replace(/["'‘’‚‛“”„‟«»]/g, "")
    .replace(/[,:;]/g, " ")
    .replace(/[?.!\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** The ids in the secret: separated by commas or whitespace, any case. */
export const scriptedReplyUserIds = (secret: string | undefined): Set<string> =>
  new Set(
    (secret ?? "")
      .split(/[\s,]+/)
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );

/** The fixed reply for this account and message, or null to ask the model. */
export const scriptedCoachReply = (
  message: string,
  userId: string,
  allowedUserIds: Set<string>,
): string | null => {
  if (!allowedUserIds.has(userId.toLowerCase())) return null;
  return nextStopQuestion.test(normalizeCoachQuestion(message)) ? EQUINA_NEXT_STOP_REPLY : null;
};
