import { Boxed } from '@blocksuite/affine/store';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { collectReferencedSnapshotIds } from '../../infra/blob-gc';
import {
  collectSceneAssets,
  readSketchAssets,
  sameSketchAssets,
  writeSketchAssets,
} from './assets';
import { createEmptyScene } from './scene';

/** A `Boxed` only reads back once its Y.Map is attached to a document. */
function attach<T>(boxed: Boxed<T>) {
  new Y.Doc().getMap('props').set('assets', boxed.yMap);
  return boxed;
}

function createStore() {
  const blobs: Blob[] = [];
  return {
    blobs,
    blobSync: {
      set: (blob: Blob) => {
        blobs.push(blob);
        return Promise.resolve(`blob-${blobs.length}`);
      },
    },
  };
}

describe('sketch assets', () => {
  it('uploads new scene files once and keeps known blob ids', async () => {
    const store = createStore();
    const scene = createEmptyScene();
    scene.files = {
      'file-1': { dataURL: 'data:image/png;base64,aGk=' },
      'file-2': { dataURL: 'data:image/png;base64,eWE=' },
    };

    const first = await collectSceneAssets(store, scene, {});
    expect(first).toEqual({ 'file-1': 'blob-1', 'file-2': 'blob-2' });
    expect(store.blobs).toHaveLength(2);

    scene.files = { 'file-2': scene.files['file-2'] };
    const second = await collectSceneAssets(store, scene, first);
    expect(second).toEqual({ 'file-2': 'blob-2' });
    expect(store.blobs).toHaveLength(2);
    expect(sameSketchAssets(first, second)).toBe(false);
    expect(sameSketchAssets(second, { 'file-2': 'blob-2' })).toBe(true);
  });

  it('reads and writes the boxed prop', () => {
    expect(readSketchAssets(undefined)).toEqual({});
    expect(readSketchAssets({ 'file-1': 'blob-1' })).toEqual({
      'file-1': 'blob-1',
    });
    const boxed = attach(writeSketchAssets(undefined, { 'file-1': 'blob-1' }));
    expect(boxed).toBeInstanceOf(Boxed);
    expect(readSketchAssets(boxed)).toEqual({ 'file-1': 'blob-1' });
    expect(writeSketchAssets(boxed, { 'file-2': 'blob-2' })).toBe(boxed);
    expect(readSketchAssets(boxed)).toEqual({ 'file-2': 'blob-2' });
  });

  it('keeps asset blobs out of the GC sweep', () => {
    const referenced = collectReferencedSnapshotIds([
      {
        props: {
          sceneBlobId: 'scene-1',
          assets: attach(new Boxed({ 'file-1': 'blob-1' })),
        },
      },
      { props: { assets: { 'file-2': 'blob-2' } } },
    ]);
    expect([...referenced].sort()).toEqual(['blob-1', 'blob-2', 'scene-1']);
  });
});
