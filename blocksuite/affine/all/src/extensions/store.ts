import { AttachmentStoreExtension } from '@blocksuite/affine-block-attachment/store';
import { BookmarkStoreExtension } from '@blocksuite/affine-block-bookmark/store';
import { CalloutStoreExtension } from '@blocksuite/affine-block-callout/store';
import { CodeStoreExtension } from '@blocksuite/affine-block-code/store';
import { DataViewStoreExtension } from '@blocksuite/affine-block-data-view/store';
import { DatabaseStoreExtension } from '@blocksuite/affine-block-database/store';
import { DividerStoreExtension } from '@blocksuite/affine-block-divider/store';
import { EdgelessTextStoreExtension } from '@blocksuite/affine-block-edgeless-text/store';
import { EmbedStoreExtension } from '@blocksuite/affine-block-embed/store';
import { EmbedDocStoreExtension } from '@blocksuite/affine-block-embed-doc/store';
import { FrameStoreExtension } from '@blocksuite/affine-block-frame/store';
import { ImageStoreExtension } from '@blocksuite/affine-block-image/store';
import { LatexStoreExtension } from '@blocksuite/affine-block-latex/store';
import { ListStoreExtension } from '@blocksuite/affine-block-list/store';
import { NoteStoreExtension } from '@blocksuite/affine-block-note/store';
import { ParagraphStoreExtension } from '@blocksuite/affine-block-paragraph/store';
import { RootStoreExtension } from '@blocksuite/affine-block-root/store';
import { SurfaceStoreExtension } from '@blocksuite/affine-block-surface/store';
import { SurfaceRefStoreExtension } from '@blocksuite/affine-block-surface-ref/store';
import { TableStoreExtension } from '@blocksuite/affine-block-table/store';
import { FoundationStoreExtension } from '@blocksuite/affine-foundation/store';
import { BrushStoreExtension } from '@blocksuite/affine-gfx-brush/store';
import { ConnectorStoreExtension } from '@blocksuite/affine-gfx-connector/store';
import { GroupStoreExtension } from '@blocksuite/affine-gfx-group/store';
import { MindmapStoreExtension } from '@blocksuite/affine-gfx-mindmap/store';
import { ShapeStoreExtension } from '@blocksuite/affine-gfx-shape/store';
import { TextStoreExtension } from '@blocksuite/affine-gfx-text/store';
import { FootnoteStoreExtension } from '@blocksuite/affine-inline-footnote/store';
import { LatexStoreExtension as InlineLatexStoreExtension } from '@blocksuite/affine-inline-latex/store';
import { LinkStoreExtension } from '@blocksuite/affine-inline-link/store';
import { InlinePresetStoreExtension } from '@blocksuite/affine-inline-preset/store';
import { ReferenceStoreExtension } from '@blocksuite/affine-inline-reference/store';

export function getInternalStoreExtensions() {
  return [
    FoundationStoreExtension,

    AttachmentStoreExtension,
    BookmarkStoreExtension,
    CalloutStoreExtension,
    CodeStoreExtension,
    DataViewStoreExtension,
    DatabaseStoreExtension,
    DividerStoreExtension,
    EdgelessTextStoreExtension,
    EmbedStoreExtension,
    EmbedDocStoreExtension,
    FrameStoreExtension,
    ImageStoreExtension,
    LatexStoreExtension,
    ListStoreExtension,
    NoteStoreExtension,
    ParagraphStoreExtension,
    SurfaceRefStoreExtension,
    TableStoreExtension,
    SurfaceStoreExtension,
    RootStoreExtension,

    FootnoteStoreExtension,
    LinkStoreExtension,
    ReferenceStoreExtension,
    InlineLatexStoreExtension,
    InlinePresetStoreExtension,

    BrushStoreExtension,
    ShapeStoreExtension,
    MindmapStoreExtension,
    ConnectorStoreExtension,
    GroupStoreExtension,
    TextStoreExtension,
  ];
}
