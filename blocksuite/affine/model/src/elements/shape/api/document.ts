import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';
import { buildDocumentPath } from './path-builders.js';

const documentPoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
];

const drawDocument = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;
  const path = new Path2D(buildDocumentPath(w, h));
  ctx.save();
  ctx.translate(x, y);
  ctx.fill(path);
  ctx.stroke(path);
  ctx.restore();
  ctx.beginPath();
};

export const document = createCustomShape(documentPoints, drawDocument);
