import DOMPurify from 'dompurify';

type ImageSize = { width: number; height: number };

function isValidImageSize(size: ImageSize) {
  return size.width > 0 && size.height > 0;
}

export async function readImageSize(
  file: File | Blob,
  fallback: ImageSize = { width: 0, height: 0 }
) {
  if (!file.type.startsWith('image/')) {
    return fallback;
  }

  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file);
      try {
        const size = { width: bitmap.width, height: bitmap.height };
        if (isValidImageSize(size)) {
          return size;
        }
      } finally {
        bitmap.close();
      }
    } catch {
      // fallback below
    }
  }

  if (typeof Image !== 'undefined' && typeof URL !== 'undefined') {
    let objectUrl = '';
    try {
      objectUrl = URL.createObjectURL(file);
      const sanitizedURL = DOMPurify.sanitize(objectUrl);
      const size = await new Promise<ImageSize>(resolve => {
        const img = new Image();
        img.onload = () => {
          resolve({
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
          });
        };
        img.onerror = () => resolve(fallback);
        img.src = sanitizedURL;
      });
      if (isValidImageSize(size)) {
        return size;
      }
    } catch {
      // fallback below
    } finally {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    }
  }

  return fallback;
}

export function convertToPng(blob: Blob): Promise<Blob | null> {
  return new Promise(resolve => {
    const reader = new FileReader();

    reader.addEventListener('load', _ => {
      const img = new Image();

      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const ctx = c.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
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
