import type {
  CanvasRenderer,
  RoughCanvas,
} from '@blocksuite/affine-block-surface';
import type {
  LocalShapeElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';

import {
  buildPathFromStencil,
  type StencilShapeData,
} from '../../drawio/stencil-utils.js';
import { type Colors, resolveGradientFill } from './utils.js';

const applyLineStyle = (
  ctx: CanvasRenderingContext2D,
  strokeStyle: string,
  strokeWidth: number
) => {
  switch (strokeStyle) {
    case 'dash':
      ctx.setLineDash([12, 12]);
      break;
    case 'dot':
      ctx.setLineDash([Math.max(1, strokeWidth), strokeWidth * 2.5]);
      ctx.lineCap = 'round';
      break;
    default:
      ctx.setLineDash([]);
  }
};

export const createStencilShapeRenderer = (stencil: StencilShapeData) => {
  return function renderStencilShape(
    model: ShapeElementModel | LocalShapeElementModel,
    ctx: CanvasRenderingContext2D,
    matrix: DOMMatrix,
    _renderer: CanvasRenderer,
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
    const { fillColor, strokeColor } = colors;

    ctx.setTransform(
      matrix
        .translateSelf(renderOffset, renderOffset)
        .translateSelf(cx, cy)
        .scaleSelf(flipX ? -1 : 1, flipY ? -1 : 1)
        .rotateSelf(rotate)
        .translateSelf(-cx, -cy)
    );

    const drawPaths = (
      paths: StencilShapeData['paths'],
      fill: boolean,
      stroke: boolean
    ) => {
      for (const commands of paths) {
        const path = buildPathFromStencil(commands, renderWidth, renderHeight);
        if (shapeStyle === 'Scribbled') {
          rc.path(path, {
            seed,
            roughness: shapeStyle === 'Scribbled' ? roughness : 0,
            stroke: stroke ? strokeColor : 'none',
            strokeWidth,
            fill: fill && filled ? fillColor : undefined,
            strokeLineDash:
              strokeStyle === 'dash'
                ? [12, 12]
                : strokeStyle === 'dot'
                  ? [Math.max(1, strokeWidth), strokeWidth * 2.5]
                  : undefined,
          });
        } else {
          const path2d = new Path2D(path);
          ctx.save();
          ctx.lineWidth = strokeWidth;
          ctx.strokeStyle =
            strokeStyle === 'none' ? 'transparent' : strokeColor;
          ctx.fillStyle = filled
            ? resolveGradientFill(
                ctx,
                _renderer,
                model,
                fillColor,
                renderWidth,
                renderHeight
              )
            : 'transparent';
          applyLineStyle(ctx, strokeStyle, strokeWidth);
          if (fill && filled) {
            ctx.fill(path2d);
          }
          if (stroke) {
            ctx.stroke(path2d);
          }
          ctx.restore();
        }
      }
    };

    const fillPaths =
      stencil.paths.length > 0 ? stencil.paths : stencil.strokes;
    drawPaths(fillPaths, true, true);
    if (stencil.paths.length > 0 && stencil.strokes.length > 0) {
      drawPaths(stencil.strokes, false, true);
    }
  };
};
