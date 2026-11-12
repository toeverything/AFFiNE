import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';

const cloudPoints = ({ x, y, w, h }: IBound): IVec[] => [
  [x + w * 0.15, y + h * 0.25],
  [x + w * 0.35, y + h * 0.1],
  [x + w * 0.6, y + h * 0.12],
  [x + w * 0.85, y + h * 0.3],
  [x + w * 0.9, y + h * 0.55],
  [x + w * 0.75, y + h * 0.8],
  [x + w * 0.5, y + h * 0.9],
  [x + w * 0.25, y + h * 0.82],
  [x + w * 0.1, y + h * 0.6],
];

const drawCloud = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;
  const cy = y + h * 0.55;
  const r = Math.min(w, h) * 0.18;

  ctx.beginPath();
  ctx.moveTo(x + w * 0.18, cy + r * 0.6);
  ctx.bezierCurveTo(
    x + w * 0.05,
    cy + r * 0.4,
    x + w * 0.05,
    cy - r * 0.6,
    x + w * 0.22,
    cy - r * 0.6
  );
  ctx.bezierCurveTo(
    x + w * 0.25,
    y + h * 0.2,
    x + w * 0.38,
    y + h * 0.05,
    x + w * 0.52,
    y + h * 0.18
  );
  ctx.bezierCurveTo(
    x + w * 0.62,
    y + h * 0.02,
    x + w * 0.8,
    y + h * 0.12,
    x + w * 0.8,
    y + h * 0.3
  );
  ctx.bezierCurveTo(
    x + w * 0.95,
    y + h * 0.35,
    x + w * 0.95,
    cy + r * 0.4,
    x + w * 0.82,
    cy + r * 0.5
  );
  ctx.bezierCurveTo(
    x + w * 0.78,
    y + h * 0.9,
    x + w * 0.6,
    y + h * 0.92,
    x + w * 0.5,
    y + h * 0.82
  );
  ctx.bezierCurveTo(
    x + w * 0.4,
    y + h * 0.95,
    x + w * 0.22,
    y + h * 0.92,
    x + w * 0.2,
    cy + r * 0.7
  );
  ctx.closePath();
};

export const cloud = createCustomShape(cloudPoints, drawCloud);
