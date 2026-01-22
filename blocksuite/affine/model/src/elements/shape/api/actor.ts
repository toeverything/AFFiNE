import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';

const actorPoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const drawActor = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;
  const headR = Math.min(w, h) * 0.15;
  const headCx = x + w / 2;
  const headCy = y + headR + h * 0.05;
  const bodyTop = headCy + headR;
  const bodyBottom = y + h * 0.72;
  const armY = y + h * 0.45;
  const armSpan = w * 0.35;
  const legSpan = w * 0.2;

  ctx.beginPath();
  ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
  ctx.moveTo(headCx, bodyTop);
  ctx.lineTo(headCx, bodyBottom);
  ctx.moveTo(headCx - armSpan, armY);
  ctx.lineTo(headCx + armSpan, armY);
  ctx.moveTo(headCx, bodyBottom);
  ctx.lineTo(headCx - legSpan, y + h);
  ctx.moveTo(headCx, bodyBottom);
  ctx.lineTo(headCx + legSpan, y + h);
};

export const actor = createCustomShape(actorPoints, drawActor);
