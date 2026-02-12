import type { Options, RoughCanvas } from '@blocksuite/affine-block-surface';
import type { ShapeStyle } from '@blocksuite/affine-model';
import type { XYWH } from '@blocksuite/global/gfx';

import {
  buildPathFromStencil,
  type StencilShapeData,
} from '../drawio/stencil-utils.js';
import { Shape } from './shape';

const drawStencilPaths = (
  ctx: CanvasRenderingContext2D,
  rc: RoughCanvas,
  paths: StencilShapeData['paths'],
  strokeOnly: boolean,
  xywh: XYWH,
  options: Options,
  shapeStyle: ShapeStyle
) => {
  const [x, y, w, h] = xywh;
  const strokeWidth = options.strokeWidth ?? 2;
  const renderOffset = Math.max(strokeWidth, 0) / 2;
  const renderWidth = w - renderOffset * 2;
  const renderHeight = h - renderOffset * 2;

  if (shapeStyle === 'Scribbled') {
    ctx.save();
    ctx.translate(x + renderOffset, y + renderOffset);
    for (const commands of paths) {
      const path = buildPathFromStencil(commands, renderWidth, renderHeight);
      rc.path(path, options);
    }
    ctx.restore();
    return;
  }

  ctx.save();
  ctx.translate(x + renderOffset, y + renderOffset);
  ctx.setLineDash(options.strokeLineDash ?? []);
  ctx.strokeStyle = options.stroke ?? 'transparent';
  ctx.lineWidth = strokeWidth;
  ctx.fillStyle = strokeOnly ? 'transparent' : (options.fill ?? 'transparent');

  for (const commands of paths) {
    const path = buildPathFromStencil(commands, renderWidth, renderHeight);
    const path2d = new Path2D(path);
    if (!strokeOnly) {
      ctx.fill(path2d);
    }
    ctx.stroke(path2d);
  }
  ctx.restore();
};

export class StencilShape extends Shape {
  private readonly _stencil: StencilShapeData;

  constructor(
    xywh: XYWH,
    type: string,
    options: Options,
    shapeStyle: ShapeStyle,
    stencil: StencilShapeData
  ) {
    super(xywh, type, options, shapeStyle);
    this._stencil = stencil;
  }

  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    drawStencilPaths(
      ctx,
      rc,
      this._stencil.paths,
      false,
      this.xywh,
      this.options,
      this.shapeStyle
    );
    if (this._stencil.strokes.length > 0) {
      drawStencilPaths(
        ctx,
        rc,
        this._stencil.strokes,
        true,
        this.xywh,
        this.options,
        this.shapeStyle
      );
    }
  }
}
