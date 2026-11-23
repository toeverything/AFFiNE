import type { RoughCanvas } from '@blocksuite/affine-block-surface';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

export class EllipseShape extends Shape {
  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [x, y, w, h] = this.xywh;
      rc.ellipse(x + w / 2, y + h / 2, w, h, this.options);
    } else {
      drawGeneralShape(ctx, 'ellipse', this.xywh, this.options);
    }
  }
}
