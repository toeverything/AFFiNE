import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';

const cylinderPoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const drawCylinder = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;
  const rx = w / 2;
  const ry = Math.min(h * 0.18, w * 0.25);
  const topY = y + ry;
  const bottomY = y + h - ry;

  ctx.beginPath();
  ctx.moveTo(x, topY);
  ctx.ellipse(x + rx, topY, rx, ry, 0, Math.PI, 0);
  ctx.lineTo(x + w, bottomY);
  ctx.ellipse(x + rx, bottomY, rx, ry, 0, 0, Math.PI);
  ctx.closePath();

  ctx.moveTo(x + rx, topY);
  ctx.ellipse(x + rx, topY, rx, ry, 0, 0, Math.PI * 2);
};

export const cylinder = createCustomShape(cylinderPoints, drawCylinder);
