import type { RoughCanvas } from '@blocksuite/affine-block-surface';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

export class RectShape extends Shape {
  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [x, y, w, h] = this.xywh;
      rc.rectangle(x, y, w, h, this.options);
    } else {
      drawGeneralShape(ctx, 'rect', this.xywh, this.options);
    }
  }
}
