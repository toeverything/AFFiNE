import {
  ViewportTurboRendererExtension,
  ViewportTurboRendererIdentifier,
} from '@blocksuite/affine/gfx/turbo-renderer';
import type { EditorHost } from '@blocksuite/affine/std';

import { isInlineSnapshotSrc, snapshotCache } from './snapshot-cache';

/**
 * Blob ids are content hashes, so one bitmap per id serves every editor. The
 * cap keeps a long session from holding every snapshot it ever painted.
 */
const MAX_BITMAPS = 64;

const bitmaps = new Map<string, ImageBitmap>();
const decoding = new Set<string>();
const painted = new Set<string>();
const failed = new Set<string>();

function remember(id: string, bitmap: ImageBitmap) {
  bitmaps.set(id, bitmap);
  while (bitmaps.size > MAX_BITMAPS) {
    const oldest = bitmaps.keys().next();
    if (oldest.done) break;
    bitmaps.get(oldest.value)?.close();
    bitmaps.delete(oldest.value);
  }
}

async function decode(src: string) {
  if (
    typeof Image === 'undefined' ||
    typeof createImageBitmap === 'undefined'
  ) {
    return null;
  }
  // `createImageBitmap` rejects SVG blobs in Chromium, so sketch snapshots have
  // to be rasterized through an <img> first.
  const image = new Image();
  image.src = src;
  await image.decode();
  return createImageBitmap(image);
}

async function load(host: EditorHost, id: string) {
  try {
    const src = isInlineSnapshotSrc(id)
      ? id
      : await snapshotCache.resolve(id, () => host.std.store.blobSync.get(id));
    if (!src) {
      failed.add(id);
      return;
    }
    const bitmap = await decode(src);
    if (!bitmap) return;
    remember(id, bitmap);
    // Only the first decode forces a relayout: after an LRU eviction the
    // refilled bitmap would otherwise invalidate on every pass.
    if (painted.has(id)) return;
    painted.add(id);
    const renderer = host.std.getOptional(ViewportTurboRendererIdentifier);
    if (renderer instanceof ViewportTurboRendererExtension) {
      renderer.invalidate();
    }
  } finally {
    decoding.delete(id);
  }
}

function scheduleLoad(host: EditorHost, id: string) {
  if (decoding.has(id)) return;
  decoding.add(id);
  load(host, id).catch(() => {
    failed.add(id);
  });
}

/**
 * Snapshot bitmap for a blob id or inline src, ready to be cloned into the
 * painter worker. A miss starts an async decode and paints the placeholder
 * until it lands.
 */
export function snapshotBitmap(host: EditorHost, id: string) {
  const hit = bitmaps.get(id);
  if (hit) {
    bitmaps.delete(id);
    bitmaps.set(id, hit);
    return hit;
  }
  if (!failed.has(id)) scheduleLoad(host, id);
  return undefined;
}
