import type { FileSnapshot } from './clipboard.js';

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
      const content = btoa(await blob.text());
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
    const f = new File([atob(file.content)], file.name, {
      type: file.type,
    });
    map.set(sourceId, f);
  });
}
