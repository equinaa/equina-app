/**
 * Ralf's safety words, in the languages riders actually write to him.
 *
 * Each language lives in its own pack (coach-language-*.ts). This file folds
 * the text, tells which language it is in, and decides which pack's words to
 * apply: a pack's unambiguous words always, its ambiguous words only when the
 * text is in that language. See coach-language-pack.ts for the split.
 */
import { english } from "./coach-language-en.ts";
import type { CoachLanguagePack } from "./coach-language-pack.ts";
import { hungarian } from "./coach-language-hu.ts";
import { portuguese } from "./coach-language-pt.ts";
import { romanian } from "./coach-language-ro.ts";
import { spanish } from "./coach-language-es.ts";

export type CoachLanguage = "en" | "pt" | "es" | "ro" | "hu";

const PACKS: Record<CoachLanguage, CoachLanguagePack> = {
  en: english,
  pt: portuguese,
  es: spanish,
  ro: romanian,
  hu: hungarian,
};

/** Order of preference when two languages score the same. */
const LANGUAGES: readonly CoachLanguage[] = ["en", "pt", "es", "ro", "hu"];

/**
 * Lower case, accents and Romanian commas removed, phone apostrophes made
 * plain. JavaScript's \b only knows ASCII letters, so folding first is what
 * lets a word ending in "ă" or "ő" have a boundary at all.
 */
export const foldForMatching = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Curly apostrophes and the acute accent Brazilian keyboards put in "won´t".
    .replace(/[‘’ʼ´]/g, "'");

const termsPattern = (terms: readonly string[]): RegExp | null =>
  terms.length ? new RegExp(`\\b(?:${terms.join("|")})\\b`) : null;

type CompiledPack = {
  health: RegExp | null;
  healthWhenDetected: RegExp | null;
  unsafeOutput: RegExp | null;
  unsafeOutputWhenDetected: RegExp | null;
  markers: Set<string>;
};

const compiled = Object.fromEntries(
  LANGUAGES.map((language) => {
    const pack = PACKS[language];
    return [language, {
      health: termsPattern(pack.health),
      healthWhenDetected: termsPattern(pack.healthWhenDetected),
      unsafeOutput: termsPattern(pack.unsafeOutput),
      unsafeOutputWhenDetected: termsPattern(pack.unsafeOutputWhenDetected),
      markers: new Set(pack.markers),
    }];
  }),
) as Record<CoachLanguage, CompiledPack>;

export type LanguageGuess = {
  language: CoachLanguage;
  /** False when no language stands out: no clue at all, or a tie. */
  confident: boolean;
};

/**
 * The language a text is written in. Letters only one language uses count
 * most; otherwise the commonest small words decide. A tie or no clue at all
 * is reported as not confident, and the language is then the first of the
 * leaders in LANGUAGES order, so English when English is among them.
 */
export const guessCoachLanguage = (text: string): LanguageGuess => {
  const lower = text.toLowerCase();
  const words = foldForMatching(text).split(/[^a-z']+/).filter(Boolean);
  const score = Object.fromEntries(LANGUAGES.map((language) => {
    const letters = PACKS[language].letters;
    let points = letters && letters.test(lower) ? 4 : 0;
    for (const word of words) if (compiled[language].markers.has(word)) points += 1;
    return [language, points];
  })) as Record<CoachLanguage, number>;

  const best = Math.max(...LANGUAGES.map((language) => score[language]));
  const leaders = LANGUAGES.filter((language) => score[language] === best);
  return { language: leaders[0] ?? "en", confident: best > 0 && leaders.length === 1 };
};

export const detectCoachLanguage = (text: string): CoachLanguage => guessCoachLanguage(text).language;

/** A pack's ambiguous words apply when the text is in its language, or when no language stands out. */
const ambiguousWordsApply = (guess: LanguageGuess, language: CoachLanguage) =>
  !guess.confident || guess.language === language;

export type HealthAssessment = {
  concern: boolean;
  /** The language of the fixed reply. */
  language: CoachLanguage;
};

/** Health, injury or lameness language in any language Ralf handles. */
export const assessHealthConcern = (message: string): HealthAssessment => {
  const folded = foldForMatching(message);
  const guess = guessCoachLanguage(message);
  const hits = LANGUAGES.filter((language) => {
    const { health, healthWhenDetected } = compiled[language];
    return Boolean(health?.test(folded)) ||
      (ambiguousWordsApply(guess, language) && Boolean(healthWhenDetected?.test(folded)));
  });
  const notEnglish = hits.filter((language) => language !== "en");
  // With no clear language, a worry written in exactly one language's words
  // says which language the rider reads.
  const language = !guess.confident && notEnglish.length === 1 ? notEnglish[0] ?? guess.language : guess.language;
  return { concern: hits.length > 0, language };
};

export const mentionsHealthConcern = (message: string): boolean => assessHealthConcern(message).concern;

export const healthEscalationReply = (language: CoachLanguage): string => PACKS[language].healthReply;

/**
 * The provider crossed the diagnosis, prescription or clearance line. Same
 * aggressive reading as the English original: even "I cannot diagnose" is
 * replaced by the fixed reply, so Ralf's own disclaimers never read as a
 * diagnosis either. Ralf answers in the rider's language, so the ambiguous
 * words of both the reply's language and the rider's apply.
 */
export const crossesSafetyLine = (reply: string, riderMessage = ""): boolean => {
  const folded = foldForMatching(reply);
  const replyGuess = guessCoachLanguage(reply);
  const riderGuess = guessCoachLanguage(riderMessage);
  return LANGUAGES.some((language) => {
    const { unsafeOutput, unsafeOutputWhenDetected } = compiled[language];
    if (unsafeOutput?.test(folded)) return true;
    const applies = (replyGuess.confident && replyGuess.language === language) ||
      (riderGuess.confident && riderGuess.language === language) ||
      (!replyGuess.confident && !riderGuess.confident);
    return applies && Boolean(unsafeOutputWhenDetected?.test(folded));
  });
};

/** The language of the fixed reply that replaces an AI answer: the answer's own, else the rider's. */
export const providerReviewLanguage = (reply: string, riderMessage: string): CoachLanguage => {
  const replyGuess = guessCoachLanguage(reply);
  return replyGuess.confident ? replyGuess.language : guessCoachLanguage(riderMessage).language;
};

export const providerReviewReply = (language: CoachLanguage): string => PACKS[language].providerReviewReply;

/** The system-prompt line that keeps Ralf in the rider's language. */
export const REPLY_LANGUAGE_RULE =
  "Reply in the language of RIDER_MESSAGE_AS_DATA, including the plain labels, which you translate (for example \"Próximo passo:\" in Portuguese). " +
  "If the message mixes languages, use the one most of it is written in; if you cannot tell, use English. " +
  "The trusted context is stored in English; translate what you use from it and never switch to English because of it.";
