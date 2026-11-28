import type { CoachLanguagePack } from "./coach-language-pack.ts";

/**
 * English, the language of the rest of the app. The health list is the
 * original one, unchanged, and it runs on every message: riders writing in
 * any language often use the English word ("colic", "lame").
 */
export const english: CoachLanguagePack = {
  health: [
    "colic", "lameness", "swollen", "swelling", "injury", "injured",
    "medication", "dose", "fever", "temperature", "bleeding", "cannot stand",
    "won't eat", "not eating", "pain",
  ],
  // Spanish "lame" is "licks" ("lame el bocado") and Romanian "lame" is
  // "blades" (clipper blades), so the bare word waits for an English message.
  healthWhenDetected: ["lame"],
  ambiguousElsewhereOnlyIn: ["es", "ro"],
  unsafeOutput: [
    "diagnos(?:e|is)", "prescri(?:be|ption)", "safe to ride", "clear(?:ed)? to work", "guaranteed treatment",
  ],
  unsafeOutputWhenDetected: [],
  markers: [
    "the", "my", "is", "are", "am", "was", "horse", "gelding", "and", "what", "how", "should", "i", "it",
    "not", "with", "can", "today", "ride", "riding", "training", "when", "why", "does", "she", "he", "her",
    "his", "him", "he's", "she's", "i'm", "it's", "this", "that", "after", "before", "have", "has", "of",
    "to", "on", "for", "be", "you", "your", "we", "our",
    // Chat English drops the small words ("Seb coming Friday, plan?"), and the
    // app's own prompts ("Help me write down a health observation about X")
    // must read as English whatever the horse is called. Left out: words other
    // riders borrow or write ("thanks", "please", "great", "good", "help",
    // "tips", "just", "plan", "ideas", "show").
    "coming", "going", "next", "any", "tomorrow", "yesterday", "since", "again", "still", "did", "jumped",
    "step", "lesson", "said", "says", "week", "really", "very", "would", "could", "will", "they", "about",
    "from", "behind", "last", "night", "write", "down", "more", "best", "thoughts", "question", "quick",
    "free", "over", "up", "off", "got", "get", "but", "if", "too", "much", "some", "keep", "keeps", "there",
    "them", "their", "been", "who", "which", "where", "by", "out", "into", "lately",
  ],
  healthReply:
    "Pause training and contact your veterinarian, especially if the change is sudden, severe, or getting worse. Note when it started, appetite, behavior, temperature only if you normally take it safely, and any visible swelling. I cannot diagnose or clear your horse to work.",
  providerReviewReply:
    "I cannot diagnose, prescribe, or clear a horse to work. For a health or soundness concern, pause training and contact your veterinarian. For training, I can help you prepare neutral observations and questions for your coach.",
};
