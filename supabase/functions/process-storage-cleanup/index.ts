import { requireAutomationSecret } from "../_shared/automation.ts";
import { json, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  try {
    requireMethod(request, "POST");
    await requireAutomationSecret(
      request,
      "STORAGE_AUTOMATION_SECRET",
      "x-equina-cron-secret",
    );

    const admin = createAdminClient();
    const { data: jobs, error } = await admin.rpc("claim_storage_cleanup_jobs", {
      batch_size: 100,
      lease_seconds: 300,
    });
    if (error) throw error;

    let completed = 0;
    let failed = 0;
    for (const job of jobs ?? []) {
      const { error: removeError } = await admin.storage.from(job.bucket_id).remove([job.object_path]);
      if (!removeError) {
        const { data: accepted, error: completeError } = await admin.rpc(
          "complete_storage_cleanup_job",
          { job_id: job.id, job_lease_token: job.lease_token },
        );
        if (completeError) throw completeError;
        if (accepted) completed += 1;
        continue;
      }

      const { data: accepted, error: failureError } = await admin.rpc(
        "fail_storage_cleanup_job",
        {
          job_id: job.id,
          job_lease_token: job.lease_token,
          error_code: "storage_removal_failed",
        },
      );
      if (failureError) throw failureError;
      if (accepted) failed += 1;
    }

    return json(
      { processed: (jobs ?? []).length, completed, failed },
      200,
      { "x-request-id": requestId },
    );
  } catch (error) {
    return respondToError(error, requestId, "process-storage-cleanup");
  }
});
