import type { IBound, IVec } from '@blocksuite/global/gfx';

import { createCustomShape } from './custom.js';

const CLOUD_PATH_SEGMENTS: [IVec, IVec, IVec, IVec][] = [
  [
    [0.25, 0.25],
    [0.05, 0.25],
    [0, 0.5],
    [0.16, 0.5],
  ],
  [
    [0.16, 0.5],
    [0, 0.66],
    [0.18, 0.9],
    [0.31, 0.8],
  ],
  [
    [0.31, 0.8],
    [0.4, 1],
    [0.7, 1],
    [0.8, 0.8],
  ],
  [
    [0.8, 0.8],
    [1, 0.8],
    [1, 0.6],
    [0.875, 0.5],
  ],
  [
    [0.875, 0.5],
    [1, 0.3],
    [0.8, 0.1],
    [0.625, 0.2],
  ],
  [
    [0.625, 0.2],
    [0.5, 0.05],
    [0.3, 0.05],
    [0.25, 0.25],
  ],
];

const cubicBezierPoint = (
  p0: IVec,
  p1: IVec,
  p2: IVec,
  p3: IVec,
  t: number
): IVec => {
  const it = 1 - t;
  const it2 = it * it;
  const t2 = t * t;
  const b0 = it2 * it;
  const b1 = 3 * it2 * t;
  const b2 = 3 * it * t2;
  const b3 = t2 * t;

  return [
    b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
    b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1],
  ];
};

const cloudPoints = ({ x, y, w, h }: IBound): IVec[] => {
  const points: IVec[] = [];
  const stepsPerSegment = 8;

  CLOUD_PATH_SEGMENTS.forEach(([p0, p1, p2, p3], index) => {
    const start = index === 0 ? 0 : 1;
    for (let i = start; i <= stepsPerSegment; i += 1) {
      const t = i / stepsPerSegment;
      const [nx, ny] = cubicBezierPoint(p0, p1, p2, p3, t);
      points.push([x + w * nx, y + h * ny]);
    }
  });

  return points;
};

const drawCloud = (ctx: CanvasRenderingContext2D, bound: IBound) => {
  const { x, y, w, h } = bound;

  ctx.beginPath();
  ctx.moveTo(x + w * 0.25, y + h * 0.25);
  ctx.bezierCurveTo(
    x + w * 0.05,
    y + h * 0.25,
    x,
    y + h * 0.5,
    x + w * 0.16,
    y + h * 0.5
  );
  ctx.bezierCurveTo(
    x,
    y + h * 0.66,
    x + w * 0.18,
    y + h * 0.9,
    x + w * 0.31,
    y + h * 0.8
  );
  ctx.bezierCurveTo(
    x + w * 0.4,
    y + h,
    x + w * 0.7,
    y + h,
    x + w * 0.8,
    y + h * 0.8
  );
  ctx.bezierCurveTo(
    x + w,
    y + h * 0.8,
    x + w,
    y + h * 0.6,
    x + w * 0.875,
    y + h * 0.5
  );
  ctx.bezierCurveTo(
    x + w,
    y + h * 0.3,
    x + w * 0.8,
    y + h * 0.1,
    x + w * 0.625,
    y + h * 0.2
  );
  ctx.bezierCurveTo(
    x + w * 0.5,
    y + h * 0.05,
    x + w * 0.3,
    y + h * 0.05,
    x + w * 0.25,
    y + h * 0.25
  );
  ctx.closePath();
};

export const cloud = createCustomShape(cloudPoints, drawCloud);
