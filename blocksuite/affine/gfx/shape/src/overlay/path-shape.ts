import type { Options, RoughCanvas } from '@blocksuite/affine-block-surface';
import type { ShapeStyle } from '@blocksuite/affine-model';
import type { XYWH } from '@blocksuite/global/gfx';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

type PathBuilder = (width: number, height: number) => string;

export class PathShape extends Shape {
  private readonly _buildPath: PathBuilder;

  constructor(
    xywh: XYWH,
    type: string,
    options: Options,
    shapeStyle: ShapeStyle,
    buildPath: PathBuilder
  ) {
    super(xywh, type, options, shapeStyle);
    this._buildPath = buildPath;
  }

  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [, , w, h] = this.xywh;
      rc.path(this._buildPath(w, h), this.options);
    } else {
      drawGeneralShape(ctx, this.type, this.xywh, this.options);
    }
  }
}
