import type { RoughCanvas } from '@blocksuite/affine-block-surface';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

export class DiamondShape extends Shape {
  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [x, y, w, h] = this.xywh;
      rc.polygon(
        [
          [x + w / 2, y],
          [x + w, y + h / 2],
          [x + w / 2, y + h],
          [x, y + h / 2],
        ],
        this.options
      );
    } else {
      drawGeneralShape(ctx, 'diamond', this.xywh, this.options);
    }
  }
}
