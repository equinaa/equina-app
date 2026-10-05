import type { SupabaseClient } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";
import {
  fetchRevenueCatSubscriber,
  holdsUnplacedPlan,
  planSubscriptionWrites,
  RevenueCatFailure,
  storePlansFromSubscriber,
  storeSources,
  type PlanSubscriptionRow
} from "./revenuecat.ts";

// Bringing a rider's store plans in line with RevenueCat: the webhook does it
// for every rider an event names, sync-purchases for the rider who just
// bought or restored.

export type PurchaseSettings = { secretApiKey: string; acceptTestStore: boolean };

// Both secrets, or no selling at all. backend-capabilities turns `purchases`
// off with the same rule, so the app never sells a plan the webhook could not
// keep up to date. A missing secret is a store that is not open yet, not a
// crash.
export const purchaseSettings = (): PurchaseSettings => {
  const secretApiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY")?.trim();
  const webhookAuthorization = Deno.env.get("REVENUECAT_WEBHOOK_AUTHORIZATION")?.trim();
  if (!secretApiKey || !webhookAuthorization) {
    throw new HttpError(503, "Plans cannot be bought right now.", "purchases_unavailable");
  }
  return {
    secretApiKey,
    // Only for trying purchases before App Store Connect exists; see
    // planSourceForStore.
    acceptTestStore: Deno.env.get("REVENUECAT_ACCEPT_TEST_STORE")?.trim() === "true",
  };
};

const columns = "user_id, source, tier, status, product_id, original_transaction_id, started_at, trial_ends_at, ends_at, note, granted_by";

// Returns false when there is no rider to sync: the id is not an Equina
// account, or the account was deleted.
export const reconcileRiderPurchases = async (
  admin: SupabaseClient,
  userId: string,
  settings: PurchaseSettings,
): Promise<boolean> => {
  // Asked first, because asking RevenueCat about an id creates a customer
  // there. A deleted account keeps no plans (erase_account_data), and a late
  // event must not write them back.
  const { data: found, error: userError } = await admin.auth.admin.getUserById(userId);
  if (userError) {
    if (userError.status === 404 || userError.code === "user_not_found") return false;
    throw userError;
  }
  if (!found.user || found.user.deleted_at) return false;

  let subscriber: Record<string, unknown>;
  try {
    subscriber = await fetchRevenueCatSubscriber({ appUserId: userId, secretApiKey: settings.secretApiKey });
  } catch (error) {
    if (error instanceof RevenueCatFailure) {
      throw new HttpError(502, "Your purchases could not be checked right now. Try again in a moment.", "purchases_provider_failed");
    }
    throw error;
  }

  // Store rows only. A plan staff gave is never read here, so it can never be
  // written back either.
  const { data: rows, error: readError } = await admin.from("plan_subscriptions")
    .select(columns).eq("user_id", userId).in("source", [...storeSources]);
  if (readError) throw readError;

  const now = new Date();
  const options = { acceptTestStore: settings.acceptTestStore };
  const writes = planSubscriptionWrites(
    userId,
    (rows ?? []) as PlanSubscriptionRow[],
    storePlansFromSubscriber(subscriber, now, options),
    now,
    { keepUnnamed: holdsUnplacedPlan(subscriber, now, options) },
  );
  if (writes.length) {
    const { error } = await admin.from("plan_subscriptions").upsert(writes, { onConflict: "user_id,source" });
    if (error) throw error;
  }
  return true;
};
