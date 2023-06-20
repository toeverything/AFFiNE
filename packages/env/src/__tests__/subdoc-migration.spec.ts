import { Workspace } from '@blocksuite/store';
import { describe, test } from 'vitest';

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
    const newDoc = migrateToSubdoc(doc);
    console.log(newDoc.toJSON());
  });
});
