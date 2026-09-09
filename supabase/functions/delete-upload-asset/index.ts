import { HttpError, handleOptions, json, readJson, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { queueStorageCleanup } from "../_shared/storage-cleanup.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

type AssetKind = "horse_record_file" | "club_post_media" | "listing_photo" | "dispute_evidence";
type DeleteAssetRequest = { kind: AssetKind; assetId: string };

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  const options = handleOptions(request);
  if (options) return options;
  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const input = await readJson<DeleteAssetRequest>(request);
    const admin = createAdminClient();
    let bucket = "";
    let path = "";
    let table = "";

    if (input.kind === "horse_record_file") {
      const { data: file } = await admin.from("horse_record_files")
        .select("id,object_path,horse_records(horse_id,horses(owner_id))").eq("id", input.assetId).single();
      const record = file?.horse_records as { horse_id?: string; horses?: { owner_id?: string } | null } | null;
      const ownerId = record?.horses?.owner_id;
      const { data: editor } = !record?.horse_id || ownerId === user.id ? { data: null } : await admin.from("horse_collaborators")
        .select("user_id").eq("horse_id", record.horse_id).eq("user_id", user.id)
        .eq("access_role", "editor").not("accepted_at", "is", null).maybeSingle();
      if (!file || (ownerId !== user.id && !editor)) throw new HttpError(404, "File not found.", "asset_not_found");
      bucket = "horse-records"; path = file.object_path; table = "horse_record_files";
    } else if (input.kind === "club_post_media") {
      const { data: media } = await admin.from("club_post_media")
        .select("id,object_path,club_posts(author_id)").eq("id", input.assetId).single();
      const post = media?.club_posts as { author_id?: string } | null;
      if (!media || post?.author_id !== user.id) throw new HttpError(404, "Media not found.", "asset_not_found");
      bucket = "club-media"; path = media.object_path; table = "club_post_media";
    } else if (input.kind === "listing_photo") {
      const { data: photo } = await admin.from("listing_photos")
        .select("id,object_path,listings(seller_id,status)").eq("id", input.assetId).single();
      const listing = photo?.listings as { seller_id?: string; status?: string } | null;
      if (!photo || listing?.seller_id !== user.id || !["draft", "rejected"].includes(listing.status ?? "")) {
        throw new HttpError(404, "Listing photo not found.", "asset_not_found");
      }
      bucket = "listing-media"; path = photo.object_path; table = "listing_photos";
    } else if (input.kind === "dispute_evidence") {
      const { data: evidence } = await admin.from("dispute_evidence")
        .select("id,uploaded_by,object_path,order_disputes(status,orders(buyer_id,seller_id))").eq("id", input.assetId).single();
      const dispute = evidence?.order_disputes as { status?: string; orders?: { buyer_id?: string; seller_id?: string } | null } | null;
      const participant = dispute?.orders?.buyer_id === user.id || dispute?.orders?.seller_id === user.id;
      if (!evidence || evidence.uploaded_by !== user.id || !participant || dispute?.status === "resolved") {
        throw new HttpError(404, "Evidence not found.", "asset_not_found");
      }
      bucket = "dispute-evidence"; path = evidence.object_path; table = "dispute_evidence";
    } else {
      throw new HttpError(400, "Unknown asset kind.", "invalid_asset_kind");
    }

    const { error: deleteError } = await admin.from(table).delete().eq("id", input.assetId);
    if (deleteError) throw deleteError;
    const cleanup = await queueStorageCleanup(admin, bucket, [path]);
    return json(
      { assetId: input.assetId, deleted: true, cleanupPending: cleanup.pending },
      200,
      { "x-request-id": requestId },
    );
  } catch (error) {
    return respondToError(error, requestId, "delete-upload-asset");
  }
});
