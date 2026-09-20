# Doc Editor

This editor component is designed for conventional flow content editing, offering functionalities aligned with rich text editors based on the frameworks like ProseMirror or Slate.

<iframe src="https://try-blocksuite.vercel.app/?init" frameborder="no" width="100%" height="500"></iframe>

## Features

- [Text](../blocks/paragraph-block), [lists](../blocks/list-block), and [code](../blocks/code-block) blocks, along with customizable inline elements.
- [Images](../blocks/image-block), [attachments](../blocks/attachment-block), and customizable [embed](../blocks/embed-blocks) blocks.
- [Database](../blocks/database-block) block that provides tables with kanban view support.
- Bidirectional [links](../blocks/link-blocks) between documents and transclusion similar to Notion synced blocks.
- Two types of selections, including native text selection and block-level selection.
- Cross-block dragging and multiple widget toolbars.

Moreover, this editor inherits capabilities built into the BlockSuite framework, including:

- Per-user undo/redo stack
- Real-time collaboration
- [Document streaming](../../guide/data-synchronization#document-streaming)

Notably, the BlockSuite framework allows runtime compatibility between the page editor and the edgeless editor, beyond mere static file format compatibility. This means you can dynamically attach the same doc object to different instances of the page editor and edgeless editor.

## Usage

```ts
import { PageEditor } from '@blocksuite/presets';

const editor = new PageEditor();
```

Assigning a [`doc`](../../guide/working-with-block-tree#block-tree-basics) object to `editor.doc` will attach a block tree to the editor, and [`editor.host`](../../guide/working-with-block-tree#block-tree-in-editor) contains the API surface for editing. The [quick start](../../guide/quick-start) guide also serves as an online playground.

## Integration

Like all BlockSuite editors, the editor UI is entirely composed of the combination of [block specs](../../guide/block-spec). A specialized [root block](../blocks/root-block) spec serves as the root node of the document and implements all top-level document UI, with main widgets also mounted on the Accordingly, commonly used editing APIs are provided in the page service.

To integrate and customize this editor, you can:

- [Customize new block specs](../../guide/working-with-block-tree#defining-new-blocks)
- 🚧 Configure widgets and customize new widgets
- 🚧 Use UI components from any framework

🚧 We are planning support for more frameworks.

## Reference

- [`PageEditor`](/api/@blocksuite/presets/classes/PageEditor.html)
- [`PageRootService`](/api/@blocksuite/blocks/classes/PageRootService.html)

Since `PageEditor` is a native web component, all DOM-related properties are inherited.
