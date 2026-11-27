import type { CoachLanguagePack } from "./coach-language-pack.ts";

/** Romanian. Terms are folded: see coach-language-pack.ts. */
export const romanian: CoachLanguagePack = {
  health: [
    "colica", "colici", "schiop\\w*", "schioap\\w*", "umfla\\w*", "inflamat\\w*", "inflamatie", "ranit\\w*",
    "leziun\\w*", "medicament\\w*", "doza", "dozaj", "febra", "febril\\w*", "sangera\\w*", "sangereaza",
    "sangerare", "nu se (?:poate )?ridica", "nu (?:mai )?mananca", "durere", "dureri", "doare", "dureros",
  ],
  healthWhenDetected: [
    "rana", "rani",
  ],
  unsafeOutput: [
    "prescri[ue]\\w*", "prescriptie", "tratament garantat",
  ],
  unsafeOutputWhenDetected: [
    "diagnostic\\w*",
  ],
  markers: [
    "si", "nu", "calul", "cal", "meu", "mea", "este", "cum", "ce", "pentru", "cu", "sa", "am", "iapa", "pot",
    "trebuie", "antrenament", "azi", "astazi", "foarte", "cand", "un",
  ],
  letters: /[ăîșşțţ]/,
  healthReply:
    "Oprește antrenamentul și sună medicul veterinar, mai ales dacă schimbarea e bruscă, puternică sau se agravează. Notează când a început, apetitul, comportamentul, temperatura doar dacă o măsori de obicei în siguranță, și orice umflătură vizibilă. Nu pot pune un diagnostic și nici nu pot spune că poți lucra din nou cu calul.",
  providerReviewReply:
    "Nu pot pune diagnostice, nu pot recomanda medicamente și nu pot spune că un cal poate lucra din nou. Pentru o problemă de sănătate sau de șchiopătură, oprește antrenamentul și sună medicul veterinar. Pentru antrenament, te pot ajuta să pregătești observații obiective și întrebări pentru antrenorul tău.",
};
