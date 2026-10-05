import { handleOptions, json, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { purchaseSettings, reconcileRiderPurchases } from "../_shared/revenuecat-sync.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

// The app calls this right after a purchase or a restore, and when RevenueCat
// tells it the rider's purchases changed, so a plan opens without waiting for
// the webhook. It reads the caller's own customer from RevenueCat -- never an
// id from the request -- and writes only what RevenueCat holds, so calling it
// can never give a rider more than they bought.

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const settings = purchaseSettings();
    await reconcileRiderPurchases(createAdminClient(), user.id, settings);
    return json({ synced: true }, 200, { "x-request-id": requestId });
  } catch (error) {
    return respondToError(error, requestId, "sync-purchases");
  }
});
