import type { SupabaseClient } from "@supabase/supabase-js";
import type { TrainingPlan, TrainingPlanDay } from "./contracts";
import { backendError, requireData } from "./errors";

// Days are stored as the database speaks: snake_case keys in a jsonb array,
// checked by private.training_plan_days_valid (202610250002).
const mapDays = (value: unknown): TrainingPlanDay[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const day = item as Record<string, unknown>;
    if (typeof day.weekday !== "number" || typeof day.training_type !== "string") return [];
    return [{
      weekday: day.weekday,
      trainingType: day.training_type,
      ...(typeof day.horse_id === "string" && day.horse_id ? { horseId: day.horse_id } : {})
    }];
  });
};

const daysRow = (days: TrainingPlanDay[]) =>
  [...days]
    .sort((left, right) => left.weekday - right.weekday)
    .map((day) => ({ weekday: day.weekday, training_type: day.trainingType, horse_id: day.horseId ?? null }));

const mapPlan = (row: Record<string, unknown>): TrainingPlan => ({
  id: String(row.id),
  effectiveFrom: String(row.effective_from),
  days: mapDays(row.days),
  reminders: row.reminders !== false
});

export class TrainingPlanRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** Every version of the rider's week, oldest first: the streak is counted against all of them. */
  async list(): Promise<TrainingPlan[]> {
    const { data, error } = await this.client.from("training_plans")
      .select("id, effective_from, days, reminders").order("effective_from", { ascending: true });
    if (error) throw backendError(error, "Your training plan could not be loaded.");
    return (data ?? []).map((row) => mapPlan(row as Record<string, unknown>));
  }

  /**
   * The week from `effectiveFrom` (the rider's today) on. Saving again on the
   * same day changes that day's version; any other day starts a new one, and
   * the versions before it stay as they were.
   *
   * Found by the day, not by an id the app remembers: another device, or a
   * save whose answer was lost, may already have written today's version.
   */
  async save(effectiveFrom: string, days: TrainingPlanDay[], reminders: boolean): Promise<TrainingPlan> {
    const columns = "id, effective_from, days, reminders";
    const updateToday = async () => {
      const { data, error } = await this.client.from("training_plans")
        .update({ days: daysRow(days), reminders }).eq("effective_from", effectiveFrom)
        .select(columns).maybeSingle();
      if (error) throw backendError(error, "Your training plan could not be saved.");
      return data ? mapPlan(data as Record<string, unknown>) : null;
    };
    const updated = await updateToday();
    if (updated) return updated;
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("training_plans")
      .insert({ user_id: auth.user.id, effective_from: effectiveFrom, days: daysRow(days), reminders })
      .select(columns).single();
    if (error?.code === "23514") {
      // The raw check name means nothing to a rider.
      throw backendError({ code: error.code }, "That week has more rides than a plan can hold. Take a few out and save again.");
    }
    // Another device wrote today's version in between: change that one.
    if (error?.code === "23505") {
      const raced = await updateToday();
      if (raced) return raced;
    }
    return mapPlan(requireData(data as Record<string, unknown> | null, error, "Your training plan could not be saved."));
  }
}
