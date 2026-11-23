import { ImageLayoutPainterExtension } from '@blocksuite/affine-block-image/turbo-painter';
import { ListLayoutPainterExtension } from '@blocksuite/affine-block-list/turbo-painter';
import { NoteLayoutPainterExtension } from '@blocksuite/affine-block-note/turbo-painter';
import { ParagraphLayoutPainterExtension } from '@blocksuite/affine-block-paragraph/turbo-painter';
import { ViewportLayoutPainter } from '@blocksuite/affine-gfx-turbo-renderer/painter';

new ViewportLayoutPainter([
  ParagraphLayoutPainterExtension,
  ListLayoutPainterExtension,
  NoteLayoutPainterExtension,
  ImageLayoutPainterExtension,
]);
