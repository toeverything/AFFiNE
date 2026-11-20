import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';

const logicOrPoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x, y],
  [x + w, y + h / 2],
  [x, y + h],
];

const drawLogicOr = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + w * 0.45, y + h * 0.05, x + w * 0.7, y + h / 2);
  ctx.quadraticCurveTo(x + w * 0.45, y + h * 0.95, x, y + h);
  ctx.quadraticCurveTo(x + w * 0.2, y + h * 0.5, x, y);
  ctx.closePath();
};

export const logicOr = createCustomShape(logicOrPoints, drawLogicOr);
