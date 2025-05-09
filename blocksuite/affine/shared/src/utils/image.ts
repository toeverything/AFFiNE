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
