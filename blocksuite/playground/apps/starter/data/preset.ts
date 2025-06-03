import { Text, type Workspace } from '@blocksuite/affine/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { getTestStoreManager } from '@blocksuite/integration-test/store';

import type { InitFn } from './utils.js';

const presetMarkdown = `Click the 🔁 button to switch between editors dynamically - they are fully compatible!`;

export const preset: InitFn = async (collection: Workspace, id: string) => {
  let doc = collection.getDoc(id);
  const hasDoc = !!doc;
  if (!doc) {
    doc = collection.createDoc(id);
  }

  const store = doc.getStore({ id });
  store.load();

  // Run only once on all clients.
  let noteId: string;
  if (!hasDoc) {
    // Add root block and surface block at root level
    const rootId = store.addBlock('affine:page', {
      title: new Text('BlockSuite Playground'),
    });
    store.addBlock('affine:surface', {}, rootId);

    // Add note block inside root block
    noteId = store.addBlock(
      'affine:note',
      { xywh: '[0, 100, 800, 640]' },
      rootId
    );
    // Import preset markdown content inside note block
    await MarkdownTransformer.importMarkdownToBlock({
      doc: store,
      blockId: noteId,
      markdown: presetMarkdown,
      extensions: getTestStoreManager().get('store'),
    });
  }

  store.resetHistory();
};

preset.id = 'preset';
preset.displayName = 'BlockSuite Starter';
preset.description = 'Start from friendly introduction';
