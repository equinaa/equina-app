/**
 * What a rider can work on, per discipline. Ralf's conversation settings, the
 * Academy's path and Account's training profile all offer the same list.
 */
export const trainingFocusByDiscipline: Record<"Dressage" | "Jumping" | "Eventing" | "Trail", readonly string[]> = {
  Dressage: ["Transitions", "Contact", "Suppleness"],
  Jumping: ["Rhythm", "Lines", "Confidence"],
  Eventing: ["Balance", "Fitness", "Recovery"],
  Trail: ["Relaxation", "Fitness", "Confidence"]
};

export type CoachConversationContext = {
  selectedHorseId?: string;
  hasHorse: boolean;
  horseName: string;
  focus: string;
  load: string;
  style: string;
};

export type CoachDisplayMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  clientNonce: string;
  status: "pending" | "complete" | "failed" | "blocked";
  basedOn: string[];
  confidence?: "high" | "medium" | "low";
  safetyCategory: string;
  createdAt: string;
};
