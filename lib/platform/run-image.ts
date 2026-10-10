import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/**
 * What a run's file field lets a person pick (BUILD-PLAN 25.8.3; the owner's
 * decision 1 of 2026-10-10): a PDF, a JPEG or a PNG. A run-input field carries
 * no list of types — the platform checks a file against the flow's manifest
 * only once its upload opens — so the pickers are limited here, in code.
 */
export const RUN_FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/** The most an image's long side is sent at, in pixels (the owner's decision 1 of 2026-10-10). */
export const LONG_SIDE_MAX = 2576;

/** The quality an image is saved at as a JPEG: high, and once. */
export const JPEG_QUALITY = 0.9;

/** What a photo taken for a run is called: a label, never a path, and the same every time. */
export const PHOTO_NAME = 'photo.jpg';

/** Said when an image could not be re-encoded: it is not sent at all. */
export const IMAGE_NOT_READ = 'The image could not be read. Try another.';

/**
 * Whether a file the person chose is an image, which is sent re-encoded: by the
 * type the picker names, and by its name only when the picker names none.
 */
export function isImage(file: { name: string; mimeType?: string | null }): boolean {
  if (file.mimeType) return file.mimeType.startsWith('image/');
  return /\.(?:jpe?g|png)$/iu.test(file.name);
}

/** An image's name once it is a JPEG: its own, with `.jpg` for its extension. */
export function jpegName(name: string): string {
  const stem = name.replace(/\.[^./\\]*$/u, '');
  return `${stem || 'image'}.jpg`;
}

/**
 * The resize that brings an image's long side down to `LONG_SIDE_MAX`,
 * keeping its proportions, or null when it is within it — an image is never
 * enlarged. One side is named and the manipulator works out the other.
 */
export function boundedResize(width: number, height: number): { width: number } | { height: number } | null {
  if (Math.max(width, height) <= LONG_SIDE_MAX) return null;
  return width >= height ? { width: LONG_SIDE_MAX } : { height: LONG_SIDE_MAX };
}

/**
 * Re-encode an image once, for a run (BUILD-PLAN 25.8.3; the owner's decision
 * 1 of 2026-10-10): upright, its long side at most 2,576 px, saved as a JPEG at
 * 0.9. A photo from the camera and a JPEG or PNG chosen by Upload alike; a PDF
 * never comes here.
 *
 * Upright is the manipulator's own loading, as SDK 54's expo-image-manipulator
 * (14.0.8) is written: on iOS `manipulate` adds `ImageFixOrientationTransformer`
 * before anything else, which draws the pixels the way the photo is displayed
 * and drops its orientation flag; on Android the image is decoded by Glide
 * (`expo-image-loader`), which applies the EXIF orientation, and
 * `Bitmap.compress` writes none. So nothing here reads EXIF or rotates: turning
 * the image by its EXIF tag as well would turn it twice.
 *
 * The first render is the upright image, measured; the bound is applied to that
 * and the result is saved — one encode. Every native image is released, the
 * bitmaps of a phone's photo being tens of megabytes. Any failure is one
 * sentence, `IMAGE_NOT_READ`, never the native module's message.
 */
export async function reencodeImage(uri: string): Promise<{ uri: string; width: number; height: number }> {
  let context: ReturnType<typeof ImageManipulator.manipulate> | undefined;
  const images: { release: () => void }[] = [];
  try {
    context = ImageManipulator.manipulate(uri);
    const upright = await context.renderAsync();
    images.push(upright);
    const resize = boundedResize(upright.width, upright.height);
    const image = resize ? await context.resize(resize).renderAsync() : upright;
    if (image !== upright) images.push(image);
    const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: JPEG_QUALITY });
    return { uri: saved.uri, width: saved.width, height: saved.height };
  } catch {
    throw new Error(IMAGE_NOT_READ);
  } finally {
    for (const image of images) image.release();
    context?.release();
  }
}
