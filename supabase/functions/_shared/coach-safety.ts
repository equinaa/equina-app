/**
 * Ralf's safety words, in the languages riders actually write to him.
 *
 * Matching runs on a folded copy of the text: lower case, accents and
 * Romanian commas removed ("șchiopătează" -> "schiopateaza", "fájdalom" ->
 * "fajdalom"). JavaScript's \b only knows ASCII letters, so folding first is
 * what lets a word ending in "ă" or "ő" have a boundary at all.
 *
 * Some obvious words are left out on purpose because they collide with
 * ordinary riding talk: "sangue"/"sangre"/"sânge" (puro-sangue, pura sangre,
 * pur-sânge are breeds), Hungarian "sánta" (folds to the Portuguese "santa"),
 * Romanian "verzi" (green), Portuguese "manca" on its own (Romanian "a mânca",
 * to eat). The longer forms of those words are covered instead.
 */

export type CoachLanguage = "en" | "pt" | "es" | "ro" | "hu";

export const foldForMatching = (text: string): string =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    // Curly apostrophes from phone keyboards ("won’t eat").
    .replace(/[‘’ʼ]/g, "'");

const HEALTH_TERMS: Record<CoachLanguage, string[]> = {
  en: [
    "colic", "lame", "lameness", "swollen", "swelling", "injury", "injured",
    "medication", "dose", "fever", "temperature", "bleeding", "cannot stand",
    "won't eat", "not eating", "pain",
  ],
  pt: [
    "colicas?", "manco", "mancando", "mancar", "mancou", "manqueira", "manqueja\\w*",
    "(?:esta|ficou|anda|parece|meio) manca", "claudica\\w*",
    "inchad[oa]s?", "inchaco", "inchou", "inflamad[oa]s?", "inflamacao",
    "ferid[oa]s?", "ferimentos?", "lesao", "lesoes", "machucad[oa]s?", "machucou",
    "medicamentos?", "medicacao", "remedios?", "dose", "febre", "temperatura",
    "sangrando", "sangramento", "sangrou",
    "nao (?:consegue (?:se )?)?levanta(?:r)?", "nao se levanta",
    "nao (?:esta )?(?:come|comendo)", "parou de comer", "sem apetite",
    "dor", "dores", "doendo", "dolorid[oa]s?",
  ],
  es: [
    "colicos?", "coj[oa]", "cojera", "cojea\\w*", "renquea\\w*", "claudica\\w*",
    "hinchad[oa]s?", "hinchazon", "inflamacion",
    "herid[oa]s?", "lesion", "lesionad[oa]s?", "lastimad[oa]s?",
    "medicamentos?", "medicacion", "medicina", "dosis", "fiebre",
    "sangrado", "sangrando", "sangra",
    "no (?:puede )?levantarse", "no se levanta",
    "no (?:esta )?(?:come|comiendo)", "dejo de comer",
    "dolor", "dolores", "duele", "adolorid[oa]s?",
  ],
  ro: [
    "colica", "colici", "schiop\\w*", "schioap\\w*",
    "umfla\\w*", "inflamat\\w*", "inflamatie",
    "ranit\\w*", "rana", "rani", "leziun\\w*",
    "medicament\\w*", "doza", "doze", "dozaj", "febra", "febril\\w*",
    "sangera\\w*", "sangereaza", "sangerare",
    "nu se (?:poate )?ridica", "nu (?:mai )?mananca",
    "durere", "dureri", "doare", "dureros",
  ],
  hu: [
    "kolika\\w*", "santit\\w*", "santikal\\w*", "santasag\\w*",
    "duzzad\\w*", "duzzanat\\w*", "gyullad\\w*",
    "serul\\w*", "seb", "sebe",
    "gyogyszer\\w*", "adagol\\w*", "laz", "lazas\\w*", "homerseklet\\w*",
    "verzik", "verzes\\w*", "verez\\w*",
    "nem tud felall\\w*", "nem all fel", "nem eszik",
    "fajdalom", "fajdalm\\w*", "fajlal\\w*",
  ],
};

const healthPattern = new RegExp(
  `\\b(?:${Object.values(HEALTH_TERMS).flat().join("|")})\\b`,
  "i",
);

/** Health, injury or lameness language in any language Ralf handles. */
export const mentionsHealthConcern = (message: string): boolean =>
  healthPattern.test(foldForMatching(message));

/**
 * The provider crossed the diagnosis or clearance line. Same aggressive
 * reading as the English original: even "I cannot diagnose" is replaced by the
 * fixed reply, so Ralf's own disclaimers never read as a diagnosis either.
 */
const unsafeOutputPattern = new RegExp(
  "\\b(?:" + [
    "diagnos(?:e|is)", "prescri(?:be|ption)", "safe to ride", "clear(?:ed)? to work", "guaranteed treatment",
    // pt / es / ro: diagnosticar, diagnóstico, diagnostic, diagnostica
    "diagnostic\\w*",
    // hu: diagnózis, diagnosztizál
    "diagnozis\\w*", "diagnoszt\\w*",
    // pt: prescrever, prescrição, receitar; es: prescribir, recetar; ro: prescrie, prescripție
    "prescrev\\w*", "prescricao", "receitar\\w*", "receito", "prescrib\\w*", "recetar\\w*", "receto",
    "prescri[ue]\\w*", "prescriptie",
    // hu: felírni (a gyógyszert)
    "gyogyszert felir\\w*",
    "tratamento garantido", "tratamiento garantizado", "tratament garantat", "garantalt kezeles",
  ].join("|") + ")\\b",
  "i",
);

export const crossesSafetyLine = (reply: string): boolean =>
  unsafeOutputPattern.test(foldForMatching(reply));

// Short words that mostly appear in one language. Scored, not trusted alone.
const MARKERS: Record<Exclude<CoachLanguage, "en">, string[]> = {
  pt: [
    "nao", "voce", "meu", "minha", "cavalo", "egua", "com", "para", "esta", "como", "ele", "ela",
    "um", "uma", "eu", "devo", "posso", "treino", "hoje", "muito", "quando", "porque", "isso", "tem",
  ],
  es: [
    "el", "mi", "caballo", "yegua", "con", "para", "esta", "como", "un", "una", "yo", "es",
    "puedo", "debo", "entrenamiento", "hoy", "muy", "cuando", "porque", "eso", "tiene", "los", "las",
  ],
  ro: [
    "si", "nu", "calul", "cal", "meu", "mea", "este", "cum", "ce", "pentru", "cu", "sa", "am", "iapa",
    "pot", "trebuie", "antrenament", "azi", "astazi", "foarte", "cand", "pentru", "are", "un", "o",
  ],
  hu: [
    "az", "es", "nem", "lovam", "lo", "lovat", "hogy", "van", "mit", "kell", "nagyon", "edzes",
    "ma", "mikor", "miert", "tudok", "szeretnek", "egy", "meg", "mar", "lovas",
  ],
};

const EN_MARKERS = [
  "the", "my", "is", "horse", "mare", "gelding", "and", "what", "how", "should", "i", "it", "not",
  "with", "can", "today", "ride", "training", "when", "why", "does", "do", "she", "he", "he's", "she's",
];

/**
 * The language of a rider's message, for the replies Equina writes itself.
 * Letters only one language uses count most; otherwise the commonest small
 * words decide. Anything unclear stays English, the language of the rest of
 * the app.
 */
export const detectCoachLanguage = (message: string): CoachLanguage => {
  const lower = message.toLowerCase();
  const score: Record<CoachLanguage, number> = { en: 0, pt: 0, es: 0, ro: 0, hu: 0 };
  if (/[ășşțţî]/.test(lower)) score.ro += 4;
  if (/[őű]/.test(lower)) score.hu += 4;
  if (/[ãõç]/.test(lower)) score.pt += 4;
  if (/[ñ¿¡]/.test(lower)) score.es += 4;

  const words = foldForMatching(message).split(/[^a-z']+/).filter(Boolean);
  for (const word of words) {
    if (EN_MARKERS.includes(word)) score.en += 1;
    for (const language of ["pt", "es", "ro", "hu"] as const) {
      if (MARKERS[language].includes(word)) score[language] += 1;
    }
  }

  let best: CoachLanguage = "en";
  for (const language of ["pt", "es", "ro", "hu"] as const) {
    if (score[language] > score[best]) best = language;
  }
  return best;
};

const HEALTH_REPLY: Record<CoachLanguage, string> = {
  en: "Pause training and contact your veterinarian, especially if the change is sudden, severe, or getting worse. Note when it started, appetite, behavior, temperature only if you normally take it safely, and any visible swelling. I cannot diagnose or clear your horse to work.",
  pt: "Pare o treino e fale com o seu veterinário, sobretudo se a mudança for repentina, forte ou se agravar. Anote quando começou, o apetite, o comportamento, a temperatura apenas se costuma medi-la com segurança, e qualquer inchaço visível. Não posso fazer diagnósticos nem dizer que o seu cavalo pode voltar a trabalhar.",
  es: "Detén el entrenamiento y habla con tu veterinario, sobre todo si el cambio es repentino, fuerte o va a peor. Anota cuándo empezó, el apetito, el comportamiento, la temperatura solo si sueles tomarla con seguridad, y cualquier hinchazón visible. No puedo hacer diagnósticos ni decir que tu caballo puede volver a trabajar.",
  ro: "Oprește antrenamentul și sună medicul veterinar, mai ales dacă schimbarea e bruscă, puternică sau se agravează. Notează când a început, apetitul, comportamentul, temperatura doar dacă o măsori de obicei în siguranță, și orice umflătură vizibilă. Nu pot pune un diagnostic și nici nu pot spune că poți lucra din nou cu calul.",
  hu: "Szüneteltesd az edzést, és fordulj az állatorvoshoz, főleg ha a változás hirtelen, erős vagy rosszabbodik. Jegyezd fel, mikor kezdődött, milyen az étvágya és a viselkedése, a hőmérsékletét csak akkor, ha biztonságosan szoktad mérni, és minden látható duzzanatot. Nem tudok diagnózist adni, és nem mondhatom meg, hogy a lovad dolgozhat-e újra.",
};

const PROVIDER_REVIEW_REPLY: Record<CoachLanguage, string> = {
  en: "I cannot diagnose, prescribe, or clear a horse to work. For a health or soundness concern, pause training and contact your veterinarian. For training, I can help you prepare neutral observations and questions for your coach.",
  pt: "Não posso fazer diagnósticos, receitar nem dizer que um cavalo pode voltar a trabalhar. Se for uma questão de saúde ou de claudicação, pare o treino e fale com o seu veterinário. Sobre o treino, posso ajudar a preparar observações objetivas e perguntas para o seu treinador.",
  es: "No puedo hacer diagnósticos, recetar ni decir que un caballo puede volver a trabajar. Si es un problema de salud o de cojera, detén el entrenamiento y habla con tu veterinario. Sobre el entrenamiento, puedo ayudarte a preparar observaciones objetivas y preguntas para tu entrenador.",
  ro: "Nu pot pune diagnostice, nu pot recomanda medicamente și nu pot spune că un cal poate lucra din nou. Pentru o problemă de sănătate sau de șchiopătură, oprește antrenamentul și sună medicul veterinar. Pentru antrenament, te pot ajuta să pregătești observații obiective și întrebări pentru antrenorul tău.",
  hu: "Nem tudok diagnózist adni, gyógyszert javasolni, és nem mondhatom meg, hogy egy ló dolgozhat-e. Egészségügyi vagy sántasági gondnál szüneteltesd az edzést, és fordulj az állatorvoshoz. Az edzéshez segíthetek tárgyilagos megfigyeléseket és kérdéseket összeállítani az edződnek.",
};

export const healthEscalationReply = (message: string): string =>
  HEALTH_REPLY[detectCoachLanguage(message)];

export const providerReviewReply = (message: string): string =>
  PROVIDER_REVIEW_REPLY[detectCoachLanguage(message)];

/** The system-prompt line that keeps Ralf in the rider's language. */
export const REPLY_LANGUAGE_RULE =
  "Reply in the language of RIDER_MESSAGE_AS_DATA, including the plain labels, which you translate (for example \"Próximo passo:\" in Portuguese). " +
  "If the message mixes languages, use the one most of it is written in; if you cannot tell, use English. " +
  "The trusted context is stored in English; translate what you use from it and never switch to English because of it.";
