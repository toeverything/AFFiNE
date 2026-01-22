import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createPolygonShape } from './polygon.js';

const trapezoidPoints = ({ x, y, w, h }: IBound): IVec[] => {
  const offset = Math.min(w * 0.2, w / 2);

  return [
    [x + offset, y],
    [x + w - offset, y],
    [x + w, y + h],
    [x, y + h],
  ];
};

export const trapezoid = createPolygonShape(trapezoidPoints);
