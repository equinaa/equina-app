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
