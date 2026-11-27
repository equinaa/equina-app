/**
 * What Ralf's safety checks need to know about one language.
 *
 * Every term is a regular-expression fragment written in folded form: lower
 * case, no accents, Romanian commas and cedillas removed ("șchiopătează" is
 * written "schiopateaza"). The checks fold the text the same way before
 * matching and put \b on both sides of every term.
 *
 * Terms come in two kinds, and the split is what keeps the languages from
 * tripping over each other:
 * - `health` / `unsafeOutput` fire on every message, whatever its language.
 *   Only words that mean the same worry in every language belong here
 *   ("mancando", "sántít", "șchiopătează").
 * - `healthWhenDetected` / `unsafeOutputWhenDetected` fire only when the text
 *   is detected as this language, or when no language can be told at all.
 *   A word that is also an ordinary word or a common name elsewhere belongs
 *   here: Romanian "doze" is the Portuguese twelve, Portuguese "dor" is the
 *   Romanian "longing", Spanish "Dolores" and Hungarian "Seb" are names a
 *   horse or a coach can have.
 */
export type CoachLanguagePack = {
  health: readonly string[];
  healthWhenDetected: readonly string[];
  unsafeOutput: readonly string[];
  unsafeOutputWhenDetected: readonly string[];
  /**
   * Short, frequent words of this language, folded. They are counted, never
   * trusted alone, so a word shared with another language only blurs the
   * count; one shared with English ("are", "do", "mare") misleads it.
   */
  markers: readonly string[];
  /**
   * Multi-word or hyphenated clues, folded regex fragments ("por la", "mi-e",
   * "se pare"). Each one found counts 2: a phrase is stronger evidence than
   * one short word.
   */
  phraseMarkers?: readonly string[];
  /** Letters only this language writes, tested on the lower-case, unfolded text. */
  letters?: RegExp;
  /**
   * Health words whose accents carry the meaning, written with their accents
   * and matched on the unfolded text: Hungarian "sánta" (lame) is not the name
   * Santa, "fáj" (hurts) is not "faj" (breed). Always on. Phones type the
   * accents by default; the folded lists stay the fallback.
   */
  healthAccented?: readonly string[];
  /** The fixed reply when the rider's message raises a health worry. */
  healthReply: string;
  /** The fixed reply that replaces an AI answer crossing the safety line. */
  providerReviewReply: string;
};
