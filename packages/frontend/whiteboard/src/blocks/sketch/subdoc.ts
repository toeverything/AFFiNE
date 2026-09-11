import * as Y from 'yjs';

import { decodeSceneBlob } from './scene';
import type { SketchScene } from './types';
import {
  applyElementsToY,
  applySceneToY,
  createSketchUndoManager,
  observeSketchY,
  sceneFromY,
} from './y-binding';

export const SKETCH_SUBDOC_PREFIX = 'wb-sketch-';

type SketchSubdocWorkspace = {
  onLoadDoc?: (doc: Y.Doc) => void;
};

type SketchStoreLike = {
  blobSync: { get: (id: string) => Promise<Blob | null | undefined> };
  captureSync?: () => void;
  doc?: { workspace?: SketchSubdocWorkspace };
};

type SketchModelLike = {
  id: string;
  flavour: string;
  props: {
    subdocGuid?: string;
    sceneBlobId?: string;
  };
  store: SketchStoreLike;
};

const docs = new Map<string, { doc: Y.Doc; refs: number }>();

export function createSketchSubdocGuid() {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${SKETCH_SUBDOC_PREFIX}${id}`;
}

export function ensureSketchSubdocGuid(model: SketchModelLike) {
  if (model.props.subdocGuid) return model.props.subdocGuid;
  const guid = createSketchSubdocGuid();
  model.store.captureSync?.();
  model.props.subdocGuid = guid;
  return guid;
}

/**
 * Registers the subdoc with nbstore so its updates are synced by guid.
 *
 * nbstore keeps one `Y.Doc` per guid and throws on a second `connectDoc` for
 * the same guid, so the doc must be destroyed on release (see
 * `releaseSketchSubdoc`) or the next mount would silently sync nothing.
 */
export function connectSketchSubdoc(store: SketchStoreLike, doc: Y.Doc) {
  store.doc?.workspace?.onLoadDoc?.(doc);
}

export function openSketchSubdoc(store: SketchStoreLike, guid: string) {
  const cached = docs.get(guid);
  if (cached) {
    cached.refs += 1;
    return cached.doc;
  }
  const doc = new Y.Doc({ guid });
  docs.set(guid, { doc, refs: 1 });
  try {
    connectSketchSubdoc(store, doc);
  } catch (error) {
    // Leaving the entry cached would hand later mounts an unsynced doc.
    docs.delete(guid);
    doc.destroy();
    throw error;
  }
  return doc;
}

export function releaseSketchSubdoc(guid: string) {
  const cached = docs.get(guid);
  if (!cached) return;
  cached.refs -= 1;
  if (cached.refs > 0) return;
  docs.delete(guid);
  // nbstore disconnects on the doc's 'destroy' event (and documents `destroy`
  // as the supported way to do it), which is what lets a later mount connect a
  // fresh doc under the same guid.
  cached.doc.destroy();
}

export type SketchCollab = {
  guid: string;
  doc: Y.Doc;
  applyingRemote: boolean;
  toScene: () => SketchScene;
  applyScene: (scene: SketchScene) => void;
  applyElements: (
    elements: SketchScene['elements'],
    appState?: { viewBackgroundColor?: string },
    files?: Record<string, unknown>
  ) => void;
  observe: (onChange: () => void) => () => void;
  undo: () => void;
  redo: () => void;
  dispose: () => void;
};

export async function openSketchCollab(
  model: SketchModelLike
): Promise<SketchCollab> {
  const guid = ensureSketchSubdocGuid(model);
  const doc = openSketchSubdoc(model.store, guid);
  const undoManager = createSketchUndoManager(doc);

  if (sceneFromY(doc).elements.length === 0 && model.props.sceneBlobId) {
    const blob = await model.store.blobSync.get(model.props.sceneBlobId);
    if (blob) {
      const migrated = await decodeSceneBlob(blob);
      if (migrated.elements.length) applySceneToY(doc, migrated);
    }
  }

  return {
    guid,
    doc,
    applyingRemote: false,
    toScene: () => sceneFromY(doc),
    applyScene: scene => applySceneToY(doc, scene),
    applyElements: (elements, appState, files) =>
      applyElementsToY(doc, elements, appState, files),
    observe: onChange =>
      observeSketchY(doc, () => {
        onChange();
      }),
    undo: () => undoManager.undo(),
    redo: () => undoManager.redo(),
    dispose: () => {
      undoManager.destroy();
      releaseSketchSubdoc(guid);
    },
  };
}
