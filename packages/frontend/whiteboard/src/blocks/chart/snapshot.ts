import type { Store } from '@blocksuite/affine/store';

export async function dataUrlToBlobId(
  store: Store,
  dataUrl: string
): Promise<string | undefined> {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return store.blobSync.set(blob);
}

export async function resolveSnapshotSrc(
  store: Store,
  snapshotBlobId?: string
): Promise<string | undefined> {
  if (!snapshotBlobId) return undefined;
  if (
    snapshotBlobId.startsWith('data:') ||
    snapshotBlobId.startsWith('blob:') ||
    snapshotBlobId.startsWith('http:') ||
    snapshotBlobId.startsWith('https:')
  ) {
    return snapshotBlobId;
  }

  const blob = await store.blobSync.get(snapshotBlobId);
  if (!blob) return undefined;
  return URL.createObjectURL(blob);
}

export function revokeObjectUrl(url?: string) {
  if (url?.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
