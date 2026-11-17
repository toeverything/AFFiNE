import type {
  CanvasRenderer,
  RoughCanvas,
} from '@blocksuite/affine-block-surface';
import type {
  LocalShapeElementModel,
  ShapeElementModel,
} from '@blocksuite/affine-model';

import { type Colors, drawGeneralShape } from './utils.js';

type PathBuilder = (width: number, height: number) => string;

type ExtraLines = (
  width: number,
  height: number
) => Array<{
  start: [number, number];
  end: [number, number];
}>;

type ExtraPaths = (width: number, height: number) => string[];

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

export const createPathShapeRenderer = (
  buildPath: PathBuilder,
  extraLines?: ExtraLines,
  extraPaths?: ExtraPaths
) => {
  return function renderPathShape(
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

    const { fillColor, strokeColor } = colors;

    ctx.setTransform(
      matrix
        .translateSelf(renderOffset, renderOffset)
        .translateSelf(cx, cy)
        .scaleSelf(flipX ? -1 : 1, flipY ? -1 : 1)
        .rotateSelf(rotate)
        .translateSelf(-cx, -cy)
    );

    const renderExtraPaths = () => {
      if (!extraPaths) return;
      ctx.save();
      ctx.strokeStyle = strokeStyle === 'none' ? 'transparent' : strokeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      applyLineStyle(ctx, strokeStyle, strokeWidth);
      extraPaths(renderWidth, renderHeight).forEach(path => {
        const path2d = new Path2D(path);
        ctx.stroke(path2d);
      });
      ctx.restore();
    };

    if (shapeStyle === 'General') {
      drawGeneralShape(ctx, model, renderer, filled, fillColor, strokeColor);
      if (extraLines) {
        ctx.save();
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = strokeWidth;
        ctx.lineCap = 'round';
        applyLineStyle(ctx, strokeStyle, strokeWidth);
        extraLines(renderWidth, renderHeight).forEach(({ start, end }) => {
          ctx.beginPath();
          ctx.moveTo(start[0], start[1]);
          ctx.lineTo(end[0], end[1]);
          ctx.stroke();
        });
        ctx.restore();
      }
      renderExtraPaths();
    } else {
      rc.path(buildPath(renderWidth, renderHeight), {
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
      if (extraLines) {
        extraLines(renderWidth, renderHeight).forEach(({ start, end }) => {
          rc.line(start[0], start[1], end[0], end[1], {
            seed,
            roughness: shapeStyle === 'Scribbled' ? roughness : 0,
            stroke: strokeStyle === 'none' ? 'none' : strokeColor,
            strokeWidth,
          });
        });
      }
      if (extraPaths) {
        extraPaths(renderWidth, renderHeight).forEach(path => {
          rc.path(path, {
            seed,
            roughness: shapeStyle === 'Scribbled' ? roughness : 0,
            stroke: strokeStyle === 'none' ? 'none' : strokeColor,
            strokeWidth,
          });
        });
      }
    }
  };
};
