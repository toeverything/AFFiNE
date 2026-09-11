import * as Y from 'yjs';

import { generateKeyBetween } from './pos';
import { createEmptyScene, normalizeScene } from './scene';
import type { SketchElement, SketchScene } from './types';

export const SKETCH_Y_ORIGIN = 'wb-sketch';
export const SKETCH_Y_ELEMENTS = 'elements';
export const SKETCH_Y_ASSETS = 'assets';
export const SKETCH_Y_META = 'meta';

export type SketchYItem = Y.Map<unknown>;

export function getSketchYElements(doc: Y.Doc) {
  return doc.getArray<SketchYItem>(SKETCH_Y_ELEMENTS);
}

export function getSketchYAssets(doc: Y.Doc) {
  return doc.getMap(SKETCH_Y_ASSETS);
}

export function getSketchYMeta(doc: Y.Doc) {
  return doc.getMap(SKETCH_Y_META);
}

function readElement(item: SketchYItem): SketchElement | undefined {
  const value = item.get('el');
  if (!value || typeof value !== 'object') return;
  return value as SketchElement;
}

function readPos(item: SketchYItem) {
  const pos = item.get('pos');
  return typeof pos === 'string' ? pos : 'a0';
}

/** y-excalidraw: `{ el, pos }` maps, sorted by pos then id. */
export function yjsToExcalidraw(doc: Y.Doc): SketchElement[] {
  return getSketchYElements(doc)
    .toArray()
    .map(item => ({ el: readElement(item), pos: readPos(item) }))
    .filter(
      (item): item is { el: SketchElement; pos: string } =>
        !!item.el && !item.el.isDeleted
    )
    .sort((a, b) =>
      a.pos === b.pos ? a.el.id.localeCompare(b.el.id) : a.pos < b.pos ? -1 : 1
    )
    .map(item => item.el);
}

export function sceneFromY(doc: Y.Doc): SketchScene {
  const meta = getSketchYMeta(doc);
  const files: Record<string, unknown> = {};
  getSketchYAssets(doc).forEach((value, key) => {
    files[key] = value;
  });
  return normalizeScene({
    type: 'excalidraw',
    version: 2,
    source: 'affine-whiteboard',
    elements: yjsToExcalidraw(doc),
    appState: {
      viewBackgroundColor:
        (meta.get('viewBackgroundColor') as string | undefined) || '#ffffff',
    },
    files,
  });
}

/**
 * Excalidraw reconciliation: the higher `version` wins, and on a tie the lower
 * `versionNonce` wins, so every peer keeps the same element without a server.
 */
export function isNewerElement(
  candidate: SketchElement,
  current?: SketchElement
) {
  if (!current) return true;
  const version = candidate.version ?? 0;
  const currentVersion = current.version ?? 0;
  if (version !== currentVersion) return version > currentVersion;
  return (candidate.versionNonce ?? 0) < (current.versionNonce ?? 0);
}

function nextVersionNonce() {
  return Math.floor(Math.random() * 0x7fffffff);
}

/** Editors other than Excalidraw (fallback tools, importers) carry no version. */
function versioned(element: SketchElement, current?: SketchElement) {
  if (typeof element.version === 'number') return element;
  return {
    ...element,
    version: (current?.version ?? 0) + 1,
    versionNonce: nextVersionNonce(),
  };
}

function sameContent(a: SketchElement, b: SketchElement) {
  return (
    JSON.stringify({ ...a, version: 0, versionNonce: 0 }) ===
    JSON.stringify({ ...b, version: 0, versionNonce: 0 })
  );
}

export function applySceneToY(doc: Y.Doc, scene: SketchScene) {
  const normalized = normalizeScene(scene);
  const yElements = getSketchYElements(doc);
  const yAssets = getSketchYAssets(doc);
  const yMeta = getSketchYMeta(doc);
  doc.transact(() => {
    yElements.delete(0, yElements.length);
    let prev: string | undefined;
    for (const element of normalized.elements) {
      const pos = generateKeyBetween(prev);
      const item = new Y.Map();
      item.set('el', versioned(element));
      item.set('pos', pos);
      yElements.push([item]);
      prev = pos;
    }
    yAssets.clear();
    for (const [key, value] of Object.entries(normalized.files)) {
      yAssets.set(key, value);
    }
    yMeta.set('viewBackgroundColor', normalized.appState.viewBackgroundColor);
  }, SKETCH_Y_ORIGIN);
}

/**
 * Element-level LWW upsert from Excalidraw `onChange`.
 * Deletions arrive as `isDeleted` elements and are stored as tombstones, so an
 * id missing from the list is a stale list, not a delete, and stays: the local
 * editor has not necessarily seen the elements a remote peer just added.
 */
export function applyElementsToY(
  doc: Y.Doc,
  elements: SketchElement[],
  appState?: { viewBackgroundColor?: string },
  files?: Record<string, unknown>
) {
  const yElements = getSketchYElements(doc);
  const yAssets = getSketchYAssets(doc);
  const yMeta = getSketchYMeta(doc);

  doc.transact(() => {
    const byId = new Map<string, SketchYItem>();
    const sorted = yElements
      .toArray()
      .map(item => ({ item, pos: readPos(item), id: readElement(item)?.id }))
      .sort((a, b) => (a.pos === b.pos ? 0 : a.pos < b.pos ? -1 : 1));

    for (const row of sorted) {
      if (row.id) byId.set(row.id, row.item);
    }

    let prevPos: string | undefined;
    for (const element of elements) {
      const existing = byId.get(element.id);
      if (!existing) {
        const pos = generateKeyBetween(prevPos);
        const item = new Y.Map();
        item.set('el', versioned(element));
        item.set('pos', pos);
        yElements.push([item]);
        prevPos = pos;
        continue;
      }
      prevPos = readPos(existing);
      const stored = readElement(existing);
      if (stored && sameContent(stored, element)) continue;
      const next = versioned(element, stored);
      if (isNewerElement(next, stored)) existing.set('el', next);
    }

    if (appState?.viewBackgroundColor) {
      yMeta.set('viewBackgroundColor', appState.viewBackgroundColor);
    }
    if (files) {
      yAssets.clear();
      for (const [key, value] of Object.entries(files)) {
        yAssets.set(key, value);
      }
    }
  }, SKETCH_Y_ORIGIN);
}

/**
 * Yjs settles two concurrent writes of one element by client id, so the
 * Excalidraw winner has to be restored after a remote update. Every peer runs
 * the same comparison against its own elements and converges on one element.
 */
export function reconcileSketchY(doc: Y.Doc, local: SketchElement[]) {
  const yElements = getSketchYElements(doc);
  const byId = new Map<string, SketchYItem>();
  for (const item of yElements.toArray()) {
    const id = readElement(item)?.id;
    if (id) byId.set(id, item);
  }
  const repaired: string[] = [];
  doc.transact(() => {
    for (const element of local) {
      const item = byId.get(element.id);
      if (!item) continue;
      const stored = readElement(item);
      if (!stored || !isNewerElement(element, stored)) continue;
      item.set('el', element);
      repaired.push(element.id);
    }
  }, SKETCH_Y_ORIGIN);
  return repaired;
}

export function observeSketchY(doc: Y.Doc, onChange: () => void) {
  const yElements = getSketchYElements(doc);
  const yAssets = getSketchYAssets(doc);
  const yMeta = getSketchYMeta(doc);
  const listener = (_events: unknown, txn?: Y.Transaction) => {
    if (txn?.origin === SKETCH_Y_ORIGIN) return;
    onChange();
  };
  yElements.observeDeep(listener);
  yAssets.observe(listener);
  yMeta.observe(listener);
  return () => {
    yElements.unobserveDeep(listener);
    yAssets.unobserve(listener);
    yMeta.unobserve(listener);
  };
}

export function createSketchUndoManager(doc: Y.Doc) {
  return new Y.UndoManager(
    [getSketchYElements(doc), getSketchYAssets(doc), getSketchYMeta(doc)],
    { trackedOrigins: new Set([SKETCH_Y_ORIGIN]) }
  );
}

export function emptySketchDoc() {
  const doc = new Y.Doc();
  applySceneToY(doc, createEmptyScene());
  return doc;
}
