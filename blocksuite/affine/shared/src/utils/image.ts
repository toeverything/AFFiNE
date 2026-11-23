import DOMPurify from 'dompurify';

export function readImageSize(file: File | Blob) {
  return new Promise<{ width: number; height: number }>(resolve => {
    const size = { width: 0, height: 0 };
    if (!file.type.startsWith('image/')) {
      resolve(size);
      return;
    }

    const img = new Image();

    img.onload = () => {
      size.width = img.width;
      size.height = img.height;
      URL.revokeObjectURL(img.src);
      resolve(size);
    };

    img.onerror = () => {
      URL.revokeObjectURL(img.src);
      resolve(size);
    };

    const sanitizedURL = DOMPurify.sanitize(URL.createObjectURL(file));
    img.src = sanitizedURL;
  });
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
