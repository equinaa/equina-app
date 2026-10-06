import type { UploadAsset } from "../../backend";
import { clubPhotoResize } from "./club-groups";

const readSize = async (uri: string) => {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("The photo could not be prepared.");
  return (await response.blob()).size;
};

/**
 * A picked photo, redrawn as a JPEG no larger than the Club keeps. Redrawing
 * drops the original's EXIF -- where and when it was taken, and on which
 * phone. iOS still writes a small header of its own (orientation, resolution,
 * colour space; checked on the simulator), and complete-upload strips that
 * and anything else a client sends. Works on iOS, Android and the web (canvas).
 *
 * The manipulator is native code, loaded only when a photo is prepared: a
 * build without it then says so here instead of failing as the app opens.
 */
export async function prepareClubPhoto(source: { uri: string; width?: number; height?: number }): Promise<UploadAsset> {
  let manipulator: typeof import("expo-image-manipulator");
  try {
    manipulator = await import("expo-image-manipulator");
  } catch {
    throw new Error("Photos need the latest version of the app.");
  }
  const context = manipulator.ImageManipulator.manipulate(source.uri);
  const resize = clubPhotoResize(source.width, source.height);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: manipulator.SaveFormat.JPEG, compress: 0.85 });
  return {
    uri: saved.uri,
    fileName: `club-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
    byteSize: await readSize(saved.uri)
  };
}
