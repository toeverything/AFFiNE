import type { Store } from '@blocksuite/affine/store';

import { isInlineSnapshotSrc, snapshotCache } from '../../perf/snapshot-cache';
import { decodeSceneBlob, encodeSceneBlob } from './scene';
import type { SketchScene } from './types';

export async function saveScene(store: Store, scene: SketchScene) {
  return store.blobSync.set(await encodeSceneBlob(scene));
}

export async function loadScene(
  store: Store,
  sceneBlobId?: string
): Promise<SketchScene | undefined> {
  if (!sceneBlobId) return;
  const blob = await store.blobSync.get(sceneBlobId);
  if (!blob) return;
  return decodeSceneBlob(blob);
}

export async function saveSvg(store: Store, svg: string) {
  return store.blobSync.set(new Blob([svg], { type: 'image/svg+xml' }));
}

export async function resolveBlobSrc(store: Store, blobId?: string) {
  if (!blobId) return;
  if (isInlineSnapshotSrc(blobId)) return blobId;
  return snapshotCache.resolve(blobId, () => store.blobSync.get(blobId));
}

export function revokeObjectUrl(url?: string) {
  if (url?.startsWith('blob:') && !snapshotCache.hasUrl(url)) {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function svgToPngBlob(svg: string): Promise<Blob | undefined> {
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  const image = new Image();
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('svg'));
  });
  const canvas = document.createElement('canvas');
  canvas.width = image.width || 560;
  canvas.height = image.height || 360;
  canvas.getContext('2d')?.drawImage(image, 0, 0);
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob ?? undefined), 'image/png');
  });
}
