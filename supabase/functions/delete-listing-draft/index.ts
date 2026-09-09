import { HttpError, handleOptions, json, readJson, requireMethod, respondToError } from "../_shared/http.ts";
import { queueStorageCleanup } from "../_shared/storage-cleanup.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

Deno.serve(async (request) => {
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const { listingId } = await readJson<{ listingId: string }>(request);
    const admin = createAdminClient();
    const { data: listing } = await admin.from("listings").select("id,seller_id,status,published_at").eq("id", listingId).single();
    if (!listing || listing.seller_id !== user.id || !["draft", "rejected", "archived"].includes(listing.status) || listing.published_at) {
      throw new HttpError(404, "Deletable listing draft not found.", "listing_not_found");
    }
    const [{ count: conversationCount }, { count: orderCount }] = await Promise.all([
      admin.from("marketplace_conversations").select("id", { count: "exact", head: true }).eq("listing_id", listing.id),
      admin.from("orders").select("id", { count: "exact", head: true }).eq("listing_id", listing.id),
    ]);
    if ((conversationCount ?? 0) > 0 || (orderCount ?? 0) > 0) {
      throw new HttpError(409, "This listing has marketplace history and can only remain archived.", "listing_history_exists");
    }
    const { data: photos, error: photosError } = await admin.from("listing_photos").select("object_path").eq("listing_id", listing.id);
    if (photosError) throw photosError;
    const paths = (photos ?? []).map((photo) => photo.object_path as string);
    const { error } = await admin.from("listings").delete().eq("id", listing.id);
    if (error) throw error;
    const cleanup = await queueStorageCleanup(admin, "listing-media", paths);
    return json({ listingId: listing.id, deleted: true, cleanupPending: cleanup.pending });
  } catch (error) {
    return respondToError(error);
  }
});
