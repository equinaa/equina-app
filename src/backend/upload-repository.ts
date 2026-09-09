import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadAsset, UploadKind } from "./contracts";
import { EdgeClient } from "./edge-client";
import { backendError } from "./errors";

type Ticket = { ticketId: string; bucket: string; path: string; token: string; expiresAt: string };

export class UploadRepository {
  private readonly edge: EdgeClient;

  constructor(private readonly client: SupabaseClient) {
    this.edge = new EdgeClient(client);
  }

  async upload(
    kind: UploadKind,
    entityId: string,
    asset: UploadAsset,
    metadata: { requiredAngle?: string; position?: number; note?: string } = {}
  ): Promise<{ path: string }> {
    const ticket = await this.edge.invoke<Ticket>("create-upload-ticket", {
      kind,
      entityId,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      byteSize: asset.byteSize
    });

    const response = await fetch(asset.uri);
    if (!response.ok) throw backendError(new Error("The selected file could not be read."), "File could not be read.");
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength !== asset.byteSize) throw backendError(new Error("Selected file changed before upload."), "File changed before upload.");

    const { error } = await this.client.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, bytes, {
      contentType: asset.mimeType,
      upsert: false
    });
    if (error) throw backendError(error, "Upload failed.");

    return await this.edge.invoke<{ path: string }>("complete-upload", { ticketId: ticket.ticketId, ...metadata });
  }

  async signedUrl(bucket: string, path: string, expiresInSeconds = 900): Promise<string> {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) throw backendError(error, "File could not be opened.");
    return data.signedUrl;
  }
}

