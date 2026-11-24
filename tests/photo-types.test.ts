import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { photoTypeMessage, photoTypeProblem, storablePhotoTypes } from "../src/backend/photo-types";

// A profile photo or a horse portrait the server would refuse is refused when
// it is picked, in words that say what to do. The phone pickers always hand
// over JPEG or PNG once the photo is cropped; the web picker hands over the
// file as it is.

const root = process.cwd();
const read = (...path: string[]) => readFileSync(join(root, ...path), "utf8");

{
  for (const type of ["image/jpeg", "image/png", "IMAGE/JPEG", " image/png "]) {
    assert.equal(photoTypeProblem(type), null, `${type} is stored.`);
  }
  assert.equal(photoTypeProblem(undefined), null, "No type named reads as JPEG, as the upload asset does.");
  assert.equal(photoTypeProblem(null), null);
  for (const type of ["image/heic", "image/heif", "image/webp", "image/gif", "application/pdf", ""]) {
    assert.equal(photoTypeProblem(type), photoTypeMessage, `${type || "an empty type"} is refused with a clear message.`);
  }
  assert.equal(photoTypeMessage, "Use a JPEG or PNG photo.");
}

// The same list as the server's: the types complete-upload can clean, which
// create-upload-ticket takes for profile photos and horse portraits.
{
  const cleaner = read("supabase", "functions", "_shared", "image-metadata.ts");
  const serverList = cleaner.match(/export const cleanablePhotoTypes: readonly string\[\] = \[([^\]]*)\];/);
  assert.ok(serverList, "The server's list of storable photo types is where it was.");
  const serverTypes = [...serverList[1]!.matchAll(/"([^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...storablePhotoTypes].sort(), serverTypes.sort());
  const ticket = read("supabase", "functions", "create-upload-ticket", "index.ts");
  assert.match(ticket, /avatar: \{ bucket: "avatars", max: [^,]+, mime: cleanablePhotoTypes \}/);
  assert.match(ticket, /horse_photo: \{ bucket: "horse-media", max: [^,]+, mime: cleanablePhotoTypes \}/);
}

// Each place a rider picks such a photo checks it first.
{
  const account = read("src", "features", "account", "useAccount.ts");
  assert.match(account, /if \(photoTypeProblem\(asset\.mimeType\)\) throw new EquinaBackendError\(photoTypeMessage, "unsupported_file_type"\);/);
  assert.match(
    account,
    /uploadError instanceof EquinaBackendError && uploadError\.code === "unsupported_file_type"\s*\? photoTypeMessage/,
    "The server's own refusal gets the same words."
  );
  const horseEditor = read("src", "features", "records", "HorseRecordSheets.tsx");
  assert.match(horseEditor, /const typeProblem = photoTypeProblem\(result\.assets\[0\]\.mimeType\);\s+if \(typeProblem\) \{\s+setLocalError\(typeProblem\);\s+return;/);
  const onboarding = read("src", "features", "onboarding", "OnboardingScreen.tsx");
  assert.match(onboarding, /const typeProblem = picked\?\.uri \? photoTypeProblem\(picked\.mimeType\) : null;\s+if \(typeProblem\) \{\s+setPhotoIssue\(typeProblem\);\s+return;/);
}

console.log("Photo types passed.");
