import type { IVec, IVec3 } from '@blocksuite/global/gfx';
import { almostEqual } from '@blocksuite/global/gfx';
import { describe, expect, it } from 'vitest';

import { AStarRunner } from '../utils/a-star.js';

function mergePath(points: IVec3[]) {
  if (points.length === 0) return points;
  const rst: IVec3[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const cur = points[i];
    const last = points[i - 1];
    const next = points[i + 1];
    if (
      almostEqual(last[0], cur[0], 0.02) &&
      almostEqual(cur[0], next[0], 0.02)
    )
      continue;
    if (
      almostEqual(last[1], cur[1], 0.02) &&
      almostEqual(cur[1], next[1], 0.02)
    )
      continue;
    rst.push(cur);
  }
  rst.push(points[points.length - 1]);
  return rst;
}

describe('a* algorithm', () => {
  /**
   * 0 ----------------
   *                  |
   *                  |
   *                  ------------------- 0
   */
  it('width is greater than height', () => {
    const sp: IVec3 = [0, 0, 0];
    const ep: IVec3 = [200, 100, 0];
    const osp: IVec3 = [-1, 0, 0];
    const oep: IVec3 = [201, 100, 0];
    const points: IVec3[] = [
      sp,
      ep,
      [100, 0, 0],
      [200, 0, 0],
      [0, 50, 0],
      [100, 50, 3],
      [200, 50, 0],
      [0, 100, 0],
      [100, 100, 0],
    ] as IVec3[];
    const aStar = new AStarRunner(points, sp, ep, osp, oep);
    aStar.run();
    let path: IVec[] | IVec3[] = aStar.path;
    path.pop();
    path.shift();
    path = mergePath(path as IVec3[]);
    const expected = [
      [0, 0],
      [100, 0],
      [100, 100],
      [200, 100],
    ];
    path.forEach((p, i) => {
      expect(p[0]).toBe(expected[i][0]);
      expect(p[1]).toBe(expected[i][1]);
    });
  });
  /**
   * 0
   * |
   * |
   * |
   * |----|
   *      |
   *      |
   *      |
   *      0
   */
  it('height is greater than width', () => {
    const sp: IVec3 = [0, 0, 0];
    const ep: IVec3 = [100, 200, 0];
    const osp: IVec3 = [0, -1, 0];
    const oep: IVec3 = [100, 201, 0];
    const points: IVec3[] = [
      sp,
      [50, 0, 0],
      [100, 0, 0],
      [0, 100, 0],
      [50, 100, 3],
      [100, 100, 0],
      [0, 200, 0],
      [50, 200, 0],
      ep,
    ];
    const aStar = new AStarRunner(points, sp, ep, osp, oep);
    aStar.run();
    let path = aStar.path;
    path.pop();
    path.shift();
    path = mergePath(path);
    const expected = [
      [0, 0],
      [0, 100],
      [100, 100],
      [100, 200],
    ];
    path.forEach((p, i) => {
      expect(p[0]).toBe(expected[i][0]);
      expect(p[1]).toBe(expected[i][1]);
    });
  });
});
