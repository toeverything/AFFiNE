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
  /**
   * Decoded by the layout handler on the host: the worker has no DOM, so it can
   * neither read a blob nor rasterize SVG itself. `postMessage` clones the
   * bitmap, so this copy belongs to the worker.
   */
  snapshot?: ImageBitmap;
}

/** Canvas surface the placeholder needs, so the painter stays testable. */
export type WidgetPaintContext = Pick<
  OffscreenCanvasRenderingContext2D,
  | 'fillRect'
  | 'strokeRect'
  | 'fillText'
  | 'fillStyle'
  | 'strokeStyle'
  | 'lineWidth'
  | 'font'
> & {
  drawImage(
    image: ImageBitmap,
    dx: number,
    dy: number,
    dw: number,
    dh: number
  ): void;
};

const BORDER = '#d4d4d8';
const TITLE_COLOR = '#3f3f46';
const TYPE_COLOR = '#71717a';
const SNAPSHOT_BACKDROP = '#ffffff';
const DEFAULT_FILL = '#f3f4f6';

function isWidgetLayout(layout: BlockLayout): layout is WhiteboardWidgetLayout {
  return (
    layout.type === WHITEBOARD_FLAVOURS.hello ||
    layout.type === WHITEBOARD_FLAVOURS.chart ||
    layout.type === WHITEBOARD_FLAVOURS.sketch ||
    layout.type === WHITEBOARD_FLAVOURS.board
  );
}

function widgetKind(type: string) {
  return type.startsWith('wb:') ? type.slice(3) : type;
}

export function paintWidgetLayout(
  ctx: WidgetPaintContext,
  layout: WhiteboardWidgetLayout,
  layoutBaseX: number,
  layoutBaseY: number
) {
  const x = layout.rect.x - layoutBaseX;
  const y = layout.rect.y - layoutBaseY;
  const width = layout.rect.w;
  const height = layout.rect.h;

  if (layout.snapshot) {
    ctx.fillStyle = SNAPSHOT_BACKDROP;
    ctx.fillRect(x, y, width, height);
    ctx.drawImage(layout.snapshot, x, y, width, height);
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, width, height);
    return;
  }

  ctx.fillStyle = layout.fill || DEFAULT_FILL;
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, width, height);

  if (width < 48 || height < 28) return;
  ctx.fillStyle = TITLE_COLOR;
  ctx.font = '13px sans-serif';
  ctx.fillText(layout.title || layout.type, x + 8, y + 20, width - 16);

  if (height < 44) return;
  ctx.fillStyle = TYPE_COLOR;
  ctx.font = '11px sans-serif';
  ctx.fillText(widgetKind(layout.type), x + 8, y + 36, width - 16);
}

class WhiteboardWidgetPainter implements BlockLayoutPainter {
  paint(
    ctx: OffscreenCanvasRenderingContext2D,
    layout: BlockLayout,
    layoutBaseX: number,
    layoutBaseY: number
  ): void {
    if (!isWidgetLayout(layout)) return;
    paintWidgetLayout(ctx, layout, layoutBaseX, layoutBaseY);
    layout.snapshot?.close();
  }
}

export const WhiteboardLayoutPainterExtensions = [
  BlockLayoutPainterExtension(
    WHITEBOARD_FLAVOURS.hello,
    WhiteboardWidgetPainter
  ),
  BlockLayoutPainterExtension(
    WHITEBOARD_FLAVOURS.chart,
    WhiteboardWidgetPainter
  ),
  BlockLayoutPainterExtension(
    WHITEBOARD_FLAVOURS.sketch,
    WhiteboardWidgetPainter
  ),
  BlockLayoutPainterExtension(
    WHITEBOARD_FLAVOURS.board,
    WhiteboardWidgetPainter
  ),
];
