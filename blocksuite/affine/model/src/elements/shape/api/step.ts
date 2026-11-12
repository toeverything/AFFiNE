import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createPolygonShape } from './polygon.js';

const stepPoints = ({ x, y, w, h }: IBound): IVec[] => {
  const size = w * 0.2;

  return [
    [x, y],
    [x + w - size, y],
    [x + w, y + h / 2],
    [x + w - size, y + h],
    [x, y + h],
    [x + size, y + h / 2],
  ];
};

export const step = createPolygonShape(stepPoints);
