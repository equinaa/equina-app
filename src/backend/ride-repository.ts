import type { SupabaseClient } from "@supabase/supabase-js";
import type { Discipline } from "../domain/types";
import type { RideEntry, RideEntryInput, RidePhaseEntry } from "./contracts";
import { backendError, requireData } from "./errors";

// Phases are stored as the database speaks: snake_case keys in a jsonb array,
// checked by private.ride_phases_valid (202610070001).
const mapPhases = (value: unknown): RidePhaseEntry[] | undefined => {
  if (!Array.isArray(value)) return undefined;
  return value.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const phase = item as Record<string, unknown>;
    if (typeof phase.title !== "string" || typeof phase.planned_seconds !== "number") return [];
    return [{
      title: phase.title,
      ...(typeof phase.detail === "string" && phase.detail ? { detail: phase.detail } : {}),
      plannedSeconds: phase.planned_seconds,
      ...(typeof phase.actual_seconds === "number" ? { actualSeconds: phase.actual_seconds } : {})
    }];
  });
};

const phasesRow = (phases: RidePhaseEntry[] | undefined) =>
  phases?.length
    ? phases.map((phase) => ({
        title: phase.title.trim(),
        detail: phase.detail?.trim() || null,
        planned_seconds: phase.plannedSeconds,
        actual_seconds: phase.actualSeconds ?? null
      }))
    : null;

const mapRideEntry = (row: Record<string, unknown>): RideEntry => ({
  id: String(row.id), riderId: String(row.rider_id),
  horseId: row.horse_id ? String(row.horse_id) : undefined,
  discipline: row.discipline as Discipline,
  trainingType: row.training_type ? String(row.training_type) : undefined,
  focus: String(row.focus),
  plannedDuration: row.planned_duration ? String(row.planned_duration) : undefined,
  startedAt: String(row.started_at), completedAt: String(row.completed_at),
  elapsedSeconds: Number(row.elapsed_seconds),
  completedPhases: Number(row.completed_phases), totalPhases: Number(row.total_phases),
  phases: mapPhases(row.phases),
  mood: row.mood ? (row.mood as RideEntry["mood"]) : undefined,
  riderNote: row.rider_note ? String(row.rider_note) : undefined,
  createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

export class RideRepository {
  constructor(private readonly client: SupabaseClient) {}

  /** Newest first. The journal is always read in reverse chronology. */
  async list(limit = 30): Promise<RideEntry[]> {
    const { data, error } = await this.client.from("ride_entries")
      .select("*").order("completed_at", { ascending: false }).limit(limit);
    if (error) throw backendError(error, "Rides could not be loaded.");
    return (data ?? []).map((row) => mapRideEntry(row as Record<string, unknown>));
  }

  /** The single most recent ride, for the home recap. Null when none exists yet. */
  async latest(): Promise<RideEntry | null> {
    const { data, error } = await this.client.from("ride_entries")
      .select("*").order("completed_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw backendError(error, "The last ride could not be loaded.");
    return data ? mapRideEntry(data as Record<string, unknown>) : null;
  }

  async create(input: RideEntryInput): Promise<RideEntry> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("ride_entries").insert({
      rider_id: auth.user.id, horse_id: input.horseId ?? null,
      discipline: input.discipline, training_type: input.trainingType ?? null,
      focus: input.focus.trim(),
      planned_duration: input.plannedDuration?.trim() || null,
      started_at: input.startedAt, completed_at: input.completedAt,
      elapsed_seconds: input.elapsedSeconds,
      completed_phases: input.completedPhases, total_phases: input.totalPhases,
      phases: phasesRow(input.phases),
      mood: input.mood ?? null, rider_note: input.riderNote?.trim() || null
    }).select("*").single();
    return mapRideEntry(requireData(data as Record<string, unknown> | null, error, "The ride could not be saved."));
  }

  /** A journal you cannot correct is not a journal. */
  async update(id: string, patch: Partial<Pick<RideEntry, "focus" | "mood" | "riderNote" | "elapsedSeconds" | "completedPhases">>): Promise<RideEntry> {
    const payload: Record<string, unknown> = {};
    if (patch.focus !== undefined) payload.focus = patch.focus.trim();
    if (patch.mood !== undefined) payload.mood = patch.mood ?? null;
    if (patch.riderNote !== undefined) payload.rider_note = patch.riderNote?.trim() || null;
    if (patch.elapsedSeconds !== undefined) payload.elapsed_seconds = patch.elapsedSeconds;
    if (patch.completedPhases !== undefined) payload.completed_phases = patch.completedPhases;
    const { data, error } = await this.client.from("ride_entries")
      .update(payload).eq("id", id).select("*").single();
    return mapRideEntry(requireData(data as Record<string, unknown> | null, error, "The ride could not be updated."));
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from("ride_entries").delete().eq("id", id);
    if (error) throw backendError(error, "The ride could not be deleted.");
  }
}
