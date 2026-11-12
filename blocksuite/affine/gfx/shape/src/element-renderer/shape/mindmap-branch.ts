import type {
  CanvasRenderer,
  RoughCanvas,
} from '@blocksuite/affine-block-surface';
import type {
  LocalShapeElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';

import type { Colors } from './utils.js';

export function mindmapBranch(
  model: ShapeElementModel | LocalShapeElementModel,
  ctx: CanvasRenderingContext2D,
  matrix: DOMMatrix,
  _renderer: CanvasRenderer,
  rc: RoughCanvas,
  colors: Colors
) {
  const { strokeStyle, strokeWidth, shapeStyle, rotate, flipX, flipY } = model;
  const [, , w, h] = model.deserializedXYWH;
  const renderOffset = Math.max(strokeWidth, 0) / 2;
  const renderWidth = Math.max(w - renderOffset * 2, 0);
  const renderHeight = Math.max(h - renderOffset * 2, 0);
  const cx = renderWidth / 2;
  const cy = renderHeight / 2;
  const lineY = renderHeight / 2;

  ctx.save();
  ctx.setTransform(
    DOMMatrix.fromMatrix(matrix)
      .translateSelf(renderOffset, renderOffset)
      .translateSelf(cx, cy)
      .scaleSelf(flipX ? -1 : 1, flipY ? -1 : 1)
      .rotateSelf(rotate)
      .translateSelf(-cx, -cy)
  );

  if (shapeStyle === 'General') {
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(renderWidth, lineY);
    ctx.closePath();
    ctx.lineWidth = strokeWidth;
    ctx.strokeStyle =
      strokeStyle === 'none' ? 'transparent' : colors.strokeColor;
    switch (strokeStyle) {
      case 'dash':
        ctx.setLineDash([12, 12]);
        break;
      case 'dot':
        ctx.lineCap = 'round';
        ctx.setLineDash([Math.max(1, strokeWidth), strokeWidth * 2.5]);
        break;
      default:
        ctx.setLineDash([]);
    }
    ctx.stroke();
  } else {
    rc.line(0, lineY, renderWidth, lineY, {
      stroke: strokeStyle === 'none' ? 'none' : colors.strokeColor,
      strokeWidth,
      roughness: model.roughness,
      seed: model.seed,
      strokeLineDash:
        strokeStyle === 'dash'
          ? [12, 12]
          : strokeStyle === 'dot'
            ? [Math.max(1, strokeWidth), strokeWidth * 2.5]
            : undefined,
    });
  }

  ctx.restore();
}
