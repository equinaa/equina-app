import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { UploadAsset, UploadKind } from "../src/backend/contracts";
import {
  readUploadBytes,
  runUpload,
  type UploadMetadata,
  type UploadSteps,
  type UploadTicketRequest
} from "../src/backend/upload-flow";
import { recordFileMaxBytes, recordFileTooLarge, recordFileTooLargeMessage } from "../src/features/records/record-file-limit";

const root = process.cwd();
const ticket = { ticketId: "ticket-1", bucket: "horse-media", path: "rider/horse/horse/file.jpg", token: "signed", expiresAt: "2026-11-24T12:00:00Z" };
const fileOf = (bytes: number) => `data:image/jpeg;base64,${Buffer.alloc(bytes, 7).toString("base64")}`;
const photo = (uri: string, byteSize: number): UploadAsset => ({ uri, fileName: "horse.jpg", mimeType: "image/jpeg", byteSize });

/** Records what an upload asked for, in the order it asked. */
const recording = (overrides: Partial<UploadSteps> = {}) => {
  const seen: {
    order: string[];
    requested?: UploadTicketRequest;
    sent?: { bytes: number; mimeType: string };
    completed?: { ticketId: string; metadata: UploadMetadata };
  } = { order: [] };
  const steps: UploadSteps = {
    createTicket: async (request) => {
      seen.order.push("ticket");
      seen.requested = request;
      return ticket;
    },
    send: async (issued, bytes, mimeType) => {
      seen.order.push("send");
      assert.equal(issued, ticket);
      seen.sent = { bytes: bytes.byteLength, mimeType };
    },
    complete: async (ticketId, metadata) => {
      seen.order.push("complete");
      seen.completed = { ticketId, metadata };
      return { path: ticket.path };
    },
    ...overrides
  };
  return { steps, seen };
};

// --- The declared size is the size of the bytes that are sent ------------------------------------

// Android, a cropped horse photo: expo-image-picker returns the re-compressed
// file and the size of the file it was made from. This was "File changed
// before upload." on every such photo.
{
  const { steps, seen } = recording();
  const result = await runUpload(steps, "horse_photo", "horse-1", photo(fileOf(1203), 2_480_112));
  assert.deepEqual(seen.requested, {
    kind: "horse_photo", entityId: "horse-1", fileName: "horse.jpg", mimeType: "image/jpeg", byteSize: 1203
  });
  assert.deepEqual(seen.sent, { bytes: 1203, mimeType: "image/jpeg" });
  assert.deepEqual(seen.order, ["ticket", "send", "complete"]);
  assert.deepEqual(seen.completed, { ticketId: "ticket-1", metadata: {} });
  assert.deepEqual(result, { path: ticket.path });
}

// Whatever the picker said -- too much, too little, nothing, or the truth --
// and whatever is being uploaded, the ticket is for what was read.
for (const kind of ["avatar", "horse_photo", "horse_record", "club_post", "listing_photo", "dispute_evidence"] as UploadKind[]) {
  for (const reported of [0, 1, 4096, 4097, 9_999_999]) {
    const { steps, seen } = recording();
    await runUpload(steps, kind, "entity-1", photo(fileOf(4096), reported));
    assert.equal(seen.requested?.byteSize, 4096, `${kind}, picker said ${reported}`);
    assert.equal(seen.sent?.bytes, seen.requested?.byteSize, "complete-upload keeps a file only at its ticket's size.");
  }
}

// What the server is told beside the size is unchanged.
{
  const { steps, seen } = recording();
  await runUpload(steps, "listing_photo", "listing-1", { ...photo(fileOf(10), 10), fileName: "side.png", mimeType: "image/png" },
    { requiredAngle: "side", position: 2 });
  assert.deepEqual(seen.requested, { kind: "listing_photo", entityId: "listing-1", fileName: "side.png", mimeType: "image/png", byteSize: 10 });
  assert.equal(seen.sent?.mimeType, "image/png");
  assert.deepEqual(seen.completed, { ticketId: "ticket-1", metadata: { requiredAngle: "side", position: 2 } });
}

// --- A file that cannot be read never leaves a ticket behind -------------------------------------

{
  const { steps, seen } = recording();
  await assert.rejects(
    runUpload(steps, "avatar", "rider-1", photo("file:///gone.jpg", 500), {}, async () => {
      throw new Error("ENOENT");
    }),
    /ENOENT/
  );
  assert.deepEqual(seen.order, [], "Before, the ticket was issued first and then orphaned.");
}

// An empty read is a missing file. The server would answer "too large" to a
// size of zero, which says the opposite.
{
  const { steps, seen } = recording();
  await assert.rejects(runUpload(steps, "avatar", "rider-1", photo("data:image/jpeg;base64,", 500)), /could not be read/);
  assert.deepEqual(seen.order, []);
}

// Reading: the real bytes, and one plain sentence for every way it can fail
// (the horse and record screens show this message as it is).
{
  assert.equal((await readUploadBytes(fileOf(77))).byteLength, 77);
  assert.deepEqual([...new Uint8Array(await readUploadBytes("data:application/octet-stream;base64,AQID"))], [1, 2, 3]);

  const realFetch = globalThis.fetch;
  try {
    globalThis.fetch = (async () => new Response("missing", { status: 404 })) as typeof fetch;
    await assert.rejects(readUploadBytes("file:///missing.jpg"), /^EquinaBackendError: The selected file could not be read\.$/);
    globalThis.fetch = (async () => {
      throw new TypeError("Network request failed");
    }) as typeof fetch;
    // Not "Network request failed": the records screen reads that as being offline.
    await assert.rejects(readUploadBytes("file:///revoked.jpg"), /^EquinaBackendError: The selected file could not be read\.$/);
  } finally {
    globalThis.fetch = realFetch;
  }
}

// --- The limits stay the server's ---------------------------------------------------------------

// A refused ticket (too large for its kind, wrong type) sends nothing.
{
  const { steps, seen } = recording({
    createTicket: async () => {
      throw new Error("This file is too large.");
    }
  });
  await assert.rejects(runUpload(steps, "horse_record", "record-1", photo(fileOf(64), 64)), /too large/);
  assert.deepEqual(seen.order, []);
}

// A failed transfer is not registered.
{
  const { steps, seen } = recording({
    send: async () => {
      throw new Error("Upload failed.");
    }
  });
  await assert.rejects(runUpload(steps, "club_post", "post-1", photo(fileOf(64), 64)), /Upload failed/);
  assert.deepEqual(seen.order, ["ticket"]);
}

// The two rules this relies on are still what the functions enforce.
{
  const createTicket = readFileSync(join(root, "supabase", "functions", "create-upload-ticket", "index.ts"), "utf8");
  const completeUpload = readFileSync(join(root, "supabase", "functions", "complete-upload", "index.ts"), "utf8");
  assert.match(createTicket, /input\.byteSize < 1 \|\| input\.byteSize > rule\.max/, "A ticket is refused over the limit for its kind.");
  assert.match(createTicket, /byte_size: input\.byteSize/);
  assert.match(completeUpload, /actualSize !== ticket\.byte_size/, "A file is kept only at the size on its ticket.");
}

// A record's file is refused when it is chosen, before the upload reads it into memory.
{
  const tooLarge = "This file is too large. A record takes a file of up to 20 MB.";
  assert.equal(recordFileMaxBytes, 20 * 1024 * 1024);
  assert.equal(recordFileTooLarge(recordFileMaxBytes), false, "A file at the limit is taken.");
  assert.equal(recordFileTooLarge(recordFileMaxBytes + 1), true);
  assert.equal(recordFileTooLarge(150 * 1024 * 1024), true);
  // No size reported is not a refusal: the file is measured next, and checked again.
  assert.equal(recordFileTooLarge(undefined), false);
  assert.equal(recordFileTooLarge(null), false);
  assert.equal(recordFileTooLargeMessage, tooLarge);

  // The same limit as the server's, so the two answers never disagree.
  const createTicket = readFileSync(join(root, "supabase", "functions", "create-upload-ticket", "index.ts"), "utf8");
  assert.match(createTicket, /horse_record: \{ bucket: "horse-records", max: 20 \* 1024 \* 1024,/, "The record limit on the server is 20 MB.");

  // Checked on the size the picker gave, and again on the measured size, before the file is kept.
  const sheets = readFileSync(join(root, "src", "features", "records", "HorseRecordSheets.tsx"), "utf8");
  assert.match(sheets, /if \(recordFileTooLarge\(result\.assets\[0\]\.size\)\) \{\s+setLocalError\(recordFileTooLargeMessage\);\s+return;/);
  assert.match(sheets, /if \(recordFileTooLarge\(chosen\.byteSize\)\) \{\s+setLocalError\(recordFileTooLargeMessage\);\s+return;/);
}

// --- Every upload in the app takes this path -----------------------------------------------------

{
  const sources = (directory: string): string[] =>
    readdirSync(directory).flatMap((name) => {
      const path = join(directory, name);
      return statSync(path).isDirectory() ? sources(path) : /\.(ts|tsx)$/.test(name) ? [path] : [];
    });
  const client = sources(join(root, "src")).map((path) => ({ path: relative(root, path), source: readFileSync(path, "utf8") }));
  const invoking = (name: string) => client.filter(({ source }) => source.includes(`"${name}"`)).map(({ path }) => path);
  const repository = join("src", "backend", "upload-repository.ts");
  assert.deepEqual(invoking("create-upload-ticket"), [repository]);
  assert.deepEqual(invoking("complete-upload"), [repository]);
  assert.deepEqual(client.filter(({ source }) => /uploadToSignedUrl\(/.test(source)).map(({ path }) => path), [repository]);

  const source = (name: string) => readFileSync(join(root, "src", "backend", name), "utf8");
  assert.match(source("upload-repository.ts"), /return await runUpload\(/);
  // Onboarding and the horse editor, a record's file, the avatar, a Club photo.
  assert.match(source("records-repository.ts"), /this\.uploads\.upload\("horse_photo", horseId, asset\)/);
  assert.match(source("records-repository.ts"), /this\.uploads\.upload\("horse_record", recordId, asset\)/);
  assert.match(source("account-repository.ts"), /this\.uploads\.upload\("avatar", user\.id, asset\)/);
  assert.match(source("club-repository.ts"), /this\.uploads\.upload\("club_post", postId, asset, \{ position \}\)/);

  // And on that path nothing reads the size a picker reported.
  assert.doesNotMatch(source("upload-repository.ts") + source("upload-flow.ts").replace(/\/\*[\s\S]*?\*\//g, ""), /asset\.byteSize/);
}

console.log("Upload size passed.");
