import { requireAutomationSecret } from "../_shared/automation.ts";
import { handleOptions, json, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient } from "../_shared/supabase.ts";
import { queueStorageCleanup } from "../_shared/storage-cleanup.ts";

type ExportCleanupJob = {
  id: string;
  object_path: string | null;
  cleanup_lease_token: string;
};

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    await requireAutomationSecret(
      request,
      "ACCOUNT_AUTOMATION_SECRET",
      "x-automation-secret",
    );
    const admin = createAdminClient();
    const { data: requests, error } = await admin.rpc("claim_data_export_cleanup", {
      batch_size: 100,
      lease_seconds: 300,
    });
    if (error) throw error;

    let expired = 0;
    let failed = 0;
    for (const item of (requests ?? []) as ExportCleanupJob[]) {
      try {
        const path = typeof item.object_path === "string" ? item.object_path : "";
        await queueStorageCleanup(admin, "account-exports", path ? [path] : []);
        const { data: completed, error: completeError } = await admin.rpc(
          "complete_data_export_cleanup",
          {
            target_request_id: item.id,
            job_lease_token: item.cleanup_lease_token,
          },
        );
        if (completeError) throw completeError;
        if (completed) expired += 1;
      } catch {
        await admin.rpc("fail_data_export_cleanup", {
          target_request_id: item.id,
          job_lease_token: item.cleanup_lease_token,
          error_code: "export_cleanup_failed",
        });
        failed += 1;
      }
    }

    return json(
      { processed: (requests ?? []).length, expired, failed },
      200,
      { "x-request-id": requestId },
    );
  } catch (error) {
    return respondToError(error, requestId, "process-data-export-cleanup");
  }
});
