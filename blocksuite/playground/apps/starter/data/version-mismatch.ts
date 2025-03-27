import type { Workspace } from '@blocksuite/affine/store';
import * as Y from 'yjs';

import type { InitFn } from './utils.js';

export const versionMismatch: InitFn = (collection: Workspace, id: string) => {
  const doc = collection.createDoc(id).getStore({ id });
  const tempDoc = collection.createDoc('tempDoc').getStore();
  doc.load();

  tempDoc.load(() => {
    const rootId = tempDoc.addBlock('affine:page', {});
    tempDoc.addBlock('affine:surface', {}, rootId);
    const noteId = tempDoc.addBlock(
      'affine:note',
      { xywh: '[0, 100, 800, 640]' },
      rootId
    );
    const paragraphId = tempDoc.addBlock('affine:paragraph', {}, noteId);
    const blocks = tempDoc.spaceDoc.get('blocks') as Y.Map<unknown>;
    const paragraph = blocks.get(paragraphId) as Y.Map<unknown>;
    paragraph.set('sys:version', (paragraph.get('sys:version') as number) + 1);

    const update = Y.encodeStateAsUpdate(tempDoc.spaceDoc);

    Y.applyUpdate(doc.spaceDoc, update);
    doc.addBlock('affine:paragraph', {}, noteId);
  });

  collection.removeDoc('tempDoc');
  doc.resetHistory();
};

versionMismatch.id = 'version-mismatch';
versionMismatch.displayName = 'Version Mismatch';
versionMismatch.description = 'Error boundary when version mismatch in data';
