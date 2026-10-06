import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import type { UploadAsset } from "../../backend";
import { clubPhotoResize } from "./club-groups";

const readSize = async (uri: string) => {
  const response = await fetch(uri);
  if (!response.ok) throw new Error("The photo could not be prepared.");
  return (await response.blob()).size;
};

/**
 * A picked photo, redrawn as a JPEG no larger than the Club keeps. Redrawing
 * leaves the original's EXIF behind -- where and when it was taken, and on
 * which phone -- and complete-upload strips whatever a client still sends.
 * Works the same on iOS, Android and the web (canvas).
 */
export async function prepareClubPhoto(source: { uri: string; width?: number; height?: number }): Promise<UploadAsset> {
  const context = ImageManipulator.manipulate(source.uri);
  const resize = clubPhotoResize(source.width, source.height);
  if (resize) context.resize(resize);
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return {
    uri: saved.uri,
    fileName: `club-${Date.now()}.jpg`,
    mimeType: "image/jpeg",
    byteSize: await readSize(saved.uri)
  };
}
