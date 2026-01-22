import type { RoughCanvas } from '@blocksuite/affine-block-surface';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

export class StepShape extends Shape {
  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [x, y, w, h] = this.xywh;
      const size = w * 0.2;
      rc.polygon(
        [
          [x, y],
          [x + w - size, y],
          [x + w, y + h / 2],
          [x + w - size, y + h],
          [x + w, y + h],
          [x, y + h],
          [x + size, y + h / 2],
        ],
        this.options
      );
    } else {
      drawGeneralShape(ctx, 'step', this.xywh, this.options);
    }
  }
}
