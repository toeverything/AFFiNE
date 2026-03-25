import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';

const internalStoragePoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const drawInternalStorage = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;
  const inset = w * 0.15;

  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.moveTo(x + inset, y);
  ctx.lineTo(x + inset, y + h);
  ctx.moveTo(x, y + h * 0.25);
  ctx.lineTo(x + w, y + h * 0.25);
};

export const internalStorage = createCustomShape(
  internalStoragePoints,
  drawInternalStorage
);
