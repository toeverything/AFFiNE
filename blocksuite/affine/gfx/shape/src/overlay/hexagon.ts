import type { RoughCanvas } from '@blocksuite/affine-block-surface';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

export class HexagonShape extends Shape {
  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [x, y, w, h] = this.xywh;
      rc.polygon(
        [
          [x + w * 0.25, y],
          [x + w * 0.75, y],
          [x + w, y + h / 2],
          [x + w * 0.75, y + h],
          [x + w * 0.25, y + h],
          [x, y + h / 2],
        ],
        this.options
      );
    } else {
      drawGeneralShape(ctx, 'hexagon', this.xywh, this.options);
    }
  }
}
