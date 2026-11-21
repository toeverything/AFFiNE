import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createPolygonShape } from './polygon.js';

const hexagonPoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x + w * 0.25, y],
  [x + w * 0.75, y],
  [x + w, y + h / 2],
  [x + w * 0.75, y + h],
  [x + w * 0.25, y + h],
  [x, y + h / 2],
];

export const hexagon = createPolygonShape(hexagonPoints);
