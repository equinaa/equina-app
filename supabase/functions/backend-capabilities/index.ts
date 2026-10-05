import { HttpError, handleOptions, json, requestIdFor, respondToError, requireMethod } from "../_shared/http.ts";
import { featureFlagsForSession, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "GET");
    let flags: Record<string, boolean> = {};
    try {
      const { token } = await requireUser(request);
      flags = await featureFlagsForSession(token);
    } catch (error) {
      if (!(error instanceof HttpError) || error.status !== 401) throw error;
    }
    const paymentsConfigured = Boolean(
      Deno.env.get("STRIPE_SECRET_KEY") &&
      Deno.env.get("STRIPE_WEBHOOK_SECRET") &&
      Deno.env.get("MARKETPLACE_TERMS_VERSION") &&
      Deno.env.get("CONNECT_RETURN_URL") &&
      Deno.env.get("CONNECT_REFRESH_URL"),
    );
    const moderationConfigured = Boolean(
      Deno.env.get("CONTENT_MODERATION_URL") &&
      Deno.env.get("CONTENT_MODERATION_TOKEN") &&
      Deno.env.get("MODERATION_AUTOMATION_SECRET"),
    );
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const coachConfigured = Boolean(
      (
        Deno.env.get("EQUINA_AI_API_URL") &&
        Deno.env.get("EQUINA_AI_API_KEY") &&
        Deno.env.get("EQUINA_AI_MODEL")
      ) ||
      (
        Deno.env.get("EQUINA_AI_DEVELOPMENT_FALLBACK") === "true" &&
        (supabaseUrl.includes("127.0.0.1") || supabaseUrl.includes("localhost"))
      ),
    );
    const accountOperationsConfigured = Boolean(Deno.env.get("ACCOUNT_AUTOMATION_SECRET"));
    const pushConfigured = Boolean(Deno.env.get("NOTIFICATION_AUTOMATION_SECRET"));
    // Selling a plan needs RevenueCat's secret key, to read what a rider
    // bought, and the webhook's Authorization value, so renewals, lapses and
    // refunds arrive afterwards. sync-purchases and revenuecat-webhook refuse
    // without the same two.
    const purchasesConfigured = Boolean(
      Deno.env.get("REVENUECAT_SECRET_API_KEY")?.trim() &&
      Deno.env.get("REVENUECAT_WEBHOOK_AUTHORIZATION")?.trim(),
    );

    return json({
      version: "2026-09-09",
      capabilities: {
        auth: true,
        accountSettings: Boolean(flags.account_settings && accountOperationsConfigured),
        coachChat: Boolean(flags.coach_chat && coachConfigured),
        pushNotifications: Boolean(flags.push_notifications && pushConfigured),
        records: Boolean(flags.record_mutations),
        horseManagement: Boolean(flags.horse_management),
        rideLogging: Boolean(flags.ride_logging),
        // Club is post-moderated (202610020006): the phrase filter, report
        // threshold and blocking live in the database, so posting does not wait
        // for the moderation provider. Listings still do; they are reviewed
        // before they go live.
        clubPublishing: Boolean(flags.club_publishing),
        clubInteractions: Boolean(flags.club_interactions),
        listingCreation: Boolean(flags.shop_listing_creation && moderationConfigured),
        messaging: Boolean(flags.shop_messaging),
        checkout: Boolean(flags.shop_transactions && paymentsConfigured),
        // Plans are sold only once they are enforced: while `plans` is off,
        // every rider already has everything, and nobody should pay for it.
        purchases: Boolean(flags.plans && purchasesConfigured),
      },
    }, 200, { "x-request-id": requestId });
  } catch (error) {
    return respondToError(error, requestId, "backend-capabilities");
  }
});
