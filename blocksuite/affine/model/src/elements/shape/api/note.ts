import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';

const notePoints = ({ x, y, w, h }: IBound): IVec[] => {
  const fold = Math.min(w, h) * 0.2;

  return [
    [x, y],
    [x + w - fold, y],
    [x + w, y + fold],
    [x + w, y + h],
    [x, y + h],
  ];
};

const drawNote = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;
  const fold = Math.min(w, h) * 0.2;

  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w - fold, y);
  ctx.lineTo(x + w, y + fold);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();

  ctx.moveTo(x + w - fold, y);
  ctx.lineTo(x + w - fold, y + fold);
  ctx.lineTo(x + w, y + fold);
};

export const note = createCustomShape(notePoints, drawNote);
