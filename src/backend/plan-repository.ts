import type { SupabaseClient } from "@supabase/supabase-js";
import type { ClubAccess, PlanKey, PlanState, PlanTier } from "./contracts";
import type { EdgeClient } from "./edge-client";
import { backendError, EquinaBackendError } from "./errors";

const planKeys: PlanKey[] = ["free", "mid", "premium"];
const clubAccessLevels: ClubAccess[] = ["none", "read", "post"];

const planKey = (value: unknown): PlanKey => planKeys.find((key) => key === value) ?? "free";
const clubAccess = (value: unknown): ClubAccess => clubAccessLevels.find((level) => level === value) ?? "none";
const optionalText = (value: unknown) => (typeof value === "string" && value ? value : undefined);
const count = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0);

const mapTier = (row: Record<string, unknown>): PlanTier => ({
  key: planKey(row.key),
  name: String(row.name ?? ""),
  academyPicks: row.academyPicks === null || row.academyPicks === undefined ? null : count(row.academyPicks),
  clubAccess: clubAccess(row.clubAccess),
  monthlyCredits: count(row.monthlyCredits),
  coachSessions: count(row.coachSessions),
  eventTickets: count(row.eventTickets),
  trialDays: count(row.trialDays)
});

export const mapPlanState = (raw: unknown): PlanState => {
  const row = (raw ?? {}) as Record<string, unknown>;
  const academy = (row.academy ?? {}) as Record<string, unknown>;
  const status = row.status;
  const source = row.source;
  return {
    // A server from before the beta door sends no such field; it has no door.
    access: row.access !== false,
    enforced: row.enforced === true,
    tier: planKey(row.tier),
    status: status === "trialing" || status === "active" || status === "grace" ? status : undefined,
    source: source === "app_store" || source === "play" || source === "stripe" || source === "staff" ? source : undefined,
    trialEndsAt: optionalText(row.trialEndsAt),
    endsAt: optionalText(row.endsAt),
    clubAccess: clubAccess(row.clubAccess),
    academy: {
      picksLimit: academy.picksLimit === null || academy.picksLimit === undefined ? null : count(academy.picksLimit),
      picksUsed: count(academy.picksUsed),
      openPicks: Array.isArray(academy.openPicks) ? academy.openPicks.map(String) : []
    },
    tiers: Array.isArray(row.tiers) ? (row.tiers as Array<Record<string, unknown>>).map(mapTier) : []
  };
};

/** The code a refused pick carries: the rider has used every pick their plan includes. */
export const noPicksLeft = "no_picks_left";

/** The code a refusal carries for an account still outside the beta (202610060003). */
export const betaOnly = "beta_only";

export class PlanRepository {
  // The edge client arrives as a type only: importing it here would pull
  // expo-crypto, and React Native with it, into the Node tests that read
  // mapPlanState.
  constructor(
    private readonly client: SupabaseClient,
    private readonly edge: Pick<EdgeClient, "invoke">
  ) {}

  /** The rider's plan, picks and every plan's contents, in one call. */
  async mine(): Promise<PlanState> {
    const { data, error } = await this.client.rpc("my_plan");
    if (error) throw backendError(error, "Your plan could not be loaded.");
    return mapPlanState(data);
  }

  /**
   * Opens a paid lesson with one of the rider's picks. A pick is final. A
   * lesson already open costs nothing and answers the same way.
   */
  async pickLesson(lessonId: string): Promise<PlanState> {
    const { data, error } = await this.client.rpc("pick_academy_lesson", { target_lesson: lessonId });
    if (error) {
      // PT402: PostgREST's 402. The plan is full, which is not a failure.
      if (error.code === "PT402") throw new EquinaBackendError("You have used every lesson pick your plan includes.", noPicksLeft);
      // PT403: PostgREST's 403. The account is still waiting outside the beta.
      if (error.code === "PT403") throw new EquinaBackendError("Equina is invite-only for now.", betaOnly);
      throw backendError(error, "This lesson could not be added to your picks.");
    }
    return mapPlanState(data);
  }

  /**
   * Asks the server to read the rider's subscriptions from RevenueCat and
   * write their plan. The RevenueCat webhook writes the same rows, so this
   * only makes a purchase show at once rather than when the webhook lands.
   */
  async syncPurchases(): Promise<void> {
    await this.edge.invoke<{ synced: boolean }>("sync-purchases");
  }
}
