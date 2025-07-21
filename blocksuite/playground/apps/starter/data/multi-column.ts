import { Text, type Workspace } from '@blocksuite/affine/store';
import { MarkdownTransformer } from '@blocksuite/affine/widgets/linked-doc';
import { getTestStoreManager } from '@blocksuite/integration-test/store';

import type { InitFn } from './utils.js';

const multiColumnMarkdown = `# Multi-Column Layout Demo

This is a demonstration of the multi-column layout feature in BlockSuite.

## Features

- **Flexible Layout**: Create multiple columns with adjustable widths
- **Drag & Drop**: Move content between columns easily
- **Responsive Design**: Columns adapt to different screen sizes
- **Rich Content**: Support for all block types within columns

## Usage

1. Click the "+" button to add new columns
2. Drag the resize handles to adjust column widths
3. Drop content into any column
4. Use the column menu for additional options

---

*Try creating some content in the columns below!*`;

export const multiColumn: InitFn = async (
  collection: Workspace,
  id: string
) => {
  let doc = collection.getDoc(id);
  const hasDoc = !!doc;
  if (!doc) {
    doc = collection.createDoc(id);
  }

  const store = doc.getStore({ id });
  store.load();

  // Run only once on all clients.
  if (!hasDoc) {
    // Add root block and surface block at root level
    const rootId = store.addBlock('affine:page', {
      title: new Text('Multi-Column Layout Demo'),
    });
    store.addBlock('affine:surface', {}, rootId);

    // Add note block inside root block
    const noteId = store.addBlock(
      'affine:note',
      { xywh: '[0, 100, 800, 640]' },
      rootId
    );

    // Import preset markdown content inside note block
    await MarkdownTransformer.importMarkdownToBlock({
      doc: store,
      blockId: noteId,
      markdown: multiColumnMarkdown,
      extensions: getTestStoreManager().get('store'),
    });

    // Add multi-column container
    const multiColumnContainerId = store.addBlock(
      'affine:multi-column-container',
      {
        gap: 20, // 20px gap between columns
      },
      noteId
    );

    // Add first column with some content
    const column1Id = store.addBlock(
      'affine:column',
      {
        widthPercentage: 50,
      },
      multiColumnContainerId
    );

    store.addBlock(
      'affine:paragraph',
      {
        text: new Text('• Lists work great in columns'),
        type: 'text',
      },
      column1Id
    );

    store.addBlock(
      'affine:paragraph',
      {
        text: new Text('• Perfect for organizing content'),
        type: 'text',
      },
      column1Id
    );

    // Add second column with different content
    const column2Id = store.addBlock(
      'affine:column',
      {
        widthPercentage: 50,
      },
      multiColumnContainerId
    );

    // Add content to second column
    store.addBlock(
      'affine:paragraph',
      {
        text: new Text('This is the second column with different content.'),
        type: 'text',
      },
      column2Id
    );

    store.addBlock(
      'affine:paragraph',
      {
        text: new Text(
          'You can resize columns by dragging the handles between them.'
        ),
        type: 'text',
      },
      column2Id
    );

    // Add a code block in the second column
    store.addBlock(
      'affine:code',
      {
        text: new Text(
          '// Example code in column\nconsole.log("Hello from column 2!");'
        ),
        language: 'javascript',
      },
      column2Id
    );

    // Add another note block to demonstrate multiple multi-column containers
    const note2Id = store.addBlock(
      'affine:note',
      { xywh: '[0, 800, 800, 400]' },
      rootId
    );

    store.addBlock(
      'affine:paragraph',
      {
        text: new Text('Three-Column Layout Example'),
        type: 'h2',
      },
      note2Id
    );

    // Add a three-column container
    const multiColumn3Id = store.addBlock(
      'affine:multi-column-container',
      {
        gap: 16,
      },
      note2Id
    );

    // Add three columns
    for (let i = 1; i <= 3; i++) {
      const columnId = store.addBlock(
        'affine:column',
        {
          widthPercentage: 33.33,
        },
        multiColumn3Id
      );

      store.addBlock(
        'affine:paragraph',
        {
          text: new Text(`Column ${i}`),
          type: 'h3',
        },
        columnId
      );

      store.addBlock(
        'affine:paragraph',
        {
          text: new Text(
            `Content for column ${i}. This demonstrates how multiple columns can be used to organize information effectively.`
          ),
          type: 'text',
        },
        columnId
      );
    }
  }

  store.resetHistory();
};

multiColumn.id = 'multi-column';
multiColumn.displayName = 'Multi-Column Layout';
multiColumn.description = 'Demonstrate multi-column layout capabilities';
