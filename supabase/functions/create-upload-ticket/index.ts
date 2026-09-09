import { HttpError, handleOptions, json, readJson, requestIdFor, requireMethod, respondToError } from "../_shared/http.ts";
import { createAdminClient, createUserClient, requireActiveUser, requireFeature, requireUser } from "../_shared/supabase.ts";

type UploadKind = "avatar" | "horse_photo" | "horse_record" | "club_post" | "listing_photo" | "dispute_evidence";
type UploadRequest = { kind: UploadKind; entityId: string; fileName: string; mimeType: string; byteSize: number };

const uploadRules: Record<UploadKind, { bucket: string; max: number; mime: string[] }> = {
  avatar: { bucket: "avatars", max: 10 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/heic", "image/heif"] },
  horse_photo: { bucket: "horse-media", max: 15 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/heic", "image/heif"] },
  horse_record: { bucket: "horse-records", max: 20 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"] },
  club_post: { bucket: "club-media", max: 50 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/heic", "image/heif", "video/mp4", "video/quicktime"] },
  listing_photo: { bucket: "listing-media", max: 15 * 1024 * 1024, mime: ["image/jpeg", "image/png", "image/heic", "image/heif"] },
  dispute_evidence: { bucket: "dispute-evidence", max: 20 * 1024 * 1024, mime: ["application/pdf", "image/jpeg", "image/png", "image/heic", "image/heif"] },
};

const extensionForMime = (mime: string) => ({
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/heic": "heic",
  "image/heif": "heif",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
}[mime] ?? "bin");

Deno.serve(async (request) => {
  const requestId = requestIdFor(request);
  const options = handleOptions(request);
  if (options) return options;

  try {
    requireMethod(request, "POST");
    const { user, token } = await requireUser(request);
    const input = await readJson<UploadRequest>(request);
    const rule = uploadRules[input.kind];
    if (!rule) throw new HttpError(400, "Unknown upload kind.", "invalid_upload_kind");
    if (!/^[0-9a-f-]{36}$/i.test(input.entityId)) throw new HttpError(400, "Invalid entity ID.", "invalid_entity");
    if (!rule.mime.includes(input.mimeType)) throw new HttpError(415, "This file type is not supported.", "unsupported_file_type");
    if (!Number.isInteger(input.byteSize) || input.byteSize < 1 || input.byteSize > rule.max) {
      throw new HttpError(413, "This file is too large.", "file_too_large");
    }
    if (!input.fileName?.trim() || input.fileName.length > 180) throw new HttpError(400, "Invalid file name.", "invalid_file_name");

    const featureByKind: Partial<Record<UploadKind, string>> = {
      horse_photo: "horse_management",
      horse_record: "record_mutations",
      club_post: "club_publishing",
      listing_photo: "shop_listing_creation",
    };
    const requiredFeature = featureByKind[input.kind];
    if (requiredFeature) await requireFeature(token, requiredFeature);
    if (["club_post", "listing_photo"].includes(input.kind)) await requireActiveUser(user.id);

    const client = createUserClient(token);
    const admin = createAdminClient();
    let parentId = input.entityId;
    if (input.kind === "avatar") {
      if (input.entityId !== user.id) throw new HttpError(403, "You can only update your own avatar.", "forbidden");
    } else if (input.kind === "horse_photo") {
      const { data: horse } = await admin.from("horses").select("id,owner_id").eq("id", input.entityId).single();
      const { data: collaborator } = horse?.owner_id === user.id ? { data: null } : await admin.from("horse_collaborators").select("user_id").eq("horse_id", input.entityId).eq("user_id", user.id).eq("access_role", "editor").not("accepted_at", "is", null).maybeSingle();
      if (!horse || (horse.owner_id !== user.id && !collaborator)) throw new HttpError(403, "You cannot edit this horse.", "forbidden");
    } else if (input.kind === "horse_record") {
      const { data: record } = await admin.from("horse_records").select("id,horse_id,horses(owner_id)").eq("id", input.entityId).single();
      const horseId = record?.horse_id as string | undefined;
      const ownerId = (record?.horses as { owner_id?: string } | null)?.owner_id;
      const { data: collaborator } = !horseId || ownerId === user.id ? { data: null } : await admin.from("horse_collaborators").select("user_id").eq("horse_id", horseId).eq("user_id", user.id).eq("access_role", "editor").not("accepted_at", "is", null).maybeSingle();
      if (!record || (ownerId !== user.id && !collaborator)) throw new HttpError(403, "You cannot attach files to this record.", "forbidden");
      parentId = horseId!;
    } else if (input.kind === "club_post") {
      const { data } = await client.from("club_posts").select("id,author_id").eq("id", input.entityId).eq("author_id", user.id).single();
      if (!data) throw new HttpError(403, "You cannot add media to this post.", "forbidden");
    } else if (input.kind === "listing_photo") {
      const { data } = await client.from("listings").select("id,status").eq("id", input.entityId).eq("seller_id", user.id).in("status", ["draft", "rejected"]).single();
      if (!data) throw new HttpError(403, "You cannot add photos to this listing.", "forbidden");
    } else if (input.kind === "dispute_evidence") {
      const { data } = await client.from("order_disputes").select("id").eq("id", input.entityId).single();
      if (!data) throw new HttpError(403, "You cannot add evidence to this dispute.", "forbidden");
    }

    const objectPath = `${user.id}/${parentId}/${input.entityId}/${crypto.randomUUID()}.${extensionForMime(input.mimeType)}`;
    const { data: ticket, error: ticketError } = await admin.from("upload_tickets").insert({
      user_id: user.id,
      kind: input.kind,
      entity_id: input.entityId,
      bucket_id: rule.bucket,
      object_path: objectPath,
      original_name: input.fileName.trim(),
      mime_type: input.mimeType,
      byte_size: input.byteSize,
    }).select("id,expires_at").single();
    if (ticketError || !ticket) throw ticketError ?? new Error("Upload ticket was not created.");

    const { data: signed, error: signedError } = await admin.storage.from(rule.bucket).createSignedUploadUrl(objectPath);
    if (signedError || !signed) {
      await admin.from("upload_tickets").update({ status: "canceled" }).eq("id", ticket.id);
      throw signedError ?? new Error("Signed upload could not be created.");
    }

    return json(
      { ticketId: ticket.id, bucket: rule.bucket, path: objectPath, token: signed.token, signedUrl: signed.signedUrl, expiresAt: ticket.expires_at },
      201,
      { "x-request-id": requestId },
    );
  } catch (error) {
    return respondToError(error, requestId, "create-upload-ticket");
  }
});
