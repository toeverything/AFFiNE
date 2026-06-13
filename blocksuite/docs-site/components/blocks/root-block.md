# Root Block

This is the root node of the document tree, and its view implementation becomes the top-level UI of the editor.

For instance, the [page editor](../editors/page-editor) and the [edgeless editor](../editors/edgeless-editor) implement two different views for the root block. Generally, content (leaf nodes) is not placed directly in the root block. Its direct children are usually at least one [note block](./note-block) and one optional [surface block](./surface-block). Rich text content like paragraphs and lists are generally placed in the note blocks, while graphical content is placed in the surface block.

![block-nesting](../../images/block-nesting.png)

## Reference

- [`RootBlockSchema`](/api/@blocksuite/blocks/variables/RootBlockSchema.html)
- [`PageRootService`](/api/@blocksuite/blocks/classes/PageRootService.html)
- [`EdgelessRootService`](/api/@blocksuite/blocks/classes/EdgelessRootService.html)
