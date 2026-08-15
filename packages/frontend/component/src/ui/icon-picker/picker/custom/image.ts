/**
 * Image utilities for the custom icon picker: validate, resize and re-encode
 * a user-uploaded image into a compact Blob for the workspace blob engine.
 */

/** Maximum output dimension for resized icons, in pixels. */
export const TARGET_SIZE = 128;
export const JPEG_QUALITY = 0.85;
/**
 * Raster inputs are re-encoded to at most TARGET_SIZE px before upload, so
 * this cap only bounds what the picker is willing to open and decode — the
 * stored blob stays small regardless of the input size.
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024;
/**
 * SVG is stored verbatim (rasterizing would defeat picking a vector), so its
 * cap IS the storage cap. Typical icon SVGs are 1-50KB; 500KB gives ample
 * headroom for complex artwork while still blocking megabyte-scale uploads
 * such as SVGs wrapping embedded base64 rasters.
 */
export const MAX_SVG_FILE_SIZE = 500 * 1024;
export const ALLOWED_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/svg+xml',
  'image/webp',
  'image/gif',
]);

export type IconFileError = 'unsupported-type' | 'too-large' | 'svg-too-large';

/** Validate a picked file against the allowed types and size caps. */
export function validateIconFile(
  file: Pick<File, 'type' | 'size'>
): IconFileError | null {
  if (!ALLOWED_TYPES.has(file.type)) {
    return 'unsupported-type';
  }
  if (file.type === 'image/svg+xml') {
    return file.size > MAX_SVG_FILE_SIZE ? 'svg-too-large' : null;
  }
  if (file.size > MAX_FILE_SIZE) {
    return 'too-large';
  }
  return null;
}

/**
 * Whether any pixel in the RGBA data has an alpha value below 255.
 * Used to pick PNG (preserve transparency) over JPEG (smaller).
 */
export function hasTransparency(data: Uint8ClampedArray): boolean {
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

/** Scale dimensions to fit `maxSize` × `maxSize`, never upscaling, min 1px. */
export function computeResizeDimensions(
  width: number,
  height: number,
  maxSize: number
): { width: number; height: number } {
  const scale = Math.min(1, maxSize / width, maxSize / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Resize an image to fit TARGET_SIZE × TARGET_SIZE (keeping aspect ratio,
 * never upscaling) and re-encode to a Blob for the workspace blob engine.
 * - SVG passes through untouched (vector, already tiny).
 * - Animated GIFs are flattened to their first frame (canvas is single-frame),
 *   matching how AFFiNE handles GIFs elsewhere (e.g. avatars).
 * - Transparent images are encoded as PNG to preserve the alpha channel;
 *   opaque images are encoded as JPEG to stay small.
 */
export function resizeImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (file.type === 'image/svg+xml') {
      resolve(file);
      return;
    }

    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const { width, height } = computeResizeDimensions(
        img.width,
        img.height,
        TARGET_SIZE
      );

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2d context'));
        return;
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, width, height);

      const imageData = ctx.getImageData(0, 0, width, height);
      const type = hasTransparency(imageData.data) ? 'image/png' : 'image/jpeg';
      canvas.toBlob(
        blob => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to encode image'));
        },
        type,
        type === 'image/jpeg' ? JPEG_QUALITY : undefined
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}
