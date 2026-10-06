import assert from "node:assert/strict";
import { ImageMetadataError, stripJpegMetadata } from "../supabase/functions/_shared/image-metadata";

// A Club photo reaches readers without where, when or on what it was taken.

const segment = (marker: number, payload: number[] | string) => {
  const data = typeof payload === "string" ? [...payload].map((char) => char.charCodeAt(0)) : payload;
  const length = data.length + 2;
  return [0xff, marker, length >> 8, length & 0xff, ...data];
};
const text = (value: string) => [...value].map((char) => char.charCodeAt(0));

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
const photo = Uint8Array.from([
  0xff, 0xd8,
  ...jfif, ...exifWithGps, ...xmp, ...iptc, ...icc, ...flashpix, ...comment, 0xff, 0xff, ...quantization, ...frame,
  ...scan,
  0xff, 0xd9
]);

{
  const { bytes, removed } = stripJpegMetadata(photo);
  assert.deepEqual(removed, ["exif", "xmp", "iptc", "app2", "comment"]);
  const asText = Buffer.from(bytes).toString("latin1");
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
{
  const clean = Uint8Array.from([0xff, 0xd8, ...jfif, ...quantization, ...frame, ...scan, 0xff, 0xd9]);
  const { bytes, removed } = stripJpegMetadata(clean);
  assert.deepEqual(removed, []);
  assert.deepEqual([...bytes], [...clean]);
}

// Anything that is not a well-formed JPEG is refused rather than passed on.
{
  assert.throws(() => stripJpegMetadata(Uint8Array.from(text("\x89PNG\r\n"))), ImageMetadataError);
  assert.throws(() => stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff])), ImageMetadataError);
  assert.throws(() => stripJpegMetadata(Uint8Array.from([0xff, 0xd8, 0x00, 0x00])), ImageMetadataError);
}

console.log("Photo metadata removal passed.");
