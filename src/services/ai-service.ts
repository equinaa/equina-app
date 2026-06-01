import type { AiOutput, Horse, Listing } from "../domain/types";

export interface AiProvider {
  complete(input: { system: string; user: string; maxTokens: number }): Promise<string>;
}

export class DeterministicAiProvider implements AiProvider {
  async complete(input: { user: string }): Promise<string> {
    return `Summary based on structured Equina data: ${input.user.slice(0, 180)}`;
  }
}

export class AiAssistantService {
  constructor(private readonly provider: AiProvider) {}

  async summarizeSession(input: {
    horse: Horse;
    minutes: number;
    focus: string;
    notes: string;
    priorSessionsCount: number;
  }): Promise<AiOutput> {
    const basedOn = ["horse profile", "session duration", "rider notes"];
    if (input.priorSessionsCount > 0) basedOn.push(`${input.priorSessionsCount} prior sessions`);

    const summary = await this.provider.complete({
      system: "You summarize equestrian training logs without medical claims.",
      user: `${input.horse.name}: ${input.minutes} minutes focused on ${input.focus}. Notes: ${input.notes}`,
      maxTokens: 220
    });

    return {
      taskType: "session_summary",
      summary,
      confidence: input.priorSessionsCount >= 4 ? "high" : "medium",
      basedOn,
      safetyFlags: this.detectSafetyFlags(input.notes),
      disclaimer: "Use this as a training journal aid, not a replacement for coach, vet, or saddler judgment."
    };
  }

  async saddleFitGuidance(input: { horse: Horse; listing: Listing }): Promise<AiOutput> {
    const hasMeasurements = Boolean(input.horse.measurements?.backLengthCm && input.horse.measurements?.witherHeightCm);
    const hasSaddleMetadata = Boolean(input.listing.metadata?.treeSize && input.listing.metadata?.seatSize);
    const confidence = hasMeasurements && hasSaddleMetadata ? "medium" : "low";

    return {
      taskType: "saddle_fit_guidance",
      summary:
        confidence === "medium"
          ? `This ${input.listing.brand} ${input.listing.model ?? "saddle"} has enough structured metadata for a preliminary fit screen. Confirm with a saddler before purchase.`
          : "There is not enough structured horse measurement and saddle metadata for reliable fit guidance. Ask the seller for measurements and consult a saddler.",
      confidence,
      basedOn: ["horse measurements", "listing saddle metadata"].filter((_, index) =>
        index === 0 ? hasMeasurements : hasSaddleMetadata
      ),
      safetyFlags: [],
      disclaimer: "Saddle fit guidance is preliminary and must be confirmed by a qualified saddler."
    };
  }

  private detectSafetyFlags(notes: string): string[] {
    const text = notes.toLowerCase();
    const flags: string[] = [];
    if (text.includes("lame") || text.includes("swollen") || text.includes("colic")) {
      flags.push("health_review_recommended");
    }
    if (text.includes("fall") || text.includes("unsafe")) {
      flags.push("safety_review_recommended");
    }
    return flags;
  }
}
