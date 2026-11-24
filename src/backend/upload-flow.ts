import type { UploadAsset, UploadKind } from "./contracts";
import { backendError } from "./errors";

export type UploadTicket = { ticketId: string; bucket: string; path: string; token: string; expiresAt: string };
export type UploadMetadata = { requiredAngle?: string; position?: number; note?: string };
export type UploadTicketRequest = {
  kind: UploadKind;
  entityId: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
};

/** What an upload asks of the server and of storage, once the file is read. */
export type UploadSteps = {
  createTicket: (request: UploadTicketRequest) => Promise<UploadTicket>;
  send: (ticket: UploadTicket, bytes: ArrayBuffer, mimeType: string) => Promise<void>;
  complete: (ticketId: string, metadata: UploadMetadata) => Promise<{ path: string }>;
};

const unreadable = () => backendError(new Error("The selected file could not be read."), "File could not be read.");

/** The file as it is on the device now. These bytes are the ones uploaded. */
export const readUploadBytes = async (uri: string): Promise<ArrayBuffer> => {
  let bytes: ArrayBuffer;
  try {
    const response = await fetch(uri);
    if (!response.ok) throw unreadable();
    bytes = await response.arrayBuffer();
  } catch {
    throw unreadable();
  }
  // Nothing read means the file is gone, not that it is empty.
  if (bytes.byteLength === 0) throw unreadable();
  return bytes;
};

/**
 * One upload: read the file, then ask for a ticket for exactly that many
 * bytes, send them, and have the server register the file.
 *
 * The server only keeps a file whose size equals the size on its ticket
 * (complete-upload), and refuses a ticket over the limit for its kind
 * (create-upload-ticket). The size therefore has to be measured, never taken
 * from a picker: on Android expo-image-picker crops and re-compresses into a
 * new file and reports the size of the file it started from, so the declared
 * size was wrong for every cropped photo and the upload was refused. Reading
 * first also means a file that cannot be read never leaves a ticket behind.
 *
 * `asset.byteSize` is what the picker said. Screens may show it or check a
 * limit early with it; nothing here trusts it.
 */
export async function runUpload(
  steps: UploadSteps,
  kind: UploadKind,
  entityId: string,
  asset: UploadAsset,
  metadata: UploadMetadata = {},
  read: (uri: string) => Promise<ArrayBuffer> = readUploadBytes
): Promise<{ path: string }> {
  const bytes = await read(asset.uri);
  const ticket = await steps.createTicket({
    kind,
    entityId,
    fileName: asset.fileName,
    mimeType: asset.mimeType,
    byteSize: bytes.byteLength
  });
  await steps.send(ticket, bytes, asset.mimeType);
  return await steps.complete(ticket.ticketId, metadata);
}
