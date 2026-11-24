import assert from "node:assert/strict";
import { crc32 } from "node:zlib";
import {
  cleanablePhotoTypes,
  ImageMetadataError,
  stripJpegMetadata,
  stripPhotoMetadata,
  stripPngMetadata
} from "../supabase/functions/_shared/image-metadata";

// A photo other riders can open reaches them without where, when or on what
// it was taken.

const text = (value: string) => [...value].map((char) => char.charCodeAt(0));
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");

// --- JPEG ----------------------------------------------------------------------

const segment = (marker: number, payload: number[] | string) => {
  const data = typeof payload === "string" ? text(payload) : payload;
  const length = data.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...data];
};

const jfif = segment(0xe0, "JFIF\0\x01\x01\0\0\x01\0\x01\0\0");
const exifWithGps = segment(0xe1, "Exif\0\0MM\0*GPSLatitude 38.0N GPSLongitude 23.7E iPhone 16 Pro");
const xmp = segment(0xe1, "http://ns.adobe.com/xap/1.0/\0<x:xmpmeta photoshop:City=\"Athens\"/>");
const iptc = segment(0xed, "Photoshop 3.0\0By-line: Rider Name");
const icc = segment(0xe2, "ICC_PROFILE\0\x01\x01display p3");
const flashpix = segment(0xe2, "FPXR\0private");
const comment = segment(0xfe, "Shot at the yard on Kifisias");
const quantization = segment(0xdb, [0, ...Array(64).fill(1)]);
const frame = segment(0xc0, [8, 0, 1, 0, 1, 1, 1, 0x11, 0]);
const scan = [...segment(0xda, [1, 1, 0, 0, 63, 0]), 0x12, 0x34, 0xff, 0x00, 0x56, 0xff, 0xd0, 0x78];
const endOfImage = [0xff, 0xd9];
const photo = Uint8Array.from([
  0xff, 0xd8,
  ...jfif, ...exifWithGps, ...xmp, ...iptc, ...icc, ...flashpix, ...comment, 0xff, 0xff, ...quantization, ...frame,
  ...scan,
  ...endOfImage
]);

{
  const { bytes, removed, changed } = stripJpegMetadata(photo);
  assert.deepEqual(removed, ["exif", "xmp", "iptc", "app2", "comment"]);
  assert.equal(changed, true);
  const asText = latin1(bytes);
  for (const leak of ["Exif", "GPS", "Athens", "Rider Name", "Kifisias", "iPhone", "FPXR"]) {
    assert.ok(!asText.includes(leak), `${leak} must not survive.`);
  }
  assert.ok(asText.includes("JFIF") && asText.includes("ICC_PROFILE"), "How to draw the picture stays.");
  assert.deepEqual([...bytes.subarray(0, 2)], [0xff, 0xd8]);
  assert.deepEqual([...bytes.subarray(-2)], [0xff, 0xd9]);
  // The compressed picture is copied byte for byte, stuffed bytes and restart markers included.
  const scanStart = Buffer.from(bytes).indexOf(Buffer.from([0xff, 0xda]));
  assert.deepEqual([...bytes.subarray(scanStart)], [...scan, 0xff, 0xd9]);
}

// A clean photo comes back the same.
const cleanPhoto = Uint8Array.from([0xff, 0xd8, ...jfif, ...quantization, ...frame, ...scan, ...endOfImage]);
{
  const { bytes, removed, changed } = stripJpegMetadata(cleanPhoto);
  assert.deepEqual(removed, []);
  assert.equal(changed, false);
  assert.deepEqual([...bytes], [...cleanPhoto]);
}

// Anything that is not a well-formed JPEG is refused rather than passed on.
{
  assert.throws(() => stripJpegMetadata(Uint8Array.from(text("\x89PNG\r\n"))), ImageMetadataError);
  assert.throws(() => stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), ImageMetadataError);
  assert.throws(() => stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0x00, 0x00])), ImageMetadataError);
}

// A file can go on after its picture ends: the other frames of a multi-picture
// file, each with an EXIF of its own, the clip of a motion photo, a maker's
// block. A photo picked on the web arrives with all of it, and none is copied.
{
  const secondPicture = [0xff, 0xd8, ...exifWithGps, ...quantization, ...frame, ...scan, ...endOfImage];
  const motionClip = text("\0\0\0\x18ftypmp42 \xa9xyz +38.0000+023.7000/ recorded at the yard");
  const withTrailer = Uint8Array.from([...cleanPhoto, ...secondPicture, ...motionClip]);
  const { bytes, removed, changed } = stripJpegMetadata(withTrailer);
  assert.deepEqual(removed, ["trailer"]);
  assert.equal(changed, true);
  assert.deepEqual([...bytes], [...cleanPhoto], "The picture ends at its own end-of-image marker.");
  for (const leak of ["GPS", "ftyp", "+38.0000", "yard"]) assert.ok(!latin1(bytes).includes(leak), `${leak} must not survive.`);
  // Metadata before the picture and a trailer after it, in one pass.
  assert.deepEqual(stripJpegMetadata(Uint8Array.from([...photo, ...secondPicture])).removed,
    ["exif", "xmp", "iptc", "app2", "comment", "trailer"]);
}

// A progressive picture has several scans with tables between them. Each scan
// is copied as it is; what looks like the end of the picture inside one (a
// stuffed 0xff followed by 0xd9) is not, and a comment between scans goes.
{
  const huffman = segment(0xc4, [0, ...Array(16).fill(0)]);
  const firstScan = [...segment(0xda, [1, 1, 0, 0, 0, 0]), 0x9a, 0xff, 0x00, 0xd9, 0x41, 0xff, 0xd3, 0x07, 0xff, 0xff];
  const lastScan = [...segment(0xda, [1, 1, 0, 1, 63, 0]), 0xff, 0x00, 0xff, 0x00, 0x5c];
  const progressive = Uint8Array.from([
    0xff, 0xd8, ...jfif, ...quantization, ...frame, ...huffman,
    ...firstScan, ...comment, ...huffman, ...lastScan, ...endOfImage,
    ...text("after the end")
  ]);
  const { bytes, removed } = stripJpegMetadata(progressive);
  assert.deepEqual(removed, ["comment", "trailer"]);
  assert.deepEqual(
    [...bytes],
    [0xff, 0xd8, ...jfif, ...quantization, ...frame, ...huffman, ...firstScan, ...huffman, ...lastScan, ...endOfImage]
  );
}

// A picture cut short inside its last scan has no end marker to stop at: it is
// kept to the last byte, as before, and nothing is called a trailer.
{
  const cutShort = Uint8Array.from([0xff, 0xd8, ...jfif, ...exifWithGps, ...quantization, ...frame, ...scan, 0x44, 0xff]);
  const { bytes, removed } = stripJpegMetadata(cutShort);
  assert.deepEqual(removed, ["exif"]);
  assert.deepEqual([...bytes], [0xff, 0xd8, ...jfif, ...quantization, ...frame, ...scan, 0x44, 0xff]);
}

// Which way up the picture is. A phone held upright stores the picture on its
// side and says so in the EXIF; with the EXIF simply gone, a profile photo
// picked on the web would be shown lying down. That one value is written back
// on its own. Everything else in the EXIF still goes.
const tiffEntry = (order: "MM" | "II", tag: number, type: number, count: number, value: number[]) => {
  const short = (number: number) => (order === "MM" ? [number >> 8, number & 0xff] : [number & 0xff, number >> 8]);
  const long = (number: number) =>
    order === "MM" ? [...short(number >>> 16), ...short(number & 0xffff)] : [...short(number & 0xffff), ...short(number >>> 16)];
  return [...short(tag), ...short(type), ...long(count), ...value];
};
const exifSegment = (order: "MM" | "II", entries: number[][], extra = "") => {
  const short = (number: number) => (order === "MM" ? [number >> 8, number & 0xff] : [number & 0xff, number >> 8]);
  const header = order === "MM" ? [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08] : [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00];
  return segment(0xe1, [...text("Exif\0\0"), ...header, ...short(entries.length), ...entries.flat(), 0, 0, 0, 0, ...text(extra)]);
};
const make = (order: "MM" | "II") => tiffEntry(order, 0x010f, 2, 4, text("LG\0\0"));
const gpsPointer = (order: "MM" | "II") => tiffEntry(order, 0x8825, 4, 1, order === "MM" ? [0, 0, 0, 0x40] : [0x40, 0, 0, 0]);
const orientationOnly = (value: number) => [
  0xff, 0xe1, 0x00, 0x22, ...text("Exif\0\0"), 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08,
  0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, value, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
];
const pictureWith = (...segments: number[][]) =>
  Uint8Array.from([0xff, 0xd8, ...jfif, ...segments.flat(), ...quantization, ...frame, ...scan, ...endOfImage]);
{
  // A phone's EXIF, either byte order: make, orientation, and where it was.
  for (const order of ["MM", "II"] as const) {
    const turned = exifSegment(
      order,
      [make(order), tiffEntry(order, 0x0112, 3, 1, order === "MM" ? [0, 6, 0, 0] : [6, 0, 0, 0]), gpsPointer(order)],
      "GPSLatitude 38.0N"
    );
    const { bytes, removed, changed } = stripJpegMetadata(pictureWith(turned, xmp));
    assert.deepEqual(removed, ["exif", "xmp"]);
    assert.equal(changed, true);
    assert.deepEqual([...bytes], [...pictureWith(orientationOnly(6))], `${order}: only the orientation is written back.`);
    for (const leak of ["LG", "GPS", "Athens"]) assert.ok(!latin1(bytes).includes(leak), `${leak} must not survive.`);
    // Cleaning a cleaned photo changes nothing, and reports nothing removed.
    const again = stripJpegMetadata(bytes);
    assert.deepEqual([...again.bytes], [...bytes]);
    assert.deepEqual(again.removed, []);
    assert.equal(again.changed, false);
  }
  // Some writers store the orientation as a LONG.
  const asLong = exifSegment("II", [tiffEntry("II", 0x0112, 4, 1, [8, 0, 0, 0])]);
  assert.deepEqual([...stripJpegMetadata(pictureWith(asLong)).bytes], [...pictureWith(orientationOnly(8))]);
  // The right way up already (what the app's own crop and the Club's redraw
  // produce): no EXIF is left at all.
  const upright = exifSegment("MM", [make("MM"), tiffEntry("MM", 0x0112, 3, 1, [0, 1, 0, 0])]);
  assert.deepEqual([...stripJpegMetadata(pictureWith(upright)).bytes], [...cleanPhoto]);
  // The file can come out exactly as long as it went in and still be another
  // file: here the EXIF held only the orientation, in the other byte order.
  // `changed` says so, which is what makes complete-upload store the new one.
  const otherOrder = exifSegment("II", [tiffEntry("II", 0x0112, 3, 1, [6, 0, 0, 0])]);
  assert.equal(otherOrder.length, orientationOnly(6).length);
  const rewritten = stripJpegMetadata(pictureWith(otherOrder));
  assert.deepEqual([...rewritten.bytes], [...pictureWith(orientationOnly(6))]);
  assert.equal(rewritten.bytes.length, pictureWith(otherOrder).length);
  assert.deepEqual(rewritten.removed, ["exif"]);
  assert.equal(rewritten.changed, true);
  // An EXIF of those same 36 bytes that holds something else goes whole.
  const sameLength = exifSegment("MM", [make("MM")]);
  assert.equal(sameLength.length, orientationOnly(6).length);
  assert.deepEqual([...stripJpegMetadata(pictureWith(sameLength)).bytes], [...cleanPhoto]);
  // A value that is not an orientation, a list of them, or an EXIF that stops
  // short: nothing is written back, and nothing is thrown.
  for (const odd of [
    exifSegment("MM", [tiffEntry("MM", 0x0112, 3, 1, [0, 9, 0, 0])]),
    exifSegment("MM", [tiffEntry("MM", 0x0112, 3, 1, [0, 0, 0, 0])]),
    exifSegment("MM", [tiffEntry("MM", 0x0112, 3, 2, [0, 6, 0, 6])]),
    exifSegment("MM", [tiffEntry("MM", 0x0112, 2, 1, [0x36, 0, 0, 0])]),
    segment(0xe1, [...text("Exif\0\0"), 0x4d, 0x4d, 0x00, 0x2a, 0x7f, 0xff, 0xff, 0xf0]),
    segment(0xe1, [...text("Exif\0\0"), 0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08, 0xff, 0xff, 0x01, 0x12]),
    segment(0xe1, [...text("Exif\0\0"), 0x4d, 0x4d]),
    segment(0xe1, "Exif\0\0")
  ]) {
    assert.deepEqual([...stripJpegMetadata(pictureWith(odd)).bytes], [...cleanPhoto]);
  }
  // Two EXIF segments: the orientation is written once.
  const twice = exifSegment("MM", [tiffEntry("MM", 0x0112, 3, 1, [0, 3, 0, 0])]);
  assert.deepEqual([...stripJpegMetadata(pictureWith(twice, exifWithGps, twice)).bytes], [...pictureWith(orientationOnly(3))]);
}

// --- PNG -----------------------------------------------------------------------

const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const chunk = (type: string, payload: number[] | string = []) => {
  const data = typeof payload === "string" ? text(payload) : payload;
  const body = [...text(type), ...data];
  const checksum = crc32(Uint8Array.from(body));
  return [
    (data.length >>> 24) & 0xff, (data.length >>> 16) & 0xff, (data.length >>> 8) & 0xff, data.length & 0xff,
    ...body,
    (checksum >>> 24) & 0xff, (checksum >>> 16) & 0xff, (checksum >>> 8) & 0xff, checksum & 0xff
  ];
};
const header = chunk("IHDR", [0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const srgb = chunk("sRGB", [0]);
const gamma = chunk("gAMA", [0, 0, 0xb1, 0x8f]);
const density = chunk("pHYs", [0, 0, 0x0e, 0xc3, 0, 0, 0x0e, 0xc3, 1]);
const pixels = chunk("IDAT", [0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00]);
const morePixels = chunk("IDAT", [0x18, 0xdd, 0x8d, 0xb0]);
const pngEnd = chunk("IEND");
const cleanPng = Uint8Array.from([...pngSignature, ...header, ...srgb, ...gamma, ...density, ...pixels, ...morePixels, ...pngEnd]);

{
  const screenshot = Uint8Array.from([
    ...pngSignature, ...header,
    ...chunk("iDOT", [0, 0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 1]),
    ...srgb, ...gamma,
    ...chunk("eXIf", "MM\0*GPSLatitude 38.0N GPSLongitude 23.7E iPhone 16 Pro"),
    ...density,
    ...chunk("tEXt", "Author\0Rider Name"),
    ...chunk("iTXt", "XML:com.adobe.xmp\0\0\0\0\0<x:xmpmeta photoshop:City=\"Athens\"/>"),
    ...chunk("zTXt", "Comment\0\0compressed words about Kifisias"),
    ...chunk("tIME", [0x07, 0xea, 11, 24, 16, 48, 0]),
    ...chunk("prVW", "a maker's preview"),
    ...pixels, ...morePixels, ...pngEnd,
    ...text("appended after the end, at the yard")
  ]);
  const { bytes, removed, changed } = stripPngMetadata(screenshot);
  assert.deepEqual(removed, ["iDOT", "eXIf", "tEXt", "iTXt", "zTXt", "tIME", "prVW", "trailer"]);
  assert.equal(changed, true);
  assert.deepEqual([...bytes], [...cleanPng], "The picture and how to draw it are copied chunk for chunk.");
  for (const leak of ["GPS", "iPhone", "Rider Name", "Athens", "Kifisias", "preview", "yard", "eXIf", "tIME"]) {
    assert.ok(!latin1(bytes).includes(leak), `${leak} must not survive.`);
  }
}

// A clean PNG comes back the same.
{
  const { bytes, removed, changed } = stripPngMetadata(cleanPng);
  assert.deepEqual(removed, []);
  assert.equal(changed, false);
  assert.deepEqual([...bytes], [...cleanPng]);
}

// A PNG made from a phone photo can be stored turned too (Preview and sips
// copy the orientation over). As for a JPEG, that one value is written back
// on its own, in a chunk with a checksum a decoder accepts.
const tiff = (order: "MM" | "II", entries: number[][], extra = "") => {
  const short = (number: number) => (order === "MM" ? [number >> 8, number & 0xff] : [number & 0xff, number >> 8]);
  const start = order === "MM" ? [0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08] : [0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00];
  return [...start, ...short(entries.length), ...entries.flat(), 0, 0, 0, 0, ...text(extra)];
};
const orientationOnlyChunk = (value: number) => chunk("eXIf", tiff("MM", [tiffEntry("MM", 0x0112, 3, 1, [0, value, 0, 0])]));
const pngWith = (...chunks: number[][]) =>
  Uint8Array.from([...pngSignature, ...header, ...srgb, ...chunks.flat(), ...gamma, ...density, ...pixels, ...morePixels, ...pngEnd]);
{
  for (const order of ["MM", "II"] as const) {
    const turned = chunk("eXIf", tiff(
      order,
      [make(order), tiffEntry(order, 0x0112, 3, 1, order === "MM" ? [0, 6, 0, 0] : [6, 0, 0, 0]), gpsPointer(order)],
      "GPSLatitude 38.0N"
    ));
    const { bytes, removed, changed } = stripPngMetadata(pngWith(turned, chunk("tEXt", "Author\0Rider Name")));
    assert.deepEqual(removed, ["eXIf", "tEXt"]);
    assert.equal(changed, true);
    assert.deepEqual([...bytes], [...pngWith(orientationOnlyChunk(6))], `${order}: only the orientation is written back.`);
    for (const leak of ["LG", "GPS", "Rider Name"]) assert.ok(!latin1(bytes).includes(leak), `${leak} must not survive.`);
    const again = stripPngMetadata(bytes);
    assert.deepEqual([...again.bytes], [...bytes]);
    assert.deepEqual(again.removed, []);
    assert.equal(again.changed, false);
  }
  // The right way up already: no EXIF is left at all.
  const upright = chunk("eXIf", tiff("II", [make("II"), tiffEntry("II", 0x0112, 3, 1, [1, 0, 0, 0])]));
  assert.deepEqual([...stripPngMetadata(pngWith(upright)).bytes], [...pngWith()]);
  assert.deepEqual([...pngWith()], [...cleanPng]);
  // Two EXIF chunks: the orientation is written once.
  const twice = chunk("eXIf", tiff("MM", [tiffEntry("MM", 0x0112, 3, 1, [0, 8, 0, 0])]));
  assert.deepEqual([...stripPngMetadata(pngWith(twice, upright, twice)).bytes], [...pngWith(orientationOnlyChunk(8))]);
  // An EXIF chunk that is not a TIFF block at all simply goes.
  assert.deepEqual([...stripPngMetadata(pngWith(chunk("eXIf", "not a tiff"))).bytes], [...cleanPng]);
}

// What the picture is drawn with stays: a palette and its transparency, a
// colour profile, the frames of an animated PNG, and any chunk the format
// marks as one the picture cannot be read without.
{
  const drawn = Uint8Array.from([
    ...pngSignature, ...header,
    ...chunk("iCCP", "display p3\0\0profile"), ...chunk("cICP", [12, 13, 0, 1]), ...chunk("sBIT", [8, 8, 8]),
    ...chunk("PLTE", [0, 0, 0, 255, 255, 255]), ...chunk("tRNS", [0, 255]), ...chunk("bKGD", [0]),
    ...chunk("acTL", [0, 0, 0, 2, 0, 0, 0, 0]), ...chunk("fcTL", Array(26).fill(0)),
    ...pixels,
    ...chunk("fcTL", Array(26).fill(1)), ...chunk("fdAT", [0, 0, 0, 2, 0x78, 0x9c]),
    ...chunk("NEWc", "a chunk a newer PNG needs"),
    ...pngEnd
  ]);
  const { bytes, removed, changed } = stripPngMetadata(drawn);
  assert.deepEqual(removed, []);
  assert.equal(changed, false);
  assert.deepEqual([...bytes], [...drawn]);
}

// Anything that is not a well-formed PNG is refused rather than passed on.
{
  assert.throws(() => stripPngMetadata(cleanPhoto), ImageMetadataError, "A JPEG is not a PNG.");
  assert.throws(() => stripPngMetadata(Uint8Array.from(pngSignature)), ImageMetadataError, "No picture at all.");
  assert.throws(() => stripPngMetadata(cleanPng.subarray(0, cleanPng.length - pngEnd.length)), ImageMetadataError, "Cut before its end.");
  assert.throws(() => stripPngMetadata(cleanPng.subarray(0, cleanPng.length - 5)), ImageMetadataError, "Cut inside a chunk.");
  assert.throws(
    () => stripPngMetadata(Uint8Array.from([...pngSignature, ...srgb, ...header, ...pixels, ...pngEnd])),
    ImageMetadataError,
    "The header chunk comes first."
  );
  assert.throws(
    () => stripPngMetadata(Uint8Array.from([...pngSignature, ...chunk("CgBI", [0x50, 0, 0x20, 2]), ...header, ...pixels, ...pngEnd])),
    ImageMetadataError,
    "An app-bundle PNG is not one a browser can draw."
  );
  assert.throws(
    () => stripPngMetadata(Uint8Array.from([...pngSignature, ...header, 0xff, 0xff, 0xff, 0xff, ...text("IDAT"), 1, 2, 3, 4, ...pngEnd])),
    ImageMetadataError,
    "A chunk longer than the file."
  );
  assert.throws(
    () => stripPngMetadata(Uint8Array.from([...pngSignature, ...header, 0, 0, 0, 0, 0x49, 0x44, 0x00, 0x54, 0, 0, 0, 0, ...pngEnd])),
    ImageMetadataError,
    "A chunk name that is not four letters."
  );
}

// A file built of millions of empty parts is not a picture, and taking it apart
// would cost many times its size in memory. It is refused, however small each
// part is. A large PNG saved in small pieces has a few thousand and is fine.
{
  const emptySegment = [0xff, 0xe3, 0x00, 0x02];
  const manySegments = new Uint8Array(2 + 100_000 * 4 + 2);
  manySegments.set([0xff, 0xd8]);
  for (let index = 0; index < 100_000; index += 1) manySegments.set(emptySegment, 2 + index * 4);
  manySegments.set(endOfImage, manySegments.length - 2);
  assert.throws(() => stripJpegMetadata(manySegments), ImageMetadataError);
  assert.equal(stripJpegMetadata(manySegments.subarray(0, 2 + 5_000 * 4)).removed.length, 5_000);

  const emptyChunk = chunk("tEXt");
  const start = [...pngSignature, ...header];
  const manyChunks = new Uint8Array(start.length + 100_000 * emptyChunk.length + pngEnd.length);
  manyChunks.set(start);
  for (let index = 0; index < 100_000; index += 1) manyChunks.set(emptyChunk, start.length + index * emptyChunk.length);
  manyChunks.set(pngEnd, manyChunks.length - pngEnd.length);
  assert.throws(() => stripPngMetadata(manyChunks), ImageMetadataError);
  const smallPieces = Uint8Array.from([...start, ...Array.from({ length: 5_000 }, () => pixels).flat(), ...pngEnd]);
  assert.deepEqual([...stripPngMetadata(smallPieces).bytes], [...smallPieces]);
}

// --- By type --------------------------------------------------------------------

// The types that can be cleaned without decoding the picture. HEIC is not one:
// the upload functions refuse it for a picture other riders can open.
assert.deepEqual([...cleanablePhotoTypes], ["image/jpeg", "image/png"]);
assert.deepEqual([...stripPhotoMetadata("image/jpeg", photo).bytes], [...stripJpegMetadata(photo).bytes]);
assert.deepEqual([...stripPhotoMetadata("image/png", cleanPng).bytes], [...cleanPng]);
for (const type of ["image/heic", "image/heif", "image/webp", "application/pdf", ""]) {
  assert.throws(() => stripPhotoMetadata(type, photo), ImageMetadataError, `${type || "no type"} cannot be cleaned.`);
}
// The type the upload was declared as decides, so a file of another kind is refused.
assert.throws(() => stripPhotoMetadata("image/png", photo), ImageMetadataError);
assert.throws(() => stripPhotoMetadata("image/jpeg", cleanPng), ImageMetadataError);

console.log("Photo metadata removal passed.");
