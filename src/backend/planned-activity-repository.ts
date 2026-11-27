import type { SupabaseClient } from "@supabase/supabase-js";
import type { PlannedActivity, PlannedActivityInput, PlannedActivityStatus } from "./contracts";
import { backendError, requireData } from "./errors";

const columns = "id, horse_id, day, start_minutes, training_type, phases, note, status, ride_entry_id";

const mapPhases = (value: unknown): PlannedActivity["phases"] =>
  Array.isArray(value)
    ? value.map((phase: Record<string, unknown>) => ({
        title: String(phase.title ?? ""),
        ...(typeof phase.detail === "string" && phase.detail ? { detail: phase.detail } : {}),
        plannedSeconds: Number(phase.planned_seconds ?? 0)
      }))
    : [];

const mapPlanned = (row: Record<string, unknown>): PlannedActivity => ({
  id: String(row.id),
  ...(typeof row.horse_id === "string" && row.horse_id ? { horseId: row.horse_id } : {}),
  day: String(row.day),
  startMinutes: Number(row.start_minutes),
  trainingType: String(row.training_type),
  phases: mapPhases(row.phases),
  ...(typeof row.note === "string" && row.note ? { note: row.note } : {}),
  status: (row.status === "done" || row.status === "skipped" ? row.status : "planned") as PlannedActivityStatus,
  ...(typeof row.ride_entry_id === "string" && row.ride_entry_id ? { rideEntryId: row.ride_entry_id } : {})
});

const phaseRows = (phases: PlannedActivityInput["phases"]) =>
  phases.map((phase) => ({
    title: phase.title,
    ...(phase.detail ? { detail: phase.detail } : {}),
    planned_seconds: phase.plannedSeconds
  }));

/**
 * Activities the rider schedules for a day ahead (202611270001), and their
 * answer once the day comes: done (a logged activity) or skipped.
 */
export class PlannedActivityRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** Every scheduled activity from `fromDay` on, in day and time order. */
  async listFrom(fromDay: string): Promise<PlannedActivity[]> {
    const { data, error } = await this.client.from("planned_activities")
      .select(columns).gte("day", fromDay).order("day", { ascending: true }).order("start_minutes", { ascending: true }).limit(500);
    if (error) throw backendError(error, "Your scheduled activities could not be loaded.");
    return ((data ?? []) as Record<string, unknown>[]).map(mapPlanned);
  }

  async create(input: PlannedActivityInput): Promise<PlannedActivity> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("planned_activities").insert({
      rider_id: auth.user.id,
      horse_id: input.horseId ?? null,
      day: input.day,
      start_minutes: input.startMinutes,
      training_type: input.trainingType,
      phases: phaseRows(input.phases),
      note: input.note?.trim() || null
    }).select(columns).single();
    return mapPlanned(requireData(data as Record<string, unknown> | null, error, "The activity could not be scheduled."));
  }

  /** Done: the logged activity it became. */
  async markDone(id: string, rideEntryId: string): Promise<PlannedActivity> {
    const { data, error } = await this.client.from("planned_activities")
      .update({ status: "done", ride_entry_id: rideEntryId }).eq("id", id).select(columns).single();
    return mapPlanned(requireData(data as Record<string, unknown> | null, error, "The activity could not be marked done."));
  }

  /** It did not happen. */
  async skip(id: string): Promise<PlannedActivity> {
    const { data, error } = await this.client.from("planned_activities")
      .update({ status: "skipped" }).eq("id", id).select(columns).single();
    return mapPlanned(requireData(data as Record<string, unknown> | null, error, "The activity could not be updated."));
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from("planned_activities").delete().eq("id", id);
    if (error) throw backendError(error, "The activity could not be removed.");
  }
}
