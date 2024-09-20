import { fetchImage } from '@blocksuite/affine/blocks';
import { assertExists } from '@blocksuite/affine/global/utils';

export async function fetchImageToFile(
  url: string,
  filename: string,
  imageProxy?: string
): Promise<File | void> {
  try {
    const res = await fetchImage(url, undefined, imageProxy);
    if (res && res.ok) {
      let blob = await res.blob();
      if (!blob.type || !blob.type.startsWith('image/')) {
        blob = await convertToPng(blob).then(tmp => tmp || blob);
      }
      return new File([blob], filename, { type: blob.type || 'image/png' });
    }
  } catch (err) {
    console.error(err);
  }

  return fetchImageFallback(url, filename);
}

function fetchImageFallback(
  url: string,
  filename: string
): Promise<File | void> {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.width;
      c.height = img.height;
      const ctx = c.getContext('2d');
      assertExists(ctx);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0);
      c.toBlob(blob => {
        if (blob) {
          return resolve(new File([blob], filename, { type: blob.type }));
        }
        resolve();
      }, 'image/png');
    };
    img.onerror = () => resolve();
    img.crossOrigin = 'anonymous';
    img.src = url;
  });
}

function convertToPng(blob: Blob): Promise<Blob | null> {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.addEventListener('load', _ => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        assertExists(ctx);
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0);
        c.toBlob(resolve, 'image/png');
      };
      img.onerror = () => resolve(null);
      img.src = reader.result as string;
    });
    reader.addEventListener('error', () => resolve(null));
    reader.readAsDataURL(blob);
  });
}

export function readBlobAsURL(blob: Blob | File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => {
      if (typeof e.target?.result === 'string') {
        resolve(e.target.result);
      } else {
        reject();
      }
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = 'image/png',
  quality?: number
) {
  return new Promise<Blob | null>(resolve =>
    canvas.toBlob(resolve, type, quality)
  );
}

export function randomSeed(min = 0, max = Date.now()) {
  return Math.round(Math.random() * (max - min)) + min;
}
