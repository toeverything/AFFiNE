import { CodeLayoutPainterExtension } from '@blocksuite/affine/blocks/code';
import { ImageLayoutPainterExtension } from '@blocksuite/affine/blocks/image';
import { ListLayoutPainterExtension } from '@blocksuite/affine/blocks/list';
import { NoteLayoutPainterExtension } from '@blocksuite/affine/blocks/note';
import { ParagraphLayoutPainterExtension } from '@blocksuite/affine/blocks/paragraph';
import { ViewportLayoutPainter } from '@blocksuite/affine/gfx/turbo-renderer';
import { WhiteboardLayoutPainterExtensions } from '@affine/whiteboard/turbo-painter';

new ViewportLayoutPainter([
  ParagraphLayoutPainterExtension,
  ListLayoutPainterExtension,
  NoteLayoutPainterExtension,
  CodeLayoutPainterExtension,
  ImageLayoutPainterExtension,
  ...WhiteboardLayoutPainterExtensions,
]);
