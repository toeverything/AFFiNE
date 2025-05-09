import type { RoughCanvas } from '@blocksuite/affine-block-surface';

import { Shape } from './shape';
import { drawGeneralShape } from './utils';

export class RoundedRectShape extends Shape {
  draw(ctx: CanvasRenderingContext2D, rc: RoughCanvas): void {
    if (this.shapeStyle === 'Scribbled') {
      const [x, y, w, h] = this.xywh;
      const radius = 0.1;
      const r = Math.min(w * radius, h * radius);
      const x0 = x + r;
      const x1 = x + w - r;
      const y0 = y + r;
      const y1 = y + h - r;
      const path = `
          M${x0},${y} L${x1},${y}
          A${r},${r} 0 0 1 ${x1},${y0}
          L${x1},${y1}
          A${r},${r} 0 0 1 ${x1 - r},${y1}
          L${x0 + r},${y1}
          A${r},${r} 0 0 1 ${x0},${y1 - r}
          L${x0},${y0}
          A${r},${r} 0 0 1 ${x0 + r},${y}
        `;

      rc.path(path, this.options);
    } else {
      drawGeneralShape(ctx, 'roundedRect', this.xywh, this.options);
    }
  }
}
