import type { SupabaseClient } from "@supabase/supabase-js";
import type { Discipline } from "../domain/types";
import type { HorseCollaborator, HorseRecord, HorseRecordFile, HorseTimelineRecord, UploadAsset } from "./contracts";
import { EdgeClient } from "./edge-client";
import { backendError, requireData } from "./errors";
import { signedUrlsFor } from "./signed-urls";
import { UploadRepository } from "./upload-repository";

const mapHorse = (row: Record<string, unknown>): HorseRecord => ({
  id: String(row.id), ownerId: String(row.owner_id), name: String(row.name),
  breed: row.breed ? String(row.breed) : undefined,
  discipline: row.discipline as Discipline | undefined,
  birthDate: row.birth_date ? String(row.birth_date) : undefined,
  sex: row.sex as HorseRecord["sex"],
  heightCm: row.height_cm == null ? undefined : Number(row.height_cm),
  photoPath: row.photo_path ? String(row.photo_path) : undefined,
  isPrimary: Boolean(row.is_primary),
  archivedAt: row.archived_at ? String(row.archived_at) : undefined,
  createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

const mapTimelineRecord = (row: Record<string, unknown>): HorseTimelineRecord => ({
  id: String(row.id), horseId: String(row.horse_id), createdBy: String(row.created_by),
  recordType: row.record_type as HorseTimelineRecord["recordType"],
  status: row.status as HorseTimelineRecord["status"], title: String(row.title),
  occurredOn: String(row.occurred_on), dueOn: row.due_on ? String(row.due_on) : undefined,
  providerName: row.provider_name ? String(row.provider_name) : undefined,
  notes: row.notes ? String(row.notes) : undefined,
  source: row.source as HorseTimelineRecord["source"],
  details: (row.details ?? {}) as Record<string, unknown>,
  createdAt: String(row.created_at), updatedAt: String(row.updated_at)
});

const mapCollaborator = (row: Record<string, unknown>): HorseCollaborator => ({
  horseId: String(row.horse_id), userId: String(row.user_id),
  accessRole: row.access_role as HorseCollaborator["accessRole"], invitedBy: String(row.invited_by),
  acceptedAt: row.accepted_at ? String(row.accepted_at) : undefined, createdAt: String(row.created_at)
});

const mapRecordFile = (row: Record<string, unknown>): HorseRecordFile => ({
  id: String(row.id), recordId: String(row.record_id), uploadedBy: String(row.uploaded_by),
  objectPath: String(row.object_path), originalName: String(row.original_name),
  mimeType: String(row.mime_type), byteSize: Number(row.byte_size), createdAt: String(row.created_at)
});

export class RecordsRepository {
  readonly uploads: UploadRepository;
  private readonly edge: EdgeClient;

  constructor(private readonly client: SupabaseClient) {
    this.uploads = new UploadRepository(client);
    this.edge = new EdgeClient(client);
  }

  async listHorses(includeArchived = false): Promise<HorseRecord[]> {
    let query = this.client.from("horses").select("*").order("is_primary", { ascending: false }).order("created_at");
    if (!includeArchived) query = query.is("archived_at", null);
    const { data, error } = await query;
    if (error) throw backendError(error, "Horses could not be loaded.");
    const horses = (data ?? []).map((row) => mapHorse(row as Record<string, unknown>));
    const paths = horses.flatMap((horse) => horse.photoPath ? [horse.photoPath] : []);
    if (!paths.length) return horses;
    const { urls, error: signedError } = await signedUrlsFor(this.client, "horse-media", paths);
    if (signedError) throw backendError(signedError, "Horse photos could not be loaded.");
    return horses.map((horse) => horse.photoPath ? { ...horse, photoUrl: urls.get(horse.photoPath) } : horse);
  }

  async createHorse(input: { name: string; breed?: string; discipline?: Discipline; birthDate?: string; sex?: HorseRecord["sex"]; heightCm?: number; isPrimary?: boolean }): Promise<HorseRecord> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("horses").insert({
      owner_id: auth.user.id, name: input.name.trim(), breed: input.breed?.trim() || null,
      discipline: input.discipline ?? null, birth_date: input.birthDate ?? null,
      sex: input.sex ?? null, height_cm: input.heightCm ?? null, is_primary: input.isPrimary ?? false
    }).select("*").single();
    return mapHorse(requireData(data as Record<string, unknown> | null, error, "Horse could not be created."));
  }

  async updateHorse(id: string, input: Partial<Omit<HorseRecord, "id" | "ownerId" | "createdAt" | "updatedAt">>): Promise<HorseRecord> {
    const payload: Record<string, unknown> = {};
    if (input.name !== undefined) payload.name = input.name.trim();
    if (input.breed !== undefined) payload.breed = input.breed?.trim() || null;
    if (input.discipline !== undefined) payload.discipline = input.discipline;
    if (input.birthDate !== undefined) payload.birth_date = input.birthDate;
    if (input.sex !== undefined) payload.sex = input.sex;
    if (input.heightCm !== undefined) payload.height_cm = input.heightCm;
    if (input.isPrimary !== undefined) payload.is_primary = input.isPrimary;
    const { data, error } = await this.client.from("horses").update(payload).eq("id", id).select("*").single();
    return mapHorse(requireData(data as Record<string, unknown> | null, error, "Horse could not be updated."));
  }

  async archiveHorse(id: string): Promise<void> {
    const { error } = await this.client.from("horses").update({ archived_at: new Date().toISOString(), is_primary: false }).eq("id", id);
    if (error) throw backendError(error, "Horse could not be archived.");
  }

  async uploadHorsePhoto(horseId: string, asset: UploadAsset): Promise<{ path: string }> {
    return await this.uploads.upload("horse_photo", horseId, asset);
  }

  async timeline(horseId: string): Promise<HorseTimelineRecord[]> {
    const { data, error } = await this.client.from("horse_records").select("*").eq("horse_id", horseId).is("archived_at", null).order("occurred_on", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw backendError(error, "Horse records could not be loaded.");
    return (data ?? []).map((row) => mapTimelineRecord(row as Record<string, unknown>));
  }

  async createRecord(input: Omit<HorseTimelineRecord, "id" | "createdBy" | "createdAt" | "updatedAt">): Promise<HorseTimelineRecord> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("horse_records").insert({
      horse_id: input.horseId, created_by: auth.user.id, record_type: input.recordType,
      status: input.status, title: input.title.trim(), occurred_on: input.occurredOn,
      due_on: input.dueOn ?? null, provider_name: input.providerName?.trim() || null,
      notes: input.notes?.trim() || null, source: input.source, details: input.details
    }).select("*").single();
    return mapTimelineRecord(requireData(data as Record<string, unknown> | null, error, "Record could not be created."));
  }

  async updateRecord(id: string, patch: Partial<Pick<HorseTimelineRecord, "status" | "title" | "occurredOn" | "dueOn" | "providerName" | "notes" | "source" | "details">>): Promise<HorseTimelineRecord> {
    const payload: Record<string, unknown> = {};
    if (patch.status !== undefined) payload.status = patch.status;
    if (patch.title !== undefined) payload.title = patch.title.trim();
    if (patch.occurredOn !== undefined) payload.occurred_on = patch.occurredOn;
    if (patch.dueOn !== undefined) payload.due_on = patch.dueOn ?? null;
    if (patch.providerName !== undefined) payload.provider_name = patch.providerName?.trim() || null;
    if (patch.notes !== undefined) payload.notes = patch.notes?.trim() || null;
    if (patch.source !== undefined) payload.source = patch.source;
    if (patch.details !== undefined) payload.details = patch.details;
    const { data, error } = await this.client.from("horse_records").update(payload).eq("id", id).select("*").single();
    return mapTimelineRecord(requireData(data as Record<string, unknown> | null, error, "Record could not be updated."));
  }

  async deleteRecord(id: string): Promise<void> {
    await this.edge.invoke("delete-horse-record", { recordId: id });
  }

  async attachRecordFile(recordId: string, asset: UploadAsset): Promise<{ path: string }> {
    return await this.uploads.upload("horse_record", recordId, asset);
  }

  async recordFiles(recordId: string): Promise<HorseRecordFile[]> {
    const { data, error } = await this.client.from("horse_record_files").select("*").eq("record_id", recordId).order("created_at");
    if (error) throw backendError(error, "Record files could not be loaded.");
    return await Promise.all((data ?? []).map(async (row) => {
      const file = mapRecordFile(row as Record<string, unknown>);
      return { ...file, signedUrl: await this.uploads.signedUrl("horse-records", file.objectPath) };
    }));
  }

  async removeRecordFile(fileId: string): Promise<void> {
    await this.edge.invoke("delete-upload-asset", { kind: "horse_record_file", assetId: fileId });
  }

  async collaborators(horseId: string): Promise<HorseCollaborator[]> {
    const { data, error } = await this.client.from("horse_collaborators").select("*").eq("horse_id", horseId).order("created_at");
    if (error) throw backendError(error, "Horse collaborators could not be loaded.");
    return (data ?? []).map((row) => mapCollaborator(row as Record<string, unknown>));
  }

  async inviteCollaborator(horseId: string, userId: string, accessRole: HorseCollaborator["accessRole"]): Promise<HorseCollaborator> {
    const { data, error } = await this.client.rpc("set_horse_collaborator", {
      target_horse_id: horseId, target_user_id: userId, target_access_role: accessRole
    });
    return mapCollaborator(requireData(data as Record<string, unknown> | null, error, "Collaborator could not be invited."));
  }

  async acceptCollaboration(horseId: string): Promise<HorseCollaborator> {
    const { data: auth } = await this.client.auth.getUser();
    if (!auth.user) throw backendError(new Error("Authentication required."), "Authentication required.");
    const { data, error } = await this.client.from("horse_collaborators")
      .update({ accepted_at: new Date().toISOString() }).eq("horse_id", horseId).eq("user_id", auth.user.id)
      .select("*").single();
    return mapCollaborator(requireData(data as Record<string, unknown> | null, error, "Collaboration could not be accepted."));
  }

  async removeCollaborator(horseId: string, userId: string): Promise<void> {
    const { error } = await this.client.from("horse_collaborators").delete().eq("horse_id", horseId).eq("user_id", userId);
    if (error) throw backendError(error, "Collaborator could not be removed.");
  }
}
