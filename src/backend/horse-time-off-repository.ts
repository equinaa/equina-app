import type { SupabaseClient } from "@supabase/supabase-js";
import type { HorseTimeOff, HorseTimeOffInput } from "./contracts";
import { backendError, requireData } from "./errors";

const columns = "id, horse_id, kind, starts_on, ends_on, note, created_at";

const mapTimeOff = (row: Record<string, unknown>): HorseTimeOff => ({
  id: String(row.id),
  horseId: String(row.horse_id),
  kind: String(row.kind),
  startsOn: String(row.starts_on),
  endsOn: String(row.ends_on),
  ...(typeof row.note === "string" && row.note ? { note: row.note } : {}),
  ...(row.created_at ? { createdAt: String(row.created_at) } : {})
});

/**
 * A horse's time off (202610250003): added, ended early, or taken back before
 * it starts. Days it has covered stay covered.
 */
export class HorseTimeOffRepository {
  constructor(private readonly client: SupabaseClient) {}

  /**
   * Every period of every horse the rider can see, newest first. The streak
   * walks back through all of them, so none is left out: read a thousand at a
   * time, like the ride history.
   */
  async list(limit = 5000): Promise<HorseTimeOff[]> {
    const page = 1000;
    const periods: HorseTimeOff[] = [];
    for (let from = 0; from < limit; from += page) {
      const { data, error } = await this.client.from("horse_time_off")
        .select(columns).order("starts_on", { ascending: false }).order("id")
        .range(from, Math.min(from + page, limit) - 1);
      if (error) throw backendError(error, "Time off could not be loaded.");
      const rows = (data ?? []) as Record<string, unknown>[];
      periods.push(...rows.map(mapTimeOff));
      if (rows.length < page) break;
    }
    return periods;
  }

  async create(input: HorseTimeOffInput): Promise<HorseTimeOff> {
    const { data, error } = await this.client.from("horse_time_off").insert({
      horse_id: input.horseId,
      kind: input.kind,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      note: input.note?.trim() || null
    }).select(columns).single();
    return mapTimeOff(requireData(data as Record<string, unknown> | null, error, "The time off could not be saved."));
  }

  /** The horse is back in work: the period now ends on `endsOn`, yesterday at the earliest. */
  async end(id: string, endsOn: string): Promise<HorseTimeOff> {
    const { data, error } = await this.client.from("horse_time_off")
      .update({ ends_on: endsOn }).eq("id", id).select(columns).single();
    return mapTimeOff(requireData(data as Record<string, unknown> | null, error, "The time off could not be ended."));
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.client.from("horse_time_off").delete().eq("id", id);
    if (error) throw backendError(error, "The time off could not be removed.");
  }
}
