// Takes the metadata out of profile photos and horse portraits stored before
// complete-upload cleaned them (docs/EQUINA_MEDIA_PROCESSING_BOUNDARY.md).
//
// It walks the two buckets, runs the same cleaner complete-upload runs on
// every file, and writes a cleaned picture over the stored one at the same
// path. Every file, not only the ones a profile or a horse points at: storage
// lets people read by folder, not by row, so a file left behind by an upload
// that never finished can be read by the same people and is cleaned as well.
// It never deletes a file and never changes a row. A picture it cannot clean
// (HEIC, or a file that is not a well-formed JPEG or PNG) is listed and left
// as it is.
// Listing photos are not covered: none can exist while listing creation is
// off, and their rows also hold a size and a hash that would have to follow.
//
// Without --apply it only lists what it would do:
//
//   export SUPABASE_URL=https://<project-ref>.supabase.co
//   read -s SUPABASE_SERVICE_ROLE_KEY && export SUPABASE_SERVICE_ROLE_KEY
//   npx tsx scripts/clean-stored-photos.ts
//   npx tsx scripts/clean-stored-photos.ts --apply
//
// The key is read from the environment and never printed. `read -s` takes it
// from a paste without showing it or leaving it in the shell history.
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { stripPhotoMetadata } from "../supabase/functions/_shared/image-metadata";

/** The buckets whose pictures complete-upload now cleans, and what each holds. */
export const storedPhotoBuckets = [
  { label: "profile photo", bucket: "avatars" },
  { label: "horse portrait", bucket: "horse-media" }
] as const;

/** What the script needs from Supabase, so the tests can stand in for it. */
export type StoredPhotoStore = {
  /** The path of every file in the bucket. */
  paths(bucket: string): Promise<string[]>;
  /** The stored file, or null when it could not be read. */
  read(bucket: string, path: string): Promise<Uint8Array | null>;
  /** Writes the file over the one at that path. */
  write(bucket: string, path: string, bytes: Uint8Array, contentType: string): Promise<void>;
};

export type StoredPhotoOutcome = {
  bucket: string;
  path: string;
  /**
   * clean: nothing to take out. to clean: would be written with --apply.
   * cleaned: written, and read back as written. not confirmed: written, but
   * storage answered with other bytes afterwards.
   */
  result: "clean" | "to clean" | "cleaned" | "not confirmed" | "cannot clean" | "not read";
  /** The parts taken out, or why the picture was left as it is. */
  detail: string;
};

const typeOf = (bytes: Uint8Array) => {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  return null;
};

const same = (left: Uint8Array, right: Uint8Array) =>
  left.length === right.length && left.every((byte, index) => byte === right[index]);

export async function cleanStoredPhotos(store: StoredPhotoStore, options: { apply: boolean }): Promise<StoredPhotoOutcome[]> {
  const outcomes: StoredPhotoOutcome[] = [];
  for (const { bucket } of storedPhotoBuckets) {
    for (const path of [...new Set(await store.paths(bucket))].sort()) {
      const outcome = (result: StoredPhotoOutcome["result"], detail: string) => outcomes.push({ bucket, path, result, detail });
      const stored = await store.read(bucket, path);
      if (!stored) {
        outcome("not read", "storage did not return the file");
        continue;
      }
      const type = typeOf(stored);
      if (!type) {
        outcome("cannot clean", "not a JPEG or PNG (a HEIC photo, most likely): ask the rider to choose the photo again");
        continue;
      }
      let cleaned: ReturnType<typeof stripPhotoMetadata>;
      try {
        cleaned = stripPhotoMetadata(type, stored);
      } catch {
        outcome("cannot clean", "not a well-formed picture: ask the rider to choose the photo again");
        continue;
      }
      if (!cleaned.changed) {
        outcome("clean", "nothing to take out");
        continue;
      }
      const removed = [...new Set(cleaned.removed)].join(", ") || "padding";
      if (!options.apply) {
        outcome("to clean", removed);
        continue;
      }
      await store.write(bucket, path, cleaned.bytes, type);
      // Read it back, so "cleaned" means the file in storage is the cleaned one.
      const written = await store.read(bucket, path);
      if (written && same(written, cleaned.bytes)) outcome("cleaned", removed);
      else outcome("not confirmed", "written, but storage answered with other bytes: run without --apply again to see what is stored");
    }
  }
  return outcomes;
}

/** The lines the script prints: the totals, and one line per picture that needs a look. */
export const storedPhotoReport = (outcomes: readonly StoredPhotoOutcome[], apply: boolean): string[] => {
  const lines: string[] = [];
  for (const { label, bucket } of storedPhotoBuckets) {
    const own = outcomes.filter((outcome) => outcome.bucket === bucket);
    const count = (result: StoredPhotoOutcome["result"]) => own.filter((outcome) => outcome.result === result).length;
    lines.push(
      `${label}s (${bucket}): ${own.length} stored, ${count("clean")} already clean, ` +
        `${apply ? `${count("cleaned")} cleaned, ${count("not confirmed")} not confirmed` : `${count("to clean")} to clean`}, ` +
        `${count("cannot clean")} cannot be cleaned, ${count("not read")} not read`
    );
    for (const outcome of own.filter((entry) => entry.result !== "clean")) {
      lines.push(`  ${outcome.result}: ${outcome.path} (${outcome.detail})`);
    }
  }
  if (!apply && outcomes.some((outcome) => outcome.result === "to clean")) {
    lines.push("Nothing was written. Run again with --apply to write the cleaned files.");
  }
  return lines;
};

const pageSize = 1000;

const supabaseStore = (url: string, serviceRoleKey: string): StoredPhotoStore => {
  const client = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  return {
    async paths(bucket) {
      const files: string[] = [];
      const walk = async (folder: string) => {
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await client.storage.from(bucket)
            .list(folder, { limit: pageSize, offset, sortBy: { column: "name", order: "asc" } });
          if (error) throw new Error(`${bucket}/${folder} could not be listed: ${error.message}`);
          for (const entry of data) {
            const path = folder ? `${folder}/${entry.name}` : entry.name;
            // A folder comes back with no id. The placeholder is what the
            // dashboard leaves in a folder made by hand.
            if (entry.id === null) await walk(path);
            else if (entry.name !== ".emptyFolderPlaceholder") files.push(path);
          }
          if (data.length < pageSize) return;
        }
      };
      await walk("");
      return files;
    },
    async read(bucket, path) {
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error || !data) return null;
      return new Uint8Array(await data.arrayBuffer());
    },
    async write(bucket, path, bytes, contentType) {
      const { error } = await client.storage.from(bucket).upload(path, bytes, { contentType, upsert: true });
      if (error) throw new Error(`${bucket}/${path} could not be written: ${error.message}`);
    }
  };
};

// Run as a script, not imported by the tests. Compared as real paths, so a
// checkout reached through a symlink still runs.
const runDirectly = (() => {
  try {
    return realpathSync(process.argv[1] ?? "") === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();

if (runDirectly) {
  const apply = process.argv.includes("--apply");
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment first.");
    process.exit(1);
  }
  console.log(`${apply ? "Cleaning" : "Dry run for"} the stored pictures of ${new URL(url).host}`);
  const outcomes = await cleanStoredPhotos(supabaseStore(url, serviceRoleKey), { apply });
  for (const line of storedPhotoReport(outcomes, apply)) console.log(line);
}
