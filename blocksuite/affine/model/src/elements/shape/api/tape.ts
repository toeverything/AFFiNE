import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';

const tapePoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const drawTape = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;
  const curve = h * 0.2;

  ctx.beginPath();
  ctx.moveTo(x, y + curve);
  ctx.quadraticCurveTo(x + w * 0.25, y, x + w * 0.5, y + curve);
  ctx.quadraticCurveTo(x + w * 0.75, y + curve * 2, x + w, y + curve);
  ctx.lineTo(x + w, y + h - curve);
  ctx.quadraticCurveTo(x + w * 0.75, y + h, x + w * 0.5, y + h - curve);
  ctx.quadraticCurveTo(x + w * 0.25, y + h - curve * 2, x, y + h - curve);
  ctx.closePath();
};

export const tape = createCustomShape(tapePoints, drawTape);
