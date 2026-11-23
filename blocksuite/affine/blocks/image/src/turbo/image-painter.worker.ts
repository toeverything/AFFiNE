import type {
  BlockLayout,
  BlockLayoutPainter,
} from '@blocksuite/affine-gfx-turbo-renderer';
import { BlockLayoutPainterExtension } from '@blocksuite/affine-gfx-turbo-renderer/painter';

export interface ImageLayout extends BlockLayout {
  type: 'affine:image';
  rect: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
}

function isImageLayout(layout: BlockLayout): layout is ImageLayout {
  return layout.type === 'affine:image';
}

class ImageLayoutPainter implements BlockLayoutPainter {
  paint(
    ctx: OffscreenCanvasRenderingContext2D,
    layout: BlockLayout,
    layoutBaseX: number,
    layoutBaseY: number
  ): void {
    if (!isImageLayout(layout)) {
      console.warn(
        'Expected image layout but received different format:',
        layout
      );
      return;
    }

    // For now, just paint a white rectangle
    const x = layout.rect.x - layoutBaseX;
    const y = layout.rect.y - layoutBaseY;
    const width = layout.rect.w;
    const height = layout.rect.h;

    // Draw a white rectangle with border
    ctx.fillStyle = 'white';
    ctx.fillRect(x, y, width, height);

    // Add a border
    ctx.strokeStyle = '#e0e0e0';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
  }
}

export const ImageLayoutPainterExtension = BlockLayoutPainterExtension(
  'affine:image',
  ImageLayoutPainter
);
