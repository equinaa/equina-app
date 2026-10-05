import { handleOptions, json, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireFeature, requireUser } from "../_shared/supabase.ts";
import { readInBatches } from "../_shared/id-batches.ts";

type QueryResult<T> = { data: T | null; error: { message?: string } | null };

const selectRows = async (query: PromiseLike<QueryResult<unknown[]>>) => {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

const selectRow = async (query: PromiseLike<QueryResult<unknown>>) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};

// Waits for every section and keeps each result under its own key, in order.
const gather = async <T extends Record<string, Promise<unknown>>>(sections: T) => {
  const keys = Object.keys(sections) as (keyof T)[];
  const results = await Promise.all(keys.map((key) => sections[key]));
  return Object.fromEntries(keys.map((key, index) => [key, results[index]])) as { [K in keyof T]: Awaited<T[K]> };
};

const idsOf = (rows: unknown[]) => rows.map((entry) => String((entry as { id: unknown }).id));

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;

  let exportId: string | undefined;
  try {
    requireMethod(request, "POST");
    const { user, token } = await requireUser(request);
    await requireFeature(token, "account_settings");
    const admin = createAdminClient();

    const { data: exportRow, error: exportError } = await admin.from("data_export_requests")
      .insert({ user_id: user.id, status: "processing" }).select("id").single();
    if (exportError || !exportRow) throw exportError ?? new Error("Export request could not be created.");
    exportId = String(exportRow.id);

    // The rider's own rows: each table is read by the column that names the
    // rider, one of its references to auth.users. Every table that references
    // auth.users is either read here or left out on purpose, with the reason,
    // in tests/data-export.test.ts.
    const own = (table: string, rider: string | string[], columns = "*") => {
      const query = admin.from(table).select(columns);
      return selectRows(typeof rider === "string"
        ? query.eq(rider, user.id)
        : query.or(rider.map((column) => `${column}.eq.${user.id}`).join(",")));
    };
    const ownRow = (table: string, rider: string) =>
      selectRow(admin.from(table).select("*").eq(rider, user.id).maybeSingle());
    // Rows that belong to the rider's own rows: the records of their horses,
    // the messages of their conversations, the history of their orders. The
    // parent ids travel in the URL, so a long list is read in batches.
    const under = (table: string, parent: string, parentIds: string[]) =>
      readInBatches(parentIds, (batch) => selectRows(admin.from(table).select("*").in(parent, batch)));
    // Rows kept by email rather than by account, because they exist before
    // the account does: the beta invite. Read by the account's own address,
    // stored lower-cased and trimmed, without the staff-only note.
    const byEmail = (table: string, columns: string) =>
      user.email
        ? selectRows(admin.from(table).select(columns).eq("email", user.email.trim().toLowerCase()))
        : Promise.resolve([]);

    const horses = own("horses", "owner_id");
    const horseRecords = horses.then((rows) => under("horse_records", "horse_id", idsOf(rows)));
    const coachConversations = own("coach_conversations", "user_id");
    const marketplaceConversations = own("marketplace_conversations", ["buyer_id", "seller_id"]);
    const listings = own("listings", "seller_id");
    const orders = own("orders", ["buyer_id", "seller_id"]);
    const orderDisputes = orders.then((rows) => under("order_disputes", "order_id", idsOf(rows)));

    const sections = await gather({
      profile: ownRow("profiles", "id"),
      preferences: ownRow("user_preferences", "user_id"),
      notificationPreferences: ownRow("notification_preferences", "user_id"),
      horses,
      horseRecords,
      coachConversations,
      coachMessages: coachConversations.then((rows) => under("coach_messages", "conversation_id", idsOf(rows))),
      marketplaceConversations,
      marketplaceMessages: marketplaceConversations.then((rows) =>
        under("marketplace_messages", "conversation_id", idsOf(rows))
      ),
      savedListings: own("saved_listings", "user_id", "listing_id,created_at"),
      deletionRequests: own("account_deletion_requests", "user_id"),

      horseRecordFiles: horseRecords.then((rows) => under("horse_record_files", "record_id", idsOf(rows))),
      horseCollaborators: own("horse_collaborators", ["user_id", "invited_by"]),
      rideEntries: own("ride_entries", "rider_id"),
      onboardingStarterPack: ownRow("onboarding_starter_packs", "user_id"),
      academyProgress: own("academy_progress", "user_id"),
      academyLessonPicks: own("academy_lesson_picks", "user_id"),
      planSubscriptions: own("plan_subscriptions", "user_id"),
      coachMessageFeedback: own("coach_message_feedback", "user_id"),
      coachCreditLots: own("coach_credit_lots", "user_id"),
      coachCreditLedger: own("coach_credit_ledger", "user_id"),
      coachUsageEvents: own("coach_usage_events", "user_id"),
      clubMemberships: own("club_memberships", "user_id"),
      clubPosts: own("club_posts", "author_id"),
      clubPostMedia: own("club_post_media", "uploaded_by"),
      clubComments: own("club_comments", "author_id"),
      clubReactions: own("club_reactions", "user_id"),
      contentReports: own("content_reports", "reporter_id"),
      userBlocks: own("user_blocks", "blocker_id"),
      sellerAccount: ownRow("seller_accounts", "user_id"),
      listings,
      listingPhotos: own("listing_photos", "uploaded_by"),
      listingShippingRates: listings.then((rows) => under("listing_shipping_rates", "listing_id", idsOf(rows))),
      checkoutQuotes: own("checkout_quotes", "buyer_id"),
      orders,
      orderEvents: orders.then((rows) => under("order_events", "order_id", idsOf(rows))),
      shipments: orders.then((rows) => under("shipments", "order_id", idsOf(rows))),
      orderDisputes,
      disputeEvidence: orderDisputes.then((rows) => under("dispute_evidence", "dispute_id", idsOf(rows))),
      marketplaceReviews: own("marketplace_reviews", ["reviewer_id", "reviewee_id"]),
      marketplaceReports: own("marketplace_reports", "reporter_id"),
      userSanctions: own("user_sanctions", "user_id"),
      userRoles: own("user_roles", "user_id"),
      featureFlagOverrides: own("feature_flag_overrides", "user_id"),
      betaInvites: byEmail("beta_invites", "email,invited_at,revoked_at"),
      // The device, without the push token or its hash.
      pushDevices: own(
        "push_devices",
        "user_id",
        "id,user_id,platform,app_version,last_seen_at,disabled_reason,revoked_at,created_at",
      ),
      notifications: own("notification_outbox", "recipient_id"),
      uploadTickets: own("upload_tickets", "user_id"),
      exportRequests: own("data_export_requests", "user_id"),
      auditEvents: own("account_audit_events", "user_id"),
    });

    const exportPayload = {
      format: "equina-account-export",
      version: 1,
      generatedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at,
      },
      ...sections,
    };
    const bytes = new TextEncoder().encode(JSON.stringify(exportPayload, null, 2));
    const objectPath = `${user.id}/${exportId}.json`;
    const { error: uploadError } = await admin.storage.from("account-exports").upload(objectPath, bytes, {
      contentType: "application/json",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: readyError } = await admin.from("data_export_requests").update({
      status: "ready",
      object_path: objectPath,
      completed_at: new Date().toISOString(),
      expires_at: expiresAt,
    }).eq("id", exportId).eq("user_id", user.id);
    if (readyError) throw readyError;

    const { data: signed, error: signedError } = await admin.storage.from("account-exports")
      .createSignedUrl(objectPath, 900);
    if (signedError || !signed?.signedUrl) throw signedError ?? new Error("Export link could not be created.");

    await admin.from("account_audit_events").insert({
      user_id: user.id,
      event_type: "data_export_completed",
      request_id: exportId,
      detail: { formatVersion: 1 },
    });

    return json({ id: exportId, status: "ready", expiresAt, signedUrl: signed.signedUrl });
  } catch (error) {
    if (exportId) {
      const admin = createAdminClient();
      await admin.from("data_export_requests").update({
        status: "failed",
        failure_code: "export_failed",
      }).eq("id", exportId);
    }
    return respondToError(error);
  }
});
