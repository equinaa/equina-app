/**
 * The picture types the server keeps for a profile photo and a horse portrait:
 * the ones complete-upload can clean of their location and other metadata
 * (supabase/functions/_shared/image-metadata.ts, cleanablePhotoTypes), and so
 * the only ones create-upload-ticket gives a ticket for.
 *
 * The phone pickers always hand these over once the photo is cropped. The web
 * picker hands over the file as it is, so a HEIC from a Mac would otherwise be
 * refused only at upload, with a message that does not say why, and a new
 * horse saved with it would not be kept.
 */
export const storablePhotoTypes: readonly string[] = ["image/jpeg", "image/png"];

export const photoTypeMessage = "Use a JPEG or PNG photo.";

/**
 * Null when the server takes the photo, the rider's message otherwise. A
 * picker that names no type is read as JPEG, as the upload asset does.
 */
export const photoTypeProblem = (mimeType: string | null | undefined): string | null =>
  storablePhotoTypes.includes((mimeType ?? "image/jpeg").trim().toLowerCase()) ? null : photoTypeMessage;
