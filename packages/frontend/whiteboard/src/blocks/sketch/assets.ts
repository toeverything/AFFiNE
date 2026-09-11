import { Boxed } from '@blocksuite/affine/store';

import type { SketchAssets, SketchScene } from './types';

type SketchAssetStore = {
  blobSync: { set: (blob: Blob) => Promise<string> };
};

export function readSketchAssets(
  value: Boxed<SketchAssets> | SketchAssets | undefined
): SketchAssets {
  const assets = value instanceof Boxed ? value.getValue() : value;
  if (!assets || typeof assets !== 'object') return {};
  const result: SketchAssets = {};
  for (const [fileId, blobId] of Object.entries(assets)) {
    if (typeof blobId === 'string') result[fileId] = blobId;
  }
  return result;
}

export function writeSketchAssets(
  target: Boxed<SketchAssets> | SketchAssets | undefined,
  next: SketchAssets
): Boxed<SketchAssets> {
  if (target instanceof Boxed) {
    target.setValue(next);
    return target;
  }
  return new Boxed(next);
}

export function sameSketchAssets(a: SketchAssets, b: SketchAssets) {
  const keys = Object.keys(a);
  if (keys.length !== Object.keys(b).length) return false;
  return keys.every(key => a[key] === b[key]);
}

/**
 * Embedded images live inline in the scene blob; `assets` keeps their blob ids
 * so the GC pass can tell live images from orphans (plan §6.4 / §6.8).
 */
export async function collectSceneAssets(
  store: SketchAssetStore,
  scene: SketchScene,
  previous: SketchAssets
): Promise<SketchAssets> {
  const assets: SketchAssets = {};
  for (const [fileId, file] of Object.entries(scene.files)) {
    const known = previous[fileId];
    if (known) {
      assets[fileId] = known;
      continue;
    }
    const dataUrl = (file as { dataURL?: unknown } | null)?.dataURL;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) continue;
    const blob = await (await fetch(dataUrl)).blob();
    assets[fileId] = await store.blobSync.set(blob);
  }
  return assets;
}
