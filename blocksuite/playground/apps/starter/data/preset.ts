import { Text, type Workspace } from '@blocksuite/affine/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { getTestStoreManager } from '@blocksuite/integration-test/store';

import type { InitFn } from './utils.js';

const presetMarkdown = `Click the 🔁 button to switch between editors dynamically - they are fully compatible!`;

export const preset: InitFn = async (collection: Workspace, id: string) => {
  const doc = collection.createDoc(id).getStore({ id });
  doc.load();
  // Add root block and surface block at root level
  const rootId = doc.addBlock('affine:page', {
    title: new Text('BlockSuite Playground'),
  });
  doc.addBlock('affine:surface', {}, rootId);

  // Add note block inside root block
  const noteId = doc.addBlock(
    'affine:note',
    { xywh: '[0, 100, 800, 640]' },
    rootId
  );

  // Import preset markdown content inside note block
  await MarkdownTransformer.importMarkdownToBlock({
    doc,
    blockId: noteId,
    markdown: presetMarkdown,
    extensions: getTestStoreManager().get('store'),
  });

  doc.resetHistory();
};

preset.id = 'preset';
preset.displayName = 'BlockSuite Starter';
preset.description = 'Start from friendly introduction';
