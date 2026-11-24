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

type CoachHorse = Pick<CoachConversationContext, "selectedHorseId" | "hasHorse" | "horseName">;

/**
 * The horse Ralf talks about, in his header and in what the server reads.
 * `about` undefined: the horse on Home. A horse id: that horse, while the
 * rider still has it. `null`: no horse, for a ride that had none or whose
 * horse the rider no longer has; never Home's in its place, or Ralf would
 * review one horse's ride as another's.
 */
export const coachHorseFor = (
  about: string | null | undefined,
  horseNames: Readonly<Record<string, string>>,
  home: CoachHorse
): CoachHorse => {
  if (about === null) return { hasHorse: false, horseName: "" };
  const horseName = about ? horseNames[about] : undefined;
  return about && horseName ? { selectedHorseId: about, hasHorse: true, horseName } : home;
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
