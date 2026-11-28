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
    .replace(/[‘’ʼ´]/g, "'")
    // One space for any run of spaces, line breaks or no-break spaces, so
    // multi-word terms match however the phone spaced them.
    .replace(/\s+/g, " ");

const termsPattern = (terms: readonly string[] | undefined): RegExp | null =>
  terms?.length ? new RegExp(`\\b(?:${terms.join("|")})\\b`) : null;

/** Accented terms keep their accents, so \b (ASCII only) cannot bound them. */
const accentedPattern = (terms: readonly string[] | undefined): RegExp | null =>
  terms?.length ? new RegExp(`(?<![\\p{L}\\p{M}])(?:${terms.join("|")})(?![\\p{L}\\p{M}])`, "u") : null;

type CompiledPack = {
  health: RegExp | null;
  healthAccented: RegExp | null;
  healthWhenDetected: RegExp | null;
  unsafeOutput: RegExp | null;
  unsafeOutputWhenDetected: RegExp | null;
  markers: Set<string>;
  phraseMarkers: RegExp[];
};

const compiled = Object.fromEntries(
  LANGUAGES.map((language) => {
    const pack = PACKS[language];
    return [language, {
      health: termsPattern(pack.health),
      healthAccented: accentedPattern(pack.healthAccented),
      healthWhenDetected: termsPattern(pack.healthWhenDetected),
      unsafeOutput: termsPattern(pack.unsafeOutput),
      unsafeOutputWhenDetected: termsPattern(pack.unsafeOutputWhenDetected),
      markers: new Set(pack.markers),
      phraseMarkers: (pack.phraseMarkers ?? []).map((phrase) => new RegExp(`\\b(?:${phrase})\\b`)),
    }];
  }),
) as Record<CoachLanguage, CompiledPack>;

/** Lower case with composed accents, for the letters and accented terms. */
const lowerComposed = (text: string) => text.normalize("NFC").toLowerCase();

/**
 * How strongly a text reads as each language: 4 for a letter only that
 * language writes, 2 for each phrase marker found, 1 for each distinct marker
 * word. A word repeated ten times counts once, so a shared word cannot
 * outweigh distinct evidence.
 */
export const scoreCoachLanguages = (text: string): Record<CoachLanguage, number> => {
  const lower = lowerComposed(text);
  const folded = foldForMatching(text);
  const words = new Set(folded.split(/[^a-z']+/).filter(Boolean));
  const score = Object.fromEntries(LANGUAGES.map((language) => {
    const pack = PACKS[language];
    const { markers, phraseMarkers } = compiled[language];
    let points = pack.letters && pack.letters.test(lower) ? 4 : 0;
    for (const word of words) if (markers.has(word)) points += 1;
    for (const phrase of phraseMarkers) if (phrase.test(folded)) points += 2;
    return [language, points];
  })) as Record<CoachLanguage, number>;
  // Hungarian "és" (and) folds to the Spanish "es" (is). Written with its
  // accent it is Hungarian only, so it stops counting for Spanish.
  if (/(?<![\p{L}\p{M}])és(?![\p{L}\p{M}])/u.test(lower) && compiled.es.markers.has("es")) score.es -= 1;
  return score;
};

export type LanguageGuess = {
  language: CoachLanguage;
  /** False when no language stands out: no clue at all, or a tie. */
  confident: boolean;
};

const leadersOf = (score: Record<CoachLanguage, number>, among: readonly CoachLanguage[] = LANGUAGES) => {
  const best = Math.max(...among.map((language) => score[language]));
  return { best, leaders: among.filter((language) => score[language] === best) };
};

/**
 * The language a text is written in. A tie or no clue at all is reported as
 * not confident, and the language is then the first of the leaders in
 * LANGUAGES order, so English when English is among them.
 */
export const guessCoachLanguage = (text: string): LanguageGuess => {
  const { best, leaders } = leadersOf(scoreCoachLanguages(text));
  return { language: leaders[0] ?? "en", confident: best > 0 && leaders.length === 1 };
};

export const detectCoachLanguage = (text: string): CoachLanguage => guessCoachLanguage(text).language;

/**
 * Whose ambiguous words apply to a text: its language when one stands out;
 * the tied languages on a tie, so a Romanian/Spanish tie never opens the
 * Portuguese "dor"; every language only when there is no clue at all.
 */
const ambiguousLanguages = (text: string): Set<CoachLanguage> => {
  const { best, leaders } = leadersOf(scoreCoachLanguages(text));
  if (best === 0) return new Set(LANGUAGES);
  const applies = new Set(leaders);
  for (const language of LANGUAGES) {
    const elsewhere = PACKS[language].ambiguousElsewhereOnlyIn;
    if (elsewhere && !leaders.some((leader) => elsewhere.includes(leader))) applies.add(language);
  }
  return applies;
};

export type HealthAssessment = {
  concern: boolean;
  /** The language of the fixed reply. */
  language: CoachLanguage;
};

const assessText = (message: string): HealthAssessment => {
  const folded = foldForMatching(message);
  const lower = lowerComposed(message);
  const score = scoreCoachLanguages(message);
  const guess = guessCoachLanguage(message);
  const ambiguous = ambiguousLanguages(message);
  const hits = LANGUAGES.filter((language) => {
    const { health, healthAccented, healthWhenDetected } = compiled[language];
    return Boolean(health?.test(folded)) || Boolean(healthAccented?.test(lower)) ||
      (ambiguous.has(language) && Boolean(healthWhenDetected?.test(folded)));
  });
  const notEnglish = hits.filter((language) => language !== "en");

  // The reply goes in the rider's language. When that is unclear, or English
  // won on a single small word while no English health word matched, the
  // languages whose own words matched decide, by their scores.
  let language = guess.language;
  const englishMatched = guess.language === "en" && hits.includes("en");
  const englishByDefault = guess.language === "en" && !hits.includes("en") && score.en <= 1;
  if (notEnglish.length && !englishMatched && (!guess.confident || englishByDefault)) {
    const { best, leaders } = leadersOf(score, notEnglish);
    if (leaders.length === 1 || best > 0) language = leaders[0] ?? language;
  }
  // Only English words matched and the other language won on one small word
  // ("Meg lame RF": Hungarian "meg"): the rider wrote English.
  if (hits.length && !notEnglish.length && language !== "en" && score[language] < 2) language = "en";
  return { concern: hits.length > 0, language };
};

/** A line's own label, such as the app's "My note: ", which says nothing about the rider's language. */
const LINE_LABEL = /^[\p{L} ]{1,24}:\s+/u;

/**
 * Health, injury or lameness language in any language Ralf handles. A line
 * clearly in another language than the message as a whole is read on its
 * own, and the rest without it: a Portuguese note inside the app's English
 * ride review ("My note: Ela estava com dor na pata") is read as Portuguese
 * and answered in Portuguese, and a Spanish note that says "lame el bocado"
 * (licks the bit) is not read as English "lame".
 */
export const assessHealthConcern = (message: string): HealthAssessment => {
  const lines = message.split(/\n+/);
  if (lines.length < 2) return assessText(message);
  const wholeLanguage = guessCoachLanguage(message).language;
  const foreign: string[] = [];
  const rest: string[] = [];
  for (const line of lines) {
    const text = line.replace(LINE_LABEL, "").trim();
    const guess = text ? guessCoachLanguage(text) : undefined;
    if (guess?.confident && guess.language !== wholeLanguage) foreign.push(text);
    else rest.push(line);
  }
  if (!foreign.length) return assessText(message);
  for (const text of foreign) {
    const own = assessText(text);
    if (own.concern) return own;
  }
  return assessText(rest.join("\n"));
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
  const replyLanguages = ambiguousLanguages(reply);
  // The rider's message only adds its languages when it gives a clue: a
  // clue-less message would open every language and break English parity.
  const riderHasClue = leadersOf(scoreCoachLanguages(riderMessage)).best > 0;
  const riderLanguages = riderHasClue ? ambiguousLanguages(riderMessage) : new Set<CoachLanguage>();
  return LANGUAGES.some((language) => {
    const { unsafeOutput, unsafeOutputWhenDetected } = compiled[language];
    if (unsafeOutput?.test(folded)) return true;
    const applies = replyLanguages.has(language) || riderLanguages.has(language);
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
