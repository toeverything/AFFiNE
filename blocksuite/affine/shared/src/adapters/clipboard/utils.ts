import type { FileSnapshot } from './clipboard.js';

const chars =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Use a lookup table to find the index.
const lookup = typeof Uint8Array === 'undefined' ? [] : new Uint8Array(256);
for (let i = 0; i < chars.length; i++) {
  lookup[chars.charCodeAt(i)] = i;
}

export const encode = (arraybuffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(arraybuffer);
  const len = bytes.length;
  let i,
    base64 = '';

  for (i = 0; i < len; i += 3) {
    base64 += chars[bytes[i] >> 2];
    base64 += chars[((bytes[i] & 3) << 4) | (bytes[i + 1] >> 4)];
    base64 += chars[((bytes[i + 1] & 15) << 2) | (bytes[i + 2] >> 6)];
    base64 += chars[bytes[i + 2] & 63];
  }

  if (len % 3 === 2) {
    base64 = base64.substring(0, base64.length - 1) + '=';
  } else if (len % 3 === 1) {
    base64 = base64.substring(0, base64.length - 2) + '==';
  }

  return base64;
};

export const decode = (base64: string): ArrayBuffer => {
  const len = base64.length;
  let bufferLength = base64.length * 0.75,
    i,
    p = 0,
    encoded1,
    encoded2,
    encoded3,
    encoded4;

  if (base64[base64.length - 1] === '=') {
    bufferLength--;
    if (base64[base64.length - 2] === '=') {
      bufferLength--;
    }
  }

  const arraybuffer = new ArrayBuffer(bufferLength),
    bytes = new Uint8Array(arraybuffer);

  for (i = 0; i < len; i += 4) {
    encoded1 = lookup[base64.charCodeAt(i)];
    encoded2 = lookup[base64.charCodeAt(i + 1)];
    encoded3 = lookup[base64.charCodeAt(i + 2)];
    encoded4 = lookup[base64.charCodeAt(i + 3)];

    bytes[p++] = (encoded1 << 2) | (encoded2 >> 4);
    bytes[p++] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
    bytes[p++] = ((encoded3 & 3) << 6) | (encoded4 & 63);
  }

  return arraybuffer;
};

export async function encodeClipboardBlobs(
  map: Map<string, Blob>,
  onError?: (message: string) => void
) {
  const blobs: Record<string, FileSnapshot> = {};
  let sumSize = 0;
  await Promise.all(
    Array.from(map.entries()).map(async ([id, blob]) => {
      if (blob.size > 4 * 1024 * 1024) {
        onError?.((blob as File).name ?? 'File' + ' is too large to be copied');
        return;
      }
      sumSize += blob.size;
      if (sumSize > 6 * 1024 * 1024) {
        onError?.(
          (blob as File).name ??
            'File' + ' cannot be copied due to the clipboard size limit'
        );
        return;
      }
      const content = encode(await blob.arrayBuffer());
      const file: FileSnapshot = {
        name: (blob as File).name,
        type: blob.type,
        content,
      };
      blobs[id] = file;
    })
  );
  return blobs;
}

export function decodeClipboardBlobs(
  blobs: Record<string, FileSnapshot>,
  map: Map<string, Blob> | undefined
) {
  if (!map) {
    console.error(
      `Trying to decode clipboard blobs, but the map is not found.`
    );
    return;
  }
  Object.entries<FileSnapshot>(blobs).forEach(([sourceId, file]) => {
    const blob = new Blob([decode(file.content)]);
    const f = new File([blob], file.name, {
      type: file.type,
    });
    map.set(sourceId, f);
  });
}
