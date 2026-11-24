// What a photo carries besides its pixels, taken out before anyone but the
// rider who sent it can download it (docs/EQUINA_MEDIA_PROCESSING_BOUNDARY.md).
// A phone photo's EXIF holds where it was taken, when, and on which device;
// XMP and IPTC can hold the same and more, and a file can go on after its
// picture ends: a second image, the clip of a motion photo, a maker's block.
// None of it is needed to show the picture.
//
// JPEG and PNG only. Both are a list of labelled parts, so the parts to drop
// are left out and the rest is copied as it is, without decoding anything.
// HEIC keeps its metadata in places the rest of the file points at by
// position, so it cannot be cleaned this way: create-upload-ticket does not
// take it for a picture that gets cleaned, and complete-upload refuses it.
// Imports nothing, so the tests run it as it is.

export class ImageMetadataError extends Error {}

/**
 * The same picture without its metadata, the names of the parts taken out,
 * and whether the bytes differ from what came in at all.
 */
export type CleanedPhoto = { bytes: Uint8Array; removed: string[]; changed: boolean };

/** The types this file can clean. */
export const cleanablePhotoTypes: readonly string[] = ["image/jpeg", "image/png"];

const ascii = (data: Uint8Array, length: number) => String.fromCharCode(...data.subarray(0, length));

const concat = (parts: Uint8Array[]) => {
  const bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    bytes.set(part, at);
    at += part.length;
  }
  return bytes;
};

const differs = (left: Uint8Array, right: Uint8Array) => {
  if (left.length !== right.length) return true;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return true;
  }
  return false;
};

// --- Which way up --------------------------------------------------------------
//
// A camera held upright stores the picture on its side and writes in the EXIF
// which way to turn it. With the EXIF simply gone, a photo sent as the camera
// wrote it would be shown lying down. So that one value is the one thing kept:
// read here, and written back in a block that holds nothing else.

/** EXIF orientation, 1 to 8, from the TIFF block an EXIF is; undefined when it does not say. */
const tiffOrientation = (tiff: Uint8Array): number | undefined => {
  const order = ascii(tiff, 2);
  if (order !== "II" && order !== "MM") return undefined;
  const little = order === "II";
  const u16 = (at: number) => {
    const first = tiff[at];
    const second = tiff[at + 1];
    if (first === undefined || second === undefined) return undefined;
    return little ? first | (second << 8) : (first << 8) | second;
  };
  const u32 = (at: number) => {
    const low = u16(little ? at : at + 2);
    const high = u16(little ? at + 2 : at);
    return low === undefined || high === undefined ? undefined : high * 0x10000 + low;
  };
  if (u16(2) !== 42) return undefined;
  const directory = u32(4);
  const entries = directory === undefined ? undefined : u16(directory);
  if (directory === undefined || entries === undefined) return undefined;
  for (let index = 0; index < entries; index += 1) {
    const entry = directory + 2 + index * 12;
    const tag = u16(entry);
    if (tag === undefined) return undefined;
    if (tag !== 0x0112) continue;
    // A SHORT by the standard; some writers store a LONG.
    const type = u16(entry + 2);
    const value = type === 3 ? u16(entry + 8) : type === 4 ? u32(entry + 8) : undefined;
    return u32(entry + 4) === 1 && value !== undefined && value >= 1 && value <= 8 ? value : undefined;
  }
  return undefined;
};

/** A TIFF block that says which way up the picture is, and nothing else. */
const orientationTiff = (orientation: number) => [
  0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, // header, one directory
  0x00, 0x01, // with one entry:
  0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orientation, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, // and no further directory
];

/** That block as a JPEG's EXIF segment. */
const orientationSegment = (orientation: number) =>
  Uint8Array.from([0xff, 0xe1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...orientationTiff(orientation)]);

// The checksum every PNG chunk ends with.
const crc32 = (bytes: Uint8Array) => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
};

/** That block as a PNG's eXIf chunk. */
const orientationChunk = (orientation: number) => {
  const body = Uint8Array.from([0x65, 0x58, 0x49, 0x66, ...orientationTiff(orientation)]);
  const checksum = crc32(body);
  return Uint8Array.from([
    0x00, 0x00, 0x00, body.length - 4,
    ...body,
    checksum >>> 24, (checksum >>> 16) & 0xff, (checksum >>> 8) & 0xff, checksum & 0xff,
  ]);
};

// --- JPEG ----------------------------------------------------------------------

const segmentName = (marker: number, data: Uint8Array) => {
  const id = ascii(data, 32).split("\0")[0] ?? "";
  if (marker === 0xfe) return "comment";
  if (marker === 0xe1) return id.startsWith("Exif") ? "exif" : id.startsWith("http://ns.adobe.com/xap") ? "xmp" : "app1";
  if (marker === 0xed) return "iptc";
  return `app${marker - 0xe0}`;
};

// APP0 is the JFIF header, APP14 Adobe's colour transform, APP2 an ICC colour
// profile: they describe how to draw the picture, not who took it or where.
const keeps = (marker: number, data: Uint8Array) => {
  if (marker === 0xe0 || marker === 0xee) return true;
  if (marker === 0xe2) return ascii(data, 11) === "ICC_PROFILE";
  return !(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe;
};

// Where one scan's compressed data ends: at the next marker that is not a
// restart marker. Inside a scan, 0xff is followed by 0x00 (a stuffed byte), by
// 0xd0-0xd7 (a restart) or by another 0xff (fill).
const scanEnd = (input: Uint8Array, from: number) => {
  let at = from;
  for (;;) {
    at = input.indexOf(0xff, at);
    const next = at === -1 ? undefined : input[at + 1];
    if (next === undefined) return input.length;
    if (next === 0xff) at += 1;
    else if (next === 0x00 || (next >= 0xd0 && next <= 0xd7)) at += 2;
    else return at;
  }
};

/**
 * The same JPEG without its metadata segments and without anything after the
 * end of the picture. The compressed picture is copied byte for byte: nothing
 * is decoded, so nothing about how the photo looks can change.
 */
export function stripJpegMetadata(input: Uint8Array): CleanedPhoto {
  if (input.length < 4 || input[0] !== 0xff || input[1] !== 0xd8) {
    throw new ImageMetadataError("Not a JPEG.");
  }
  const kept: Uint8Array[] = [input.subarray(0, 2)];
  const removed: string[] = [];
  let orientationKept = false;
  let offset = 2;
  while (offset < input.length) {
    if (input[offset] !== 0xff) throw new ImageMetadataError("Malformed JPEG segment.");
    // Fill bytes between segments.
    while (input[offset] === 0xff && input[offset + 1] === 0xff) offset += 1;
    const marker = input[offset + 1];
    if (marker === undefined) throw new ImageMetadataError("Truncated JPEG.");
    if (marker === 0xd9) {
      // End of the picture. What a file carries after it (a second image with
      // an EXIF of its own, the clip of a motion photo, a maker's block) is
      // not copied.
      kept.push(input.subarray(offset, offset + 2));
      if (offset + 2 < input.length) removed.push("trailer");
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
    // Start of scan: the compressed picture, up to the next marker. A picture
    // can have several scans, with tables between them.
    if (marker === 0xda) {
      const next = scanEnd(input, end);
      kept.push(input.subarray(offset, next));
      offset = next;
      continue;
    }
    const segment = input.subarray(offset, end);
    const data = input.subarray(offset + 4, end);
    const exif = marker === 0xe1 && !orientationKept && ascii(data, 6) === "Exif\0\0";
    const orientation = exif ? tiffOrientation(data.subarray(6)) : undefined;
    const turned = orientation !== undefined && orientation !== 1 ? orientationSegment(orientation) : undefined;
    if (keeps(marker, data)) {
      kept.push(segment);
    } else if (turned && !differs(turned, segment)) {
      // Already nothing but the orientation: a photo cleaned before.
      kept.push(segment);
      orientationKept = true;
    } else {
      removed.push(segmentName(marker, data));
      if (turned) {
        kept.push(turned);
        orientationKept = true;
      }
    }
    offset = end;
  }
  const bytes = concat(kept);
  return { bytes, removed, changed: differs(bytes, input) };
}

// --- PNG -----------------------------------------------------------------------

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

// Besides the picture itself (IHDR, PLTE, IDAT, IEND), the chunks that say how
// to draw it: transparency, gamma and colour, bit depth, background, pixel
// size, and the frames of an animated PNG. Text, EXIF, the time it was last
// changed and anything this list does not know are left out.
const pngKeeps = new Set([
  "tRNS", "gAMA", "cHRM", "sRGB", "iCCP", "cICP", "mDCV", "cLLI", "sBIT", "bKGD", "hIST", "sPLT", "pHYs",
  "acTL", "fcTL", "fdAT",
]);

/**
 * The same PNG without its metadata chunks and without anything after its
 * end. The chunks that stay are copied byte for byte.
 */
export function stripPngMetadata(input: Uint8Array): CleanedPhoto {
  if (input.length < 8 || pngSignature.some((byte, index) => input[index] !== byte)) {
    throw new ImageMetadataError("Not a PNG.");
  }
  const kept: Uint8Array[] = [input.subarray(0, 8)];
  const removed: string[] = [];
  let orientationKept = false;
  let offset = 8;
  let ended = false;
  while (offset < input.length && !ended) {
    if (offset + 12 > input.length) throw new ImageMetadataError("Truncated PNG.");
    // Length of the data, then four letters, the data, and a checksum.
    const length =
      (input[offset] as number) * 0x1000000 +
      (((input[offset + 1] as number) << 16) | ((input[offset + 2] as number) << 8) | (input[offset + 3] as number));
    const type = ascii(input.subarray(offset + 4), 4);
    const end = offset + 12 + length;
    if (!/^[A-Za-z]{4}$/.test(type) || end > input.length) throw new ImageMetadataError("Malformed PNG chunk.");
    if (offset === 8 && type !== "IHDR") throw new ImageMetadataError("Malformed PNG header.");
    const chunk = input.subarray(offset, end);
    const orientation = type === "eXIf" && !orientationKept ? tiffOrientation(input.subarray(offset + 8, end - 4)) : undefined;
    const turned = orientation !== undefined && orientation !== 1 ? orientationChunk(orientation) : undefined;
    // A capital first letter marks a chunk the picture cannot be read without.
    const critical = ((input[offset + 4] as number) & 0x20) === 0;
    if (critical || pngKeeps.has(type)) {
      kept.push(chunk);
    } else if (turned && !differs(turned, chunk)) {
      // Already nothing but the orientation: a photo cleaned before.
      kept.push(chunk);
      orientationKept = true;
    } else {
      removed.push(type);
      if (turned) {
        kept.push(turned);
        orientationKept = true;
      }
    }
    offset = end;
    ended = type === "IEND";
  }
  if (!ended) throw new ImageMetadataError("Truncated PNG.");
  if (offset < input.length) removed.push("trailer");
  const bytes = concat(kept);
  return { bytes, removed, changed: differs(bytes, input) };
}

/** The picture without its metadata, for a type this file can clean. */
export function stripPhotoMetadata(mimeType: string, input: Uint8Array): CleanedPhoto {
  if (mimeType === "image/jpeg") return stripJpegMetadata(input);
  if (mimeType === "image/png") return stripPngMetadata(input);
  throw new ImageMetadataError("This type cannot be cleaned.");
}
