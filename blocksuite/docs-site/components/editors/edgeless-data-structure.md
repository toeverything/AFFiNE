# Edgeless Data Structure

## Fundamentals

In BlockSuite, documents in edgeless mode are isomorphic to those in page mode. Edgeless documents are also composed of blocks, with no data conversion occurring during mode switching.

By default, the root block of a rich text document contains a single note block child, with a block tree structure like this:

```
Root Block
  Note Block
    Paragraph Block 1
    Paragraph Block 2
    Paragraph Block 3
```

In the edgeless editor, you can easily split the document into multiple note cards, which can be positioned separately on the edgeless canvas, resulting in this block tree structure:

```
Root Block
  Note Block
    Paragraph Block 1
  Note Block
    Paragraph Block 2
    Paragraph Block 3
```

## Surface Block and Surface Element

Edgeless mode introduces additional editable content such as brushes, connectors, and geometric shapes. To accommodate this, the edgeless editor implements a **surface block** as a container for whiteboard graphical content. Documents compatible with both edgeless and page modes have a default surface block as the first child of the root block:

```
Root Block
  Surface Block
  Note Block
    Paragraph Block 1
  Note Block
    Paragraph Block 2
    Paragraph Block 3
```

The surface block can store two types of content:

- The `block.children` field can contain edgeless-specific card blocks, such as embed-style links to YouTube, Figma, or other BlockSuite documents.
- Graphical content like brushstrokes and polygons are modeled as `SurfaceElement`s and stored in the `block.elements` field. Common element types include `BrushElement`, `ShapeElement`, and `ConnectorElement`.

A typical edgeless document structure with a surface block might look like this:

```
Root Block
  Surface Block
    Embed Block
    Shape Element
    Brush Element
  Note Block
    Paragraph Block 1
  Note Block
    Paragraph Block 2
    Paragraph Block 3
```

## Surface Block as Parent Block

With the introduction of the surface block, blocks can have two potential storage locations:

- Blocks used exclusively in the edgeless editor without nesting can be stored as direct children of the surface block.
- Other blocks are stored outside the surface block, as in rich text mode. These blocks can be reused between rich text and edgeless editor modes and allow complex nesting structures.

BlockSuite allows specific block types to appear in both locations. For example:

```
Root Block
  Surface Block
    Image Block 1
  Note Block
    Image Block 2
    Image Block 3
```

In the example above, the image blocks appear under both the note block and the surface block. The edgeless editor can display all three image blocks simultaneously. The key difference is that the image with the surface block as its parent can be placed anywhere on the whiteboard, while the images within the note block must be arranged from top to bottom according to the note's internal layout.

## Block and Element Hierarchy

Although the block tree shows node adjacency, this relationship doesn't determine the content hierarchy in the whiteboard, which needs to render both blocks and surface elements.

Instead, BlockSuite allows specific block types to determine hierarchy order along with surface elements, including:

- Note blocks
- All children of the surface block

Blocks with adjustable hierarchy dynamically receive an `index` field. Since all surface elements also have this field, comparing the `index` values of these indexable blocks and elements uniquely determines the edgeless content hierarchy.

In this example:

```
Root Block
  Surface Block
    Brush Element
    Image Block 1
  Note Block
    Paragraph Block 1
    Paragraph Block 2
    Image Block 2
```

The note block and image block 1 have `index` fields and can adjust their hierarchy order along with the brush element. The paragraph blocks and image block 2 within the note block are rendered as children of the note block and don't intersect with surface elements hierarchically.

All indexable blocks and surface elements have an `xywh` field, determining their absolute position on the edgeless canvas.

> This hierarchy determination technique is called fractional indexing, [also used by Figma](https://www.figma.com/blog/realtime-editing-of-ordered-sequences/).

## Frames and Groups

There are two ways to associate blocks and/or elements in the edgeless editor: **frames** and **groups**.

- Frame blocks are surface-only blocks with specific `xywh` dimensions. Dragging a frame moves all blocks and elements within its `xywh` area, establishing a dynamic association based on geometric region. Multiple frames can overlap positionally but cannot nest in the block tree.
- Group elements are special surface elements without inherent dimensions, determined by their children. Groups store the IDs of all child nodes. All indexable blocks and elements can be group children, and groups can nest multiple levels.

Developers can extend these association mechanisms to create more dynamic nesting relationships, implementing element types like `MindmapElement` with more dynamic linking effects.
