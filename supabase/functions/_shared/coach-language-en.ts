import type { CoachLanguagePack } from "./coach-language-pack.ts";

/**
 * English, the language of the rest of the app. The health list is the
 * original one, unchanged, and it runs on every message: riders writing in
 * any language often use the English word ("colic", "lame").
 */
export const english: CoachLanguagePack = {
  health: [
    "colic", "lame", "lameness", "swollen", "swelling", "injury", "injured",
    "medication", "dose", "fever", "temperature", "bleeding", "cannot stand",
    "won't eat", "not eating", "pain",
  ],
  healthWhenDetected: [],
  unsafeOutput: [
    "diagnos(?:e|is)", "prescri(?:be|ption)", "safe to ride", "clear(?:ed)? to work", "guaranteed treatment",
  ],
  unsafeOutputWhenDetected: [],
  markers: [
    "the", "my", "is", "are", "am", "was", "horse", "gelding", "and", "what", "how", "should", "i", "it",
    "not", "with", "can", "today", "ride", "riding", "training", "when", "why", "does", "she", "he", "her",
    "his", "him", "he's", "she's", "i'm", "it's", "this", "that", "after", "before", "have", "has", "of",
    "to", "on", "for", "be", "you", "your", "we", "our",
  ],
  healthReply:
    "Pause training and contact your veterinarian, especially if the change is sudden, severe, or getting worse. Note when it started, appetite, behavior, temperature only if you normally take it safely, and any visible swelling. I cannot diagnose or clear your horse to work.",
  providerReviewReply:
    "I cannot diagnose, prescribe, or clear a horse to work. For a health or soundness concern, pause training and contact your veterinarian. For training, I can help you prepare neutral observations and questions for your coach.",
};
