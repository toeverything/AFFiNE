import type {
  CanvasRenderer,
  RoughCanvas,
} from '@blocksuite/affine-block-surface';
import type {
  LocalShapeElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';

import { type Colors, drawGeneralShape } from './utils.js';

export function trapezoid(
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
    flipX,
    flipY,
  } = model;
  const [, , w, h] = model.deserializedXYWH;
  const renderOffset = Math.max(strokeWidth, 0) / 2;
  const renderWidth = w - renderOffset * 2;
  const renderHeight = h - renderOffset * 2;
  const cx = renderWidth / 2;
  const cy = renderHeight / 2;
  const offset = Math.min(renderWidth * 0.2, renderWidth / 2);

  const { fillColor, strokeColor } = colors;

  ctx.setTransform(
    matrix
      .translateSelf(renderOffset, renderOffset)
      .translateSelf(cx, cy)
      .scaleSelf(flipX ? -1 : 1, flipY ? -1 : 1)
      .rotateSelf(rotate)
      .translateSelf(-cx, -cy)
  );

  const points: [number, number][] = [
    [offset, 0],
    [renderWidth - offset, 0],
    [renderWidth, renderHeight],
    [0, renderHeight],
  ];

  if (shapeStyle === 'General') {
    drawGeneralShape(ctx, model, renderer, filled, fillColor, strokeColor);
  } else {
    rc.polygon(points, {
      seed,
      roughness: shapeStyle === 'Scribbled' ? roughness : 0,
      strokeLineDash:
        strokeStyle === 'dash'
          ? [12, 12]
          : strokeStyle === 'dot'
            ? [Math.max(1, strokeWidth), strokeWidth * 2.5]
            : undefined,
      stroke: strokeStyle === 'none' ? 'none' : strokeColor,
      strokeWidth,
      fill: filled ? fillColor : undefined,
    });
  }
}
