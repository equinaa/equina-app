/**
 * Said quietly where a conversation starts: Ralf is not a person, and asking
 * him sends the question outside Equina. "The context you allow" is the list
 * under Privacy and Ralf in Account. The server reads those switches on every
 * request, and has to honour each of them for this sentence to stay true.
 *
 * The provider is not named: the owner has not approved that wording. Asking
 * for permission before the first message is a later step; this line is what
 * the first build can say truthfully without it.
 */
export const ralfAiNotice =
  "Ralf is an AI assistant. Your question and the context you allow in Account are sent to an AI provider to write the answer.";
