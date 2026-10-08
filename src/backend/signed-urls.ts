import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * One signed URL per stored file for as long as it stays valid.
 *
 * Supabase signs a fresh token on every call, so the same horse photo used to
 * get a new URL on every load and every refresh. Image caches key on the URL,
 * so each new URL meant downloading the photo again, and the Home hero flashed
 * while it did. A storage path never changes what it points to -- every upload
 * gets a new path (create-upload-ticket) -- so the path is a safe cache key.
 *
 * In memory only: a new launch signs again. Cleared on sign-out, so the next
 * account on the phone starts empty.
 */
const lifetimeSeconds = 3600;
// Handed out only while at least this much of the URL's life is left, so an
// image that starts loading near the end does not fail halfway.
const renewBeforeMs = 5 * 60_000;

type Entry = { url: string; expiresAt: number };
const cache = new Map<string, Entry>();
const keyFor = (bucket: string, path: string) => `${bucket}\u0000${path}`;

export type SignedUrls = { urls: Map<string, string>; error: unknown };

export async function signedUrlsFor(
  client: SupabaseClient,
  bucket: string,
  paths: readonly string[],
  now = Date.now()
): Promise<SignedUrls> {
  const urls = new Map<string, string>();
  const missing: string[] = [];
  for (const path of new Set(paths)) {
    const hit = cache.get(keyFor(bucket, path));
    if (hit && hit.expiresAt - renewBeforeMs > now) urls.set(path, hit.url);
    else missing.push(path);
  }
  if (!missing.length) return { urls, error: null };
  const { data, error } = await client.storage.from(bucket).createSignedUrls(missing, lifetimeSeconds);
  if (error) return { urls, error };
  const expiresAt = now + lifetimeSeconds * 1000;
  for (const entry of data ?? []) {
    if (!entry.path || !entry.signedUrl) continue;
    cache.set(keyFor(bucket, entry.path), { url: entry.signedUrl, expiresAt });
    urls.set(entry.path, entry.signedUrl);
  }
  return { urls, error: null };
}

export const forgetSignedUrls = () => cache.clear();
