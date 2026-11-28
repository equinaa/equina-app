/** Joins what was said to what is already in the box, with one space between. */
export const joinSpoken = (before: string, spoken: string) => {
  const head = before.replace(/\s+$/, "");
  const tail = spoken.trim();
  if (!tail) return before;
  return head ? `${head} ${tail}` : tail;
};

/**
 * A language tag the way the recognizer lists them. Phones also report
 * "pt_PT", "en-GB@rg=rozzzz" (English, region Romania) or
 * "en-US-u-rg-rozzzz", which the recognizer never matches.
 */
export const cleanLocaleTag = (tag: string) =>
  tag.trim().replace(/_/g, "-").replace(/@.*$/, "").replace(/-[utx]-.*$/i, "");

// The region a language is usually heard in, for a tag the recognizer does not
// list as such: "pt-RO" (Portuguese, region Romania) is listened to as pt-BR.
const USUAL_REGION: Record<string, string> = {
  en: "en-US",
  pt: "pt-BR",
  es: "es-ES",
  ro: "ro-RO",
  hu: "hu-HU",
  fr: "fr-FR",
  de: "de-DE",
  it: "it-IT"
};

/**
 * The supported language to listen in, for the languages the rider wants,
 * best first. Each wanted language is tried in turn: the tag itself, then
 * its usual region, then any region of that language. The first wanted language
 * that the recognizer knows wins, as that is the one the rider speaks.
 * Returns the tag exactly as the recognizer listed it, or null.
 */
export const pickSpeechLocale = (wanted: string[], supported: string[]): string | null => {
  const listed = new Map<string, string>();
  for (const tag of supported) {
    const key = cleanLocaleTag(tag).toLowerCase();
    if (key && !listed.has(key)) listed.set(key, tag);
  }
  for (const tag of wanted) {
    const key = cleanLocaleTag(tag).toLowerCase();
    if (!key) continue;
    const exact = listed.get(key);
    if (exact) return exact;
    const [language = key, ...rest] = key.split("-");
    // A script between language and region ("zh-Hant-TW"): the region still counts.
    const region = rest.find((part) => /^([a-z]{2}|\d{3})$/.test(part));
    const sameRegion = region ? listed.get(`${language}-${region}`) : undefined;
    if (sameRegion) return sameRegion;
    const usual = USUAL_REGION[language];
    const regional = usual ? listed.get(usual.toLowerCase()) : undefined;
    if (regional) return regional;
    for (const [listedKey, listedTag] of listed) {
      if (listedKey.startsWith(`${language}-`)) return listedTag;
    }
  }
  return null;
};

/**
 * The languages to listen in, best first: the phone's own list (on iOS,
 * AppleLanguages, the rider's real languages), then the app's locale.
 */
export const wantedSpeechLocales = (phoneLanguages: unknown, appLocale: string): string[] => {
  const listed = Array.isArray(phoneLanguages) ? phoneLanguages : [phoneLanguages];
  const wanted: string[] = [];
  for (const tag of [...listed, appLocale]) {
    if (typeof tag === "string" && tag.trim() && !wanted.includes(tag)) wanted.push(tag);
  }
  return wanted;
};

/**
 * The language a session asks for, from what the phone's recognizer reports.
 * Languages installed for offline use come first (on iOS that list is the
 * same as the supported one). Null: the recognizer knows none of the rider's
 * languages. When the phone reports no list at all, the first wanted language
 * is asked for as it is, and the session says if it is not known.
 */
export const chooseSpeechLocale = (wanted: string[], reported: ReportedLocales | null): string | null => {
  const installed = reported?.installedLocales ?? [];
  const supported = reported?.locales ?? [];
  if (!installed.length && !supported.length) return wanted.map(cleanLocaleTag).find(Boolean) ?? null;
  return pickSpeechLocale(wanted, installed) ?? pickSpeechLocale(wanted, supported);
};

/** What the recognizer reports it can hear (getSupportedLocales). */
export type ReportedLocales = { locales?: string[]; installedLocales?: string[] };

/**
 * The language to listen in, asking the recognizer for its list. A list that
 * fails, or does not come within the wait, counts as no list: a recognizer
 * that never answers must not hold every press for good.
 */
export const resolveSpeechLocale = (
  wanted: string[],
  listLocales: () => Promise<ReportedLocales>,
  waitMs = 2000
): Promise<string | null> =>
  new Promise<ReportedLocales | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), waitMs);
    Promise.resolve()
      .then(listLocales)
      .then(resolve, () => resolve(null))
      .finally(() => clearTimeout(timer));
  }).then((reported) => chooseSpeechLocale(wanted, reported));

export const PERMISSION_HINT = "Allow the microphone and speech recognition in Settings to ask by voice.";
export const RETRY_HINT = "Couldn't hear that. Hold the mic and try again.";
export const TAP_HINT = "Hold the mic while you speak.";
export const READY_HINT = "Ready. Hold the mic while you speak.";
export const NOTHING_HEARD_HINT = "Couldn't hear that. Hold the mic while you speak.";
export const DICTATION_HINT = "Turn on Dictation in Settings › General › Keyboard to ask by voice.";
export const noLanguageHint = (platform: string) =>
  `Voice isn't available in this ${platform === "ios" ? "iPhone" : "phone"}'s language.`;

/**
 * What a failed session tells the rider, so the mic never fails in silence.
 * Null: nothing to say now. Stopped on purpose, or nothing was heard, which
 * is said once the session ends, unless words came first.
 */
export const voiceErrorHint = (error: string, platform: string): string | null => {
  switch (error) {
    case "aborted":
    case "no-speech":
    case "speech-timeout":
      return null;
    case "not-allowed":
      return PERMISSION_HINT;
    case "language-not-supported":
      return noLanguageHint(platform);
    case "service-not-allowed":
      // iOS: Siri and Dictation are off, or this language's offline model is not
      // downloaded; turning Dictation on fetches it. Android: a permission is missing.
      return platform === "ios" ? DICTATION_HINT : PERMISSION_HINT;
    default:
      return RETRY_HINT;
  }
};
