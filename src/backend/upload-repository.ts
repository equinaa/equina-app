import type { SupabaseClient } from "@supabase/supabase-js";
import type { UploadAsset, UploadKind } from "./contracts";
import { EdgeClient } from "./edge-client";
import { backendError } from "./errors";
import { runUpload, type UploadMetadata, type UploadTicket } from "./upload-flow";

export class UploadRepository {
  private readonly edge: EdgeClient;

  constructor(private readonly client: SupabaseClient) {
    this.edge = new EdgeClient(client);
  }

  // Every upload in the app comes through here: avatar, horse photo, horse
  // record, Club photo, listing photo, dispute evidence. The order of the
  // steps, and why the size is measured, is in upload-flow.ts.
  async upload(
    kind: UploadKind,
    entityId: string,
    asset: UploadAsset,
    metadata: UploadMetadata = {}
  ): Promise<{ path: string }> {
    return await runUpload(
      {
        createTicket: (request) => this.edge.invoke<UploadTicket>("create-upload-ticket", request),
        send: async (ticket, bytes, mimeType) => {
          const { error } = await this.client.storage.from(ticket.bucket).uploadToSignedUrl(ticket.path, ticket.token, bytes, {
            contentType: mimeType,
            upsert: false
          });
          if (error) throw backendError(error, "Upload failed.");
        },
        complete: (ticketId, uploadMetadata) =>
          this.edge.invoke<{ path: string }>("complete-upload", { ticketId, ...uploadMetadata })
      },
      kind,
      entityId,
      asset,
      metadata
    );
  }

  async signedUrl(bucket: string, path: string, expiresInSeconds = 900): Promise<string> {
    const { data, error } = await this.client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
    if (error || !data?.signedUrl) throw backendError(error, "File could not be opened.");
    return data.signedUrl;
  }
}
