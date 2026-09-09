import type { SupabaseClient } from "npm:@supabase/supabase-js@2";

export const queueStorageCleanup = async (
  admin: SupabaseClient,
  bucket: string,
  paths: string[],
): Promise<{ pending: boolean }> => {
  const uniquePaths = [...new Set(paths.filter(Boolean))];
  if (!uniquePaths.length) return { pending: false };

  const { error: queueError } = await admin.from("storage_cleanup_jobs").upsert(
    uniquePaths.map((objectPath) => ({
      bucket_id: bucket,
      object_path: objectPath,
      status: "pending",
      attempts: 0,
      next_attempt_at: new Date().toISOString(),
      last_error: null,
      completed_at: null,
      lease_token: null,
      lease_expires_at: null,
    })),
    { onConflict: "bucket_id,object_path" },
  );
  if (queueError) throw queueError;

  const { error: removeError } = await admin.storage.from(bucket).remove(uniquePaths);
  if (!removeError) {
    const { error: completeError } = await admin.from("storage_cleanup_jobs").update({
      status: "completed",
      completed_at: new Date().toISOString(),
      last_error: null,
      lease_token: null,
      lease_expires_at: null,
    }).eq("bucket_id", bucket).in("object_path", uniquePaths);
    if (completeError) throw completeError;
    return { pending: false };
  }

  const { error: failureError } = await admin.from("storage_cleanup_jobs").update({
    status: "failed",
    next_attempt_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    last_error: "Storage removal failed; queued for retry.",
    lease_token: null,
    lease_expires_at: null,
  }).eq("bucket_id", bucket).in("object_path", uniquePaths);
  if (failureError) throw failureError;
  return { pending: true };
};
