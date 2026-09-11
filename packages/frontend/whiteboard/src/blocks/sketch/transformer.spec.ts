import { AssetsManager, Boxed, toJSON } from '@blocksuite/affine/store';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';

import { SketchBlockSchema } from './model';
import { SKETCH_SCHEMA_VERSION, SketchBlockTransformer } from './transformer';
import type { SketchAssets } from './types';

/** A `Boxed` only reads back once its Y.Map is attached to a document. */
function attach(boxed: Boxed<SketchAssets>) {
  new Y.Doc().getMap('props').set('assets', boxed.yMap);
  return boxed;
}

function createAssets() {
  const blobs = new Map<string, Blob>();
  const manager = new AssetsManager({
    blob: {
      get: id => blobs.get(id) ?? null,
      set: (id, value) => {
        blobs.set(id, value);
        return id;
      },
      delete: id => {
        blobs.delete(id);
      },
      list: () => [...blobs.keys()],
    },
  });
  return { blobs, manager };
}

describe('wb:sketch schema migrations', () => {
  it('registers a transformer on the schema', () => {
    expect(SketchBlockSchema.version).toBe(SKETCH_SCHEMA_VERSION);
    expect(SketchBlockSchema.transformer?.(new Map())).toBeInstanceOf(
      SketchBlockTransformer
    );
  });

  it('fills props a snapshot predates and pins the schema version', async () => {
    const { manager } = createAssets();
    const node = await new SketchBlockTransformer(new Map()).fromSnapshot({
      json: {
        id: 'sketch-1',
        flavour: SketchBlockSchema.model.flavour,
        props: { sceneBlobId: 'scene-1' },
      },
      assets: manager,
      children: [],
    });

    expect(node.version).toBe(SKETCH_SCHEMA_VERSION);
    expect(node.props.sceneBlobId).toBe('scene-1');
    expect(node.props.revision).toBe(0);
    expect(node.props.assets).toBeInstanceOf(Boxed);
    expect(attach(node.props.assets).getValue()).toEqual({});
  });

  it('round-trips the current version and restores its blobs', async () => {
    const { blobs, manager } = createAssets();
    blobs.set('scene-2', new Blob(['<svg/>'], { type: 'image/svg+xml' }));
    blobs.set('blob-1', new Blob(['png'], { type: 'image/png' }));
    await manager.readFromBlob('scene-2');
    await manager.readFromBlob('blob-1');
    blobs.clear();

    const assets: SketchAssets = { 'file-1': 'blob-1' };
    const node = await new SketchBlockTransformer(new Map()).fromSnapshot({
      json: {
        id: 'sketch-2',
        flavour: SketchBlockSchema.model.flavour,
        version: SKETCH_SCHEMA_VERSION,
        props: {
          sceneBlobId: 'scene-2',
          revision: 4,
          assets: toJSON(attach(new Boxed(assets))),
        },
      },
      assets: manager,
      children: [],
    });

    expect(node.props.revision).toBe(4);
    expect(attach(node.props.assets).getValue()).toEqual(assets);
    expect([...blobs.keys()].sort()).toEqual(['blob-1', 'scene-2']);
  });
});
