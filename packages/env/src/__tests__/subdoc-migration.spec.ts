import { readFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';
import { describe, expect, test } from 'vitest';
import * as Y from 'yjs';

import { migrateToSubdoc } from '../blocksuite';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  'workspace.ydoc'
);
const yDocBuffer = readFileSync(fixturePath);
const doc = new Y.Doc();
Y.applyUpdate(doc, new Uint8Array(yDocBuffer));
const migratedDoc = migrateToSubdoc(doc);

describe('subdoc', () => {
  test('Migration to subdoc', async () => {
    const { default: json } = await import('@affine-test/fixtures/output.json');
    const length = Object.keys(json).length;
    const binary = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      binary[i] = (json as any)[i];
    }
    const doc = new Y.Doc();
    Y.applyUpdate(doc, binary);
    {
      // invoke data
      doc.getMap('space:hello-world');
      doc.getMap('space:meta');
    }
    const blocks = doc.getMap('space:hello-world').toJSON();
    const newDoc = migrateToSubdoc(doc);
    const subDoc = newDoc.getMap('spaces').get('space:hello-world') as Y.Doc;
    const data = (subDoc.toJSON() as any).blocks;
    Object.keys(data).forEach(id => {
      if (id === 'xyWNqindHH') {
        return;
      }
      if (
        blocks[id]['sys:flavour'] === 'affine:surface' &&
        !blocks[id]['prop:elements']
      ) {
        blocks[id]['prop:elements'] = data[id]['prop:elements'];
      }
      expect(data[id]).toEqual(blocks[id]);
    });
  });

  test('Test fixture should be set correctly', () => {
    const meta = doc.getMap('space:meta');
    const versions = meta.get('versions') as Y.Map<unknown>;
    expect(versions.get('affine:code')).toBeTypeOf('number');
  });

  test('Meta data should be migrated correctly', () => {
    const originalMeta = doc.getMap('space:meta');
    const originalVersions = originalMeta.get('versions') as Y.Map<unknown>;

    const meta = migratedDoc.getMap('meta');
    const blockVersions = meta.get('blockVersions') as Y.Map<unknown>;

    expect(meta.get('workspaceVersion')).toBe(1);
    expect(blockVersions.get('affine:code')).toBe(
      originalVersions.get('affine:code')
    );
    expect((meta.get('pages') as Y.Array<unknown>).length).toBe(
      (originalMeta.get('pages') as Y.Array<unknown>).length
    );

    expect(blockVersions.get('affine:embed')).toBeUndefined();
    expect(blockVersions.get('affine:image')).toBe(
      originalVersions.get('affine:embed')
    );

    expect(blockVersions.get('affine:frame')).toBeUndefined();
    expect(blockVersions.get('affine:note')).toBe(
      originalVersions.get('affine:frame')
    );
  });
});
