import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ProfileRecord } from "../src/backend/contracts";
import { withAvatarUrl } from "../src/backend/profile-photo";
import { forgetSignedUrls } from "../src/backend/signed-urls";

// After an avatar upload or a profile save the app puts the profile it gets
// back on screen as it is. That profile must carry the photo's signed URL, as
// the one loaded with the account does, or the new photo shows as initials and
// a saved name takes the old photo away until the next launch.

const riderId = "8f6c2f4e-2b1c-4d4a-9a55-0f3c1c3e9a01";
const avatarPath = `${riderId}/avatar/2c0f.png`;
const signed = `https://project.example.test/storage/v1/object/sign/avatars/${avatarPath}?token=t`;
const profile = (path: string | undefined): ProfileRecord =>
  ({ id: riderId, displayName: "Ana", locale: "en", avatarPath: path }) as ProfileRecord;

/** Only the storage signing the helper asks for. */
const fakeClient = (signing: "works" | "fails") => {
  const asked: string[] = [];
  const client = {
    storage: {
      from: (bucket: string) => ({
        createSignedUrls: async (paths: string[]) => {
          asked.push(`${bucket}:${paths.join(",")}`);
          return signing === "works"
            ? { data: paths.map((path) => ({ path, signedUrl: signed, error: null })), error: null }
            : { data: null, error: new Error("storage is down") };
        }
      })
    }
  };
  return { client: client as unknown as SupabaseClient, asked };
};

{
  forgetSignedUrls();
  const { client, asked } = fakeClient("works");
  const signedProfile = await withAvatarUrl(client, profile(avatarPath));
  assert.equal(signedProfile.avatarUrl, signed, "The profile handed back shows its photo.");
  assert.equal(signedProfile.displayName, "Ana", "Nothing else changes.");
  assert.deepEqual(asked, [`avatars:${avatarPath}`], "Signed in the avatars bucket, once.");
}

{
  forgetSignedUrls();
  const { client, asked } = fakeClient("works");
  const plain = profile(undefined);
  assert.equal(await withAvatarUrl(client, plain), plain, "No photo, nothing to sign.");
  assert.deepEqual(asked, []);
}

{
  forgetSignedUrls();
  const { client } = fakeClient("fails");
  const unsigned = await withAvatarUrl(client, profile(avatarPath));
  assert.equal(unsigned.avatarPath, avatarPath, "A photo that cannot be signed does not fail the save.");
  assert.equal(unsigned.avatarUrl, undefined);
}

// Both paths that hand a profile back to the screen go through it.
{
  const repository = readFileSync(join(process.cwd(), "src", "backend", "account-repository.ts"), "utf8");
  assert.match(repository, /return await withAvatarUrl\(this\.client, mapProfile\(requireData\(data as Row \| null, error, failure\)\)\);/);
  assert.match(repository, /async updateProfile\([\s\S]*?return await this\.ownProfile\("Profile could not be saved\."\);/);
  assert.match(repository, /async uploadAvatar\([\s\S]*?return await this\.ownProfile\("Avatar could not be saved\."\);/);
}

forgetSignedUrls();
console.log("Own profile photo passed.");
