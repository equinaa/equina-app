// What a Club photo carries besides its pixels, taken out before any reader
// can download it (docs/EQUINA_MEDIA_PROCESSING_BOUNDARY.md). A phone photo's
// EXIF holds where it was taken, when, and on which device; XMP and IPTC can
// hold the same and more. None of it is needed to show the picture.
//
// JPEG only: the app re-encodes every Club photo to JPEG before upload, and
// create-upload-ticket accepts nothing else for a Club post. Imports nothing,
// so the tests run it as it is.

export class ImageMetadataError extends Error {}

const segmentName = (marker: number, data: Uint8Array) => {
  const id = String.fromCharCode(...data.subarray(0, 32)).split("\0")[0] ?? "";
  if (marker === 0xfe) return "comment";
  if (marker === 0xe1) return id.startsWith("Exif") ? "exif" : id.startsWith("http://ns.adobe.com/xap") ? "xmp" : "app1";
  if (marker === 0xed) return "iptc";
  return `app${marker - 0xe0}`;
};

// APP0 is the JFIF header, APP14 Adobe's colour transform, APP2 an ICC colour
// profile: they describe how to draw the picture, not who took it or where.
const keeps = (marker: number, data: Uint8Array) => {
  if (marker === 0xe0 || marker === 0xee) return true;
  if (marker === 0xe2) return String.fromCharCode(...data.subarray(0, 11)) === "ICC_PROFILE";
  return !(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe;
};

/**
 * The same JPEG without its metadata segments, and the names of the ones
 * taken out. The compressed picture is copied byte for byte: nothing is
 * decoded, so nothing about how the photo looks can change.
 */
export function stripJpegMetadata(input: Uint8Array): { bytes: Uint8Array; removed: string[] } {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new ImageMetadataError("Not a JPEG.");
  }
  const kept: Uint8Array[] = [input.subarray(0, 2)];
  const removed: string[] = [];
  let offset = 2;
  while (offset < input.length) {
    if (input[offset] !== 0xff) throw new ImageMetadataError("Malformed JPEG segment.");
    // Fill bytes between segments.
    while (input[offset] === 0xff && input[offset + 1] === 0xff) offset += 1;
    const marker = input[offset + 1];
    if (marker === undefined) throw new ImageMetadataError("Truncated JPEG.");
    if (marker === 0xd9) {
      kept.push(input.subarray(offset, offset + 2));
      offset += 2;
      break;
    }
    // Markers without a length.
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      kept.push(input.subarray(offset, offset + 2));
      offset += 2;
      continue;
    }
    const length = ((input[offset + 2] ?? 0) << 8) | (input[offset + 3] ?? 0);
    const end = offset + 2 + length;
    if (length < 2 || end > input.length) throw new ImageMetadataError("Malformed JPEG segment length.");
    // Start of scan: the compressed picture follows to the end of the file.
    if (marker === 0xda) {
      kept.push(input.subarray(offset));
      offset = input.length;
      break;
    }
    const data = input.subarray(offset + 4, end);
    if (keeps(marker, data)) kept.push(input.subarray(offset, end));
    else removed.push(segmentName(marker, data));
    offset = end;
  }
  const total = kept.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const part of kept) {
    bytes.set(part, at);
    at += part.length;
  }
  return { bytes, removed };
}
