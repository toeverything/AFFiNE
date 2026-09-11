import type { Store } from '@blocksuite/affine/store';

import { isInlineSnapshotSrc, snapshotCache } from '../../perf/snapshot-cache';

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
  if (isInlineSnapshotSrc(snapshotBlobId)) return snapshotBlobId;
  return snapshotCache.resolve(snapshotBlobId, () =>
    store.blobSync.get(snapshotBlobId)
  );
}

export function revokeObjectUrl(url?: string) {
  if (url?.startsWith('blob:') && !snapshotCache.hasUrl(url)) {
    URL.revokeObjectURL(url);
  }
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.click();
}
