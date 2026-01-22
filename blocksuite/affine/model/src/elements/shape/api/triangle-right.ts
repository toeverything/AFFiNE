import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createPolygonShape } from './polygon.js';

const triangleRightPoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x, y],
  [x + w, y + h / 2],
  [x, y + h],
];

export const triangleRight = createPolygonShape(triangleRightPoints);
