import type { RoughCanvas } from '@blocksuite/affine-block-surface';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

export class TriangleShape extends Shape {
  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [x, y, w, h] = this.xywh;
      rc.polygon(
        [
          [x + w / 2, y],
          [x, y + h],
          [x + w, y + h],
        ],
        this.options
      );
    } else {
      drawGeneralShape(ctx, 'triangle', this.xywh, this.options);
    }
  }
}
