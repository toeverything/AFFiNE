import type { RoughCanvas } from '@blocksuite/affine-block-surface';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

export class TriangleRightShape extends Shape {
  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [x, y, w, h] = this.xywh;
      rc.polygon(
        [
          [x, y],
          [x + w, y + h / 2],
          [x, y + h],
        ],
        this.options
      );
    } else {
      drawGeneralShape(ctx, 'triangleRight', this.xywh, this.options);
    }
  }
}
