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

function sameElement(a: unknown, b: unknown) {
  return JSON.stringify(a) === JSON.stringify(b);
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
      item.set('el', element);
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
 * Missing local ids are deleted; remote-only ids stay if `preserveUnknown` is set.
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
  const alive = elements.filter(element => !element.isDeleted);

  doc.transact(() => {
    const items = yElements.toArray();
    const byId = new Map<string, SketchYItem>();
    const sorted = items
      .map(item => ({ item, pos: readPos(item), id: readElement(item)?.id }))
      .sort((a, b) => (a.pos === b.pos ? 0 : a.pos < b.pos ? -1 : 1));

    for (const row of sorted) {
      if (row.id) byId.set(row.id, row.item);
    }

    let prevPos: string | undefined;
    for (const element of alive) {
      const existing = byId.get(element.id);
      if (existing) {
        if (!sameElement(existing.get('el'), element)) {
          existing.set('el', element);
        }
        prevPos = readPos(existing);
        continue;
      }
      const pos = generateKeyBetween(prevPos);
      const item = new Y.Map();
      item.set('el', element);
      item.set('pos', pos);
      yElements.push([item]);
      prevPos = pos;
    }

    const keep = new Set(alive.map(element => element.id));
    for (let i = yElements.length - 1; i >= 0; i--) {
      const id = readElement(yElements.get(i))?.id;
      if (id && !keep.has(id)) {
        yElements.delete(i, 1);
      }
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
