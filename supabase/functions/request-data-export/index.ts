import { handleOptions, json, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireFeature, requireUser } from "../_shared/supabase.ts";

const selectRows = async (
  query: PromiseLike<{ data: unknown[] | null; error: { message?: string } | null }>,
) => {
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
};

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

    const [
      profile,
      preferences,
      notificationPreferences,
      horses,
      coachConversations,
      marketplaceConversations,
      savedListings,
      deletionRequests,
    ] = await Promise.all([
      admin.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      admin.from("user_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      admin.from("notification_preferences").select("*").eq("user_id", user.id).maybeSingle(),
      selectRows(admin.from("horses").select("*").eq("owner_id", user.id)),
      selectRows(admin.from("coach_conversations").select("*").eq("user_id", user.id)),
      selectRows(admin.from("marketplace_conversations").select("*").or(`buyer_id.eq.${user.id},seller_id.eq.${user.id}`)),
      selectRows(admin.from("saved_listings").select("listing_id,created_at").eq("user_id", user.id)),
      selectRows(admin.from("account_deletion_requests").select("*").eq("user_id", user.id)),
    ]);
    if (profile.error) throw profile.error;
    if (preferences.error) throw preferences.error;
    if (notificationPreferences.error) throw notificationPreferences.error;

    const horseIds = horses.map((entry) => String((entry as { id: unknown }).id));
    const coachConversationIds = coachConversations.map((entry) => String((entry as { id: unknown }).id));
    const marketplaceConversationIds = marketplaceConversations.map((entry) => String((entry as { id: unknown }).id));

    const [horseRecords, coachMessages, marketplaceMessages] = await Promise.all([
      horseIds.length
        ? selectRows(admin.from("horse_records").select("*").in("horse_id", horseIds))
        : Promise.resolve([]),
      coachConversationIds.length
        ? selectRows(admin.from("coach_messages").select("*").in("conversation_id", coachConversationIds))
        : Promise.resolve([]),
      marketplaceConversationIds.length
        ? selectRows(admin.from("marketplace_messages").select("*").in("conversation_id", marketplaceConversationIds))
        : Promise.resolve([]),
    ]);

    const exportPayload = {
      format: "equina-account-export",
      version: 1,
      generatedAt: new Date().toISOString(),
      account: {
        id: user.id,
        email: user.email ?? null,
        createdAt: user.created_at,
      },
      profile: profile.data,
      preferences: preferences.data,
      notificationPreferences: notificationPreferences.data,
      horses,
      horseRecords,
      coachConversations,
      coachMessages,
      marketplaceConversations,
      marketplaceMessages,
      savedListings,
      deletionRequests,
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
