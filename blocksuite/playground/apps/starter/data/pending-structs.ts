import { Text, type Workspace } from '@blocksuite/affine/store';
import * as Y from 'yjs';

import type { InitFn } from './utils.js';

export const pendingStructs: InitFn = (collection: Workspace, id: string) => {
  const doc = collection.createDoc(id).getStore({ id });
  const tempDoc = collection.createDoc('tempDoc').getStore();
  doc.load();
  tempDoc.load(() => {
    const rootId = tempDoc.addBlock('affine:page', {
      title: new Text('Pending Structs'),
    });
    const vec = Y.encodeStateVector(tempDoc.spaceDoc);

    // To avoid pending structs, uncomment the following line
    // const update = Y.encodeStateAsUpdate(tempDoc.spaceDoc);

    tempDoc.addBlock('affine:surface', {}, rootId);
    // Add note block inside root block
    const noteId = tempDoc.addBlock('affine:note', {}, rootId);
    tempDoc.addBlock(
      'affine:paragraph',
      {
        text: new Text('This is a paragraph block'),
      },
      noteId
    );
    const diff = Y.encodeStateAsUpdate(tempDoc.spaceDoc, vec);
    // To avoid pending structs, uncomment the following line
    // Y.applyUpdate(doc.spaceDoc, update);

    Y.applyUpdate(doc.spaceDoc, diff);
  });
};

pendingStructs.id = 'pending-structs';
pendingStructs.displayName = 'Pending Structs';
pendingStructs.description = 'Doc with pending structs';
