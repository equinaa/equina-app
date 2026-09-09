import { HttpError, handleOptions, json, readJson, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { inspectUploadForMalware } from "../_shared/media-safety.ts";
import { queueStorageCleanup } from "../_shared/storage-cleanup.ts";
import { createAdminClient, requireUser } from "../_shared/supabase.ts";

type CompleteUploadRequest = { ticketId: string; requiredAngle?: string; position?: number; note?: string };

const sha256 = async (blob: Blob) => {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const hasValidSignature = (mime: string, bytes: Uint8Array) => {
  const starts = (...expected: number[]) => expected.every((value, index) => bytes[index] === value);
  if (mime === "application/pdf") return starts(0x25, 0x50, 0x44, 0x46, 0x2d);
  if (mime === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mime === "image/png") return starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const box = String.fromCharCode(...bytes.slice(4, 8));
  const brand = String.fromCharCode(...bytes.slice(8, 12));
  if (["image/heic", "image/heif"].includes(mime)) {
    return box === "ftyp" && ["heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
  }
  if (["video/mp4", "video/quicktime"].includes(mime)) return box === "ftyp";
  return false;
};

const verifyCurrentAccess = async (admin: ReturnType<typeof createAdminClient>, userId: string, ticket: Record<string, unknown>) => {
  const kind = String(ticket.kind);
  const entityId = String(ticket.entity_id);
  if (kind === "avatar") {
    if (entityId !== userId) throw new HttpError(403, "You cannot complete this upload.", "forbidden");
    return;
  }
  if (kind === "horse_photo") {
    const { data: horse } = await admin.from("horses").select("owner_id").eq("id", entityId).single();
    const { data: editor } = horse?.owner_id === userId ? { data: null } : await admin.from("horse_collaborators")
      .select("user_id").eq("horse_id", entityId).eq("user_id", userId)
      .eq("access_role", "editor").not("accepted_at", "is", null).maybeSingle();
    if (!horse || (horse.owner_id !== userId && !editor)) throw new HttpError(403, "You cannot complete this upload.", "forbidden");
    return;
  }
  if (kind === "horse_record") {
    const { data: record } = await admin.from("horse_records").select("horse_id,horses(owner_id)").eq("id", entityId).single();
    const ownerId = (record?.horses as { owner_id?: string } | null)?.owner_id;
    const { data: editor } = !record?.horse_id || ownerId === userId ? { data: null } : await admin.from("horse_collaborators")
      .select("user_id").eq("horse_id", record.horse_id).eq("user_id", userId)
      .eq("access_role", "editor").not("accepted_at", "is", null).maybeSingle();
    if (!record || (ownerId !== userId && !editor)) throw new HttpError(403, "You cannot complete this upload.", "forbidden");
    return;
  }
  if (kind === "club_post") {
    const { data: post } = await admin.from("club_posts").select("author_id").eq("id", entityId).single();
    if (!post || post.author_id !== userId) throw new HttpError(403, "You cannot complete this upload.", "forbidden");
    return;
  }
  if (kind === "listing_photo") {
    const { data: listing } = await admin.from("listings").select("seller_id,status").eq("id", entityId).single();
    if (!listing || listing.seller_id !== userId || !["draft", "rejected"].includes(listing.status)) {
      throw new HttpError(403, "You cannot complete this upload.", "forbidden");
    }
    return;
  }
  if (kind === "dispute_evidence") {
    const { data: dispute } = await admin.from("order_disputes").select("status,orders(buyer_id,seller_id)").eq("id", entityId).single();
    const order = dispute?.orders as { buyer_id?: string; seller_id?: string } | null;
    if (!dispute || dispute.status === "resolved" || (order?.buyer_id !== userId && order?.seller_id !== userId)) {
      throw new HttpError(403, "You cannot complete this upload.", "forbidden");
    }
  }
};

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user } = await requireUser(request);
    const input = await readJson<CompleteUploadRequest>(request);
    const admin = createAdminClient();
    const { data: ticket, error } = await admin.from("upload_tickets").select("*").eq("id", input.ticketId).eq("user_id", user.id).single();
    if (error || !ticket) throw new HttpError(404, "Upload ticket not found.", "ticket_not_found");
    if (ticket.status === "completed") {
      return json(
        { ticketId: ticket.id, path: ticket.object_path, completed: true },
        200,
        { "x-request-id": requestId },
      );
    }
    if (!["issued", "uploaded"].includes(ticket.status)) throw new HttpError(409, "Upload ticket is no longer usable.", "ticket_unavailable");
    if (new Date(ticket.expires_at).getTime() < Date.now()) {
      await queueStorageCleanup(admin, ticket.bucket_id, [ticket.object_path]);
      await admin.from("upload_tickets").update({ status: "expired" }).eq("id", ticket.id);
      throw new HttpError(410, "Upload ticket expired.", "ticket_expired");
    }

    try {
      await verifyCurrentAccess(admin, user.id, ticket as Record<string, unknown>);
    } catch (accessError) {
      await queueStorageCleanup(admin, ticket.bucket_id, [ticket.object_path]);
      await admin.from("upload_tickets").update({ status: "canceled" }).eq("id", ticket.id);
      throw accessError;
    }

    const segments = ticket.object_path.split("/");
    const fileName = segments.pop();
    const folder = segments.join("/");
    const { data: objects, error: listError } = await admin.storage.from(ticket.bucket_id).list(folder, { search: fileName, limit: 10 });
    if (listError) throw listError;
    const object = objects?.find((entry) => entry.name === fileName);
    if (!object) throw new HttpError(409, "Upload has not finished yet.", "upload_incomplete");
    const actualSize = Number(object.metadata?.size ?? ticket.byte_size);
    const actualMime = String(object.metadata?.mimetype ?? ticket.mime_type);
    if (actualSize !== ticket.byte_size || actualMime !== ticket.mime_type) {
      await queueStorageCleanup(admin, ticket.bucket_id, [ticket.object_path]);
      await admin.from("upload_tickets").update({ status: "canceled" }).eq("id", ticket.id);
      throw new HttpError(422, "Uploaded file does not match its ticket.", "upload_mismatch");
    }
    const { data: signatureUrl, error: signatureUrlError } = await admin.storage.from(ticket.bucket_id).createSignedUrl(ticket.object_path, 180);
    if (signatureUrlError || !signatureUrl?.signedUrl) throw signatureUrlError ?? new Error("Upload could not be inspected.");
    const signatureResponse = await fetch(signatureUrl.signedUrl, { headers: { Range: "bytes=0-31" } });
    if (!signatureResponse.ok) throw new Error("Upload could not be inspected.");
    const signature = new Uint8Array(await signatureResponse.arrayBuffer());
    if (!hasValidSignature(ticket.mime_type, signature)) {
      await queueStorageCleanup(admin, ticket.bucket_id, [ticket.object_path]);
      await admin.from("upload_tickets").update({ status: "canceled" }).eq("id", ticket.id);
      throw new HttpError(422, "The file content does not match its declared type.", "invalid_file_signature");
    }
    const rejectRegistration = async (registrationError: unknown): Promise<never> => {
      await queueStorageCleanup(admin, ticket.bucket_id, [ticket.object_path]);
      await admin.from("upload_tickets").update({ status: "canceled" }).eq("id", ticket.id);
      throw registrationError;
    };
    let contentHash: string | null = null;
    if (["horse_record", "listing_photo", "dispute_evidence"].includes(ticket.kind)) {
      const { data: uploadedBlob, error: downloadError } = await admin.storage.from(ticket.bucket_id).download(ticket.object_path);
      if (downloadError || !uploadedBlob) throw downloadError ?? new Error("Uploaded file could not be verified.");
      contentHash = await sha256(uploadedBlob);
    }
    try {
      await inspectUploadForMalware({
        signedUrl: signatureUrl.signedUrl,
        mimeType: ticket.mime_type,
        byteSize: ticket.byte_size,
        sha256: contentHash,
      });
    } catch (scanError) {
      await rejectRegistration(scanError);
    }

    if (ticket.kind === "avatar") {
      const { data: profile } = await admin.from("profiles").select("avatar_path").eq("id", user.id).single();
      const { error: updateError } = await admin.from("profiles").update({ avatar_path: ticket.object_path }).eq("id", user.id);
      if (updateError) await rejectRegistration(updateError);
      if (profile?.avatar_path && profile.avatar_path !== ticket.object_path) await queueStorageCleanup(admin, "avatars", [profile.avatar_path]);
    } else if (ticket.kind === "horse_photo") {
      const { data: horse } = await admin.from("horses").select("photo_path").eq("id", ticket.entity_id).single();
      const { error: updateError } = await admin.from("horses").update({ photo_path: ticket.object_path }).eq("id", ticket.entity_id);
      if (updateError) await rejectRegistration(updateError);
      if (horse?.photo_path && horse.photo_path !== ticket.object_path) await queueStorageCleanup(admin, "horse-media", [horse.photo_path]);
    } else if (ticket.kind === "horse_record") {
      const { error: insertError } = await admin.from("horse_record_files").insert({
        record_id: ticket.entity_id, uploaded_by: user.id, object_path: ticket.object_path,
        original_name: ticket.original_name, mime_type: ticket.mime_type, byte_size: ticket.byte_size, sha256: contentHash,
      });
      if (insertError) await rejectRegistration(insertError);
    } else if (ticket.kind === "club_post") {
      const { error: insertError } = await admin.from("club_post_media").insert({
        post_id: ticket.entity_id, uploaded_by: user.id, object_path: ticket.object_path,
        media_type: ticket.mime_type.startsWith("video/") ? "video" : "image",
        mime_type: ticket.mime_type, byte_size: ticket.byte_size, position: input.position ?? 0,
      });
      if (insertError) await rejectRegistration(insertError);
    } else if (ticket.kind === "listing_photo") {
      const requiredAngle = input.requiredAngle?.trim();
      if (!requiredAngle) return await rejectRegistration(new HttpError(400, "Photo angle is required.", "missing_photo_angle"));
      const { data: listing, error: listingError } = await admin.from("listings").select("category").eq("id", ticket.entity_id).single();
      if (listingError || !listing) return await rejectRegistration(listingError ?? new Error("Listing was not found."));
      const { data: rule, error: ruleError } = await admin.from("marketplace_category_rules")
        .select("required_photo_angles,max_photo_count").eq("category", listing.category).single();
      if (ruleError || !rule) return await rejectRegistration(ruleError ?? new Error("Listing category rules were not found."));
      const allowedAngles = Array.isArray(rule?.required_photo_angles) ? rule.required_photo_angles.map(String) : [];
      const { count: currentPhotoCount } = await admin.from("listing_photos").select("id", { count: "exact", head: true }).eq("listing_id", ticket.entity_id);
      if (!allowedAngles.includes(requiredAngle)) return await rejectRegistration(new HttpError(400, "This photo angle is not valid for the category.", "invalid_photo_angle"));
      if ((currentPhotoCount ?? 0) >= (rule.max_photo_count ?? 12)) return await rejectRegistration(new HttpError(409, "This listing already has the maximum number of photos.", "photo_limit_reached"));
      const { error: insertError } = await admin.from("listing_photos").insert({
        listing_id: ticket.entity_id, uploaded_by: user.id, object_path: ticket.object_path,
        required_angle: requiredAngle, mime_type: ticket.mime_type,
        byte_size: ticket.byte_size, position: input.position ?? 0, content_hash: contentHash,
      });
      if (insertError) await rejectRegistration(insertError);
      if (!insertError && contentHash) {
        const { data: duplicates } = await admin.from("listing_photos").select("listing_id,listings(seller_id)").eq("content_hash", contentHash).neq("listing_id", ticket.entity_id).limit(1);
        if (duplicates?.length) {
          await admin.from("listing_risk_signals").insert({
            listing_id: ticket.entity_id, signal: "duplicate_media", severity: "high",
            detail: { matching_listing_id: duplicates[0].listing_id }
          });
        }
      }
    } else if (ticket.kind === "dispute_evidence") {
      const { error: insertError } = await admin.from("dispute_evidence").insert({
        dispute_id: ticket.entity_id, uploaded_by: user.id, object_path: ticket.object_path,
        mime_type: ticket.mime_type, byte_size: ticket.byte_size, note: input.note?.trim() || null, content_hash: contentHash,
      });
      if (insertError) await rejectRegistration(insertError);
    }

    const { error: completeError } = await admin.from("upload_tickets").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", ticket.id);
    if (completeError) throw completeError;
    return json(
      { ticketId: ticket.id, path: ticket.object_path, completed: true },
      200,
      { "x-request-id": requestId },
    );
  } catch (error) {
    return respondToError(error, requestId, "complete-upload");
  }
});
