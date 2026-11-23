import { Text, type Workspace } from '@blocksuite/affine/store';

import type { InitFn } from './utils.js';

const params = new URLSearchParams(location.search);

export const heavy: InitFn = (collection: Workspace, docId: string) => {
  const count = Number(params.get('count')) || 1000;

  const doc = collection.createDoc(docId);
  const store = doc.getStore();
  doc.load(() => {
    // Add root block and surface block at root level
    const rootId = store.addBlock('affine:page', {
      title: new Text(),
    });
    store.addBlock('affine:surface', {}, rootId);

    // Add note block inside root block
    const noteId = store.addBlock('affine:note', {}, rootId);
    for (let i = 0; i < count; i++) {
      // Add paragraph block inside note block
      store.addBlock(
        'affine:paragraph',
        {
          text: new Text('Hello, world! ' + i),
        },
        noteId
      );
    }
  });
};

heavy.id = 'heavy';
heavy.displayName = 'Heavy Example';
heavy.description = 'Heavy example on thousands of paragraph blocks';
