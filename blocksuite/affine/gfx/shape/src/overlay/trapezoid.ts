import type { RoughCanvas } from '@blocksuite/affine-block-surface';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

export class TrapezoidShape extends Shape {
  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [x, y, w, h] = this.xywh;
      const offset = Math.min(w * 0.2, w / 2);
      rc.polygon(
        [
          [x + offset, y],
          [x + w - offset, y],
          [x + w, y + h],
          [x, y + h],
        ],
        this.options
      );
    } else {
      drawGeneralShape(ctx, 'trapezoid', this.xywh, this.options);
    }
  }
}
