import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';
import { buildCubePath } from './path-builders.js';

const cubePoints = ({ x, y, w, h }: IBound): IVec[] => {
  const isoAngle = (15 * Math.PI) / 200;
  const isoH = Math.min(w * Math.tan(isoAngle), h * 0.5);

  return [
    [x + w * 0.5, y],
    [x + w, y + isoH],
    [x + w, y + h - isoH],
    [x + w * 0.5, y + h],
    [x, y + h - isoH],
    [x, y + isoH],
  ];
};

const drawCube = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;
  const path = new Path2D(buildCubePath(w, h));
  ctx.save();
  ctx.translate(x, y);
  ctx.fill(path);
  ctx.stroke(path);
  ctx.restore();
  ctx.beginPath();
};

export const cube = createCustomShape(cubePoints, drawCube);
