import { Workspace } from '@blocksuite/store';
import { describe, expect, test } from 'vitest';
import type { Doc } from 'yjs';

import { migrateToSubdoc } from '../blocksuite';

const Y = Workspace.Y;
describe('subdoc', () => {
  test('migration', async () => {
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
    const subDoc = newDoc.getMap('spaces').get('space:hello-world') as Doc;
    const data = (subDoc.toJSON() as any).blocks;
    Object.keys(data).forEach(id => {
      if (id === 'xyWNqindHH') {
        return;
      }
      expect(data[id]).toEqual(blocks[id]);
    });
  });
});
