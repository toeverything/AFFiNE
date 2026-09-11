import {
  type BlockLayout,
  type BlockLayoutPainter,
  BlockLayoutPainterExtension,
} from '@blocksuite/affine/gfx/turbo-renderer';

import { WHITEBOARD_FLAVOURS } from '../const';

export interface WhiteboardWidgetLayout extends BlockLayout {
  title?: string;
  fill?: string;
  snapshotId?: string;
}

function isWidgetLayout(layout: BlockLayout): layout is WhiteboardWidgetLayout {
  return (
    layout.type === WHITEBOARD_FLAVOURS.hello ||
    layout.type === WHITEBOARD_FLAVOURS.chart ||
    layout.type === WHITEBOARD_FLAVOURS.sketch ||
    layout.type === WHITEBOARD_FLAVOURS.board
  );
}

class WhiteboardWidgetPainter implements BlockLayoutPainter {
  paint(
    ctx: OffscreenCanvasRenderingContext2D,
    layout: BlockLayout,
    layoutBaseX: number,
    layoutBaseY: number
  ): void {
    if (!isWidgetLayout(layout)) return;
    const x = layout.rect.x - layoutBaseX;
    const y = layout.rect.y - layoutBaseY;
    const width = layout.rect.w;
    const height = layout.rect.h;

    ctx.fillStyle = layout.fill || '#f3f4f6';
    ctx.fillRect(x, y, width, height);
    ctx.strokeStyle = '#d4d4d8';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);

    ctx.fillStyle = '#3f3f46';
    ctx.font = '13px sans-serif';
    ctx.fillText(layout.title || layout.type, x + 8, y + 20, Math.max(0, width - 16));
  }
}

export const WhiteboardLayoutPainterExtensions = [
  BlockLayoutPainterExtension(WHITEBOARD_FLAVOURS.hello, WhiteboardWidgetPainter),
  BlockLayoutPainterExtension(WHITEBOARD_FLAVOURS.chart, WhiteboardWidgetPainter),
  BlockLayoutPainterExtension(WHITEBOARD_FLAVOURS.sketch, WhiteboardWidgetPainter),
  BlockLayoutPainterExtension(WHITEBOARD_FLAVOURS.board, WhiteboardWidgetPainter),
];
