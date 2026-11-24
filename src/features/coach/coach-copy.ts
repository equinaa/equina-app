/**
 * Said quietly where a conversation starts: Ralf is not a person, and asking
 * him sends the question outside Equina. "The context you allow" is the list
 * under Privacy and Ralf in Account.
 *
 * That half of the sentence is a promise only the server can keep, and a store
 * build cannot take it back: coach-chat has to read all four of those
 * switches. The one in production on 24 Nov 2026 never read "Ride history".
 * So the line has a rule in the Production Claim Registry
 * (docs/EQUINA_ACTION_REGISTRY.md): the function that reads the switch is in
 * production before a build with this line reaches a tester. Privacy and Ralf
 * makes the same promise in its own words.
 *
 * The provider is not named: the owner has not approved that wording. Asking
 * for permission before the first message is a later step; this line is what
 * the first build can say truthfully without it.
 */
export const ralfAiNotice =
  "Ralf is an AI assistant. Your question and the context you allow in Account are sent to an AI provider to write the answer.";
