import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';

const calloutPoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h * 0.75],
  [x + w * 0.6, y + h * 0.75],
  [x + w * 0.5, y + h],
  [x + w * 0.4, y + h * 0.75],
  [x, y + h * 0.75],
];

const drawCallout = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;
  const tailY = y + h * 0.75;
  const tailX = x + w * 0.5;
  const tailWidth = w * 0.2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, tailY);
  ctx.lineTo(tailX + tailWidth / 2, tailY);
  ctx.lineTo(tailX, y + h);
  ctx.lineTo(tailX - tailWidth / 2, tailY);
  ctx.lineTo(x, tailY);
  ctx.closePath();
};

export const callout = createCustomShape(calloutPoints, drawCallout);
