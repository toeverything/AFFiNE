import type {
  CanvasRenderer,
  RoughCanvas,
} from '@blocksuite/affine-block-surface';
import type {
  LocalShapeElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';

import { type Colors, drawGeneralShape } from './utils.js';

export function diamond(
  model: ShapeElementModel | LocalShapeElementModel,
  ctx: CanvasRenderingContext2D,
  matrix: DOMMatrix,
  renderer: CanvasRenderer,
  rc: RoughCanvas,
  colors: Colors
) {
  const {
    seed,
    strokeWidth,
    filled,
    strokeStyle,
    roughness,
    rotate,
    shapeStyle,
  } = model;
  const [, , w, h] = model.deserializedXYWH;
  const renderOffset = Math.max(strokeWidth, 0) / 2;
  const renderWidth = w - renderOffset * 2;
  const renderHeight = h - renderOffset * 2;
  const cx = renderWidth / 2;
  const cy = renderHeight / 2;

  const { fillColor, strokeColor } = colors;

  ctx.setTransform(
    matrix
      .translateSelf(renderOffset, renderOffset)
      .translateSelf(cx, cy)
      .rotateSelf(rotate)
      .translateSelf(-cx, -cy)
  );

  if (shapeStyle === 'General') {
    drawGeneralShape(ctx, model, renderer, filled, fillColor, strokeColor);
  } else {
    rc.polygon(
      [
        [renderWidth / 2, 0],
        [renderWidth, renderHeight / 2],
        [renderWidth / 2, renderHeight],
        [0, renderHeight / 2],
      ],
      {
        seed,
        roughness: shapeStyle === 'Scribbled' ? roughness : 0,
        strokeLineDash: strokeStyle === 'dash' ? [12, 12] : undefined,
        stroke: strokeStyle === 'none' ? 'none' : strokeColor,
        strokeWidth,
        fill: filled ? fillColor : undefined,
      }
    );
  }
}
