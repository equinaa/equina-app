import { HttpError, json, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { revenueCatEventUserIds, sameSecret } from "../_shared/revenuecat.ts";
import { purchaseSettings, reconcileRiderPurchases } from "../_shared/revenuecat-sync.ts";
import { createAdminClient } from "../_shared/supabase.ts";

// RevenueCat reports here whenever a rider's purchases change: a trial starts,
// a plan renews, lapses, is refunded or moves to another account. Nothing is
// read unless the request carries the Authorization value set on the webhook
// in RevenueCat.
//
// The event is only a nudge. Each rider it names is read back from RevenueCat
// whole and their store rows rewritten to match, so a repeated, late or
// out-of-order event leaves the rows where the latest one would.
//
// RevenueCat retries anything but a 200 for a few hours. An event that can
// never change anything -- a dashboard test, an anonymous customer, an id
// with no Equina account -- is answered 200 at once; RevenueCat being
// unreachable, or the database failing, is not, so the retry tries again.

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  try {
    requireMethod(request, "POST");
    const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTHORIZATION")?.trim();
    if (!expected) throw new HttpError(503, "Purchase webhooks are not configured.", "purchases_unavailable");
    if (!sameSecret(request.headers.get("authorization"), expected)) {
      throw new HttpError(401, "The webhook authorization does not match.", "invalid_authorization");
    }
    const settings = purchaseSettings();

    const body = await request.text();
    if (body.length > 1_000_000) throw new HttpError(413, "Request body is too large.", "request_too_large");
    let payload: unknown;
    try {
      payload = JSON.parse(body);
    } catch {
      throw new HttpError(400, "Request body must be valid JSON.", "invalid_json");
    }

    const riders = revenueCatEventUserIds(payload);
    if (!riders.length) return json({ received: true }, 200, { "x-request-id": requestId });

    // One rider at a time: RevenueCat asks for about one request a second, and
    // if one fails the whole event is retried -- harmless for the riders
    // already done, whose rows already match.
    const admin = createAdminClient();
    for (const userId of riders) await reconcileRiderPurchases(admin, userId, settings);

    return json({ received: true }, 200, { "x-request-id": requestId });
  } catch (error) {
    return respondToError(error, requestId, "revenuecat-webhook");
  }
});
