import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, requireStaff, requireUser } from "../_shared/supabase.ts";

type ReviewRequest = { listingId: string; decision: "approve" | "reject"; note?: string };

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    await requireStaff(user.id);
    const input = await readJson<ReviewRequest>(request);
    if (!input.listingId || !["approve", "reject"].includes(input.decision)) throw new HttpError(400, "Listing and decision are required.", "invalid_review");
    const admin = createAdminClient();
    const { data: listing } = await admin.from("listings").select("id,status").eq("id", input.listingId).single();
    if (!listing || listing.status !== "pending_review") throw new HttpError(409, "Listing is not awaiting review.", "invalid_listing_state");

    if (input.decision === "approve") {
      const { error: photoError } = await admin.from("listing_photos").update({ evidence_status: "approved" }).eq("listing_id", listing.id);
      if (photoError) throw photoError;
      const { error: riskError } = await admin.from("listing_risk_signals").update({ resolved_at: new Date().toISOString(), resolved_by: user.id }).eq("listing_id", listing.id).is("resolved_at", null);
      if (riskError) throw riskError;
      const { data, error } = await admin.from("listings").update({ status: "active", moderation_note: null, published_at: new Date().toISOString() }).eq("id", listing.id).select("*").single();
      if (error) throw error;
      const { error: moderationError } = await admin.from("content_moderation_jobs").update({
        status: "approved", completed_at: new Date().toISOString(), last_error: null,
      }).eq("target_type", "listing").eq("target_id", listing.id);
      if (moderationError) throw moderationError;
      return json({ listing: data });
    }

    const note = input.note?.trim();
    if (!note) throw new HttpError(400, "A rejection reason is required.", "rejection_reason_required");
    const { data, error } = await admin.from("listings").update({ status: "rejected", moderation_note: note }).eq("id", listing.id).select("*").single();
    if (error) throw error;
    const { error: moderationError } = await admin.from("content_moderation_jobs").update({
      status: "rejected", completed_at: new Date().toISOString(), last_error: null,
    }).eq("target_type", "listing").eq("target_id", listing.id);
    if (moderationError) throw moderationError;
    return json({ listing: data });
  } catch (error) {
    return respondToError(error);
  }
});
