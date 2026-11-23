import {
  almostEqual,
  isPointOnLineSegment,
  type IVec,
  lineEllipseIntersects,
  lineIntersects,
  linePolygonIntersects,
  linePolylineIntersects,
  pointAlmostEqual,
  polygonGetPointTangent,
  rotatePoints,
  toDegree,
  toRadian,
} from '@blocksuite/global/gfx';
import { describe, expect, it } from 'vitest';

describe('Line', () => {
  it('should intersect', () => {
    let rst = lineIntersects([0, 0], [1, 1], [0, 1], [1, 0]);
    expect(rst).toBeDefined();
    expect(rst).toMatchObject([0.5, 0.5]);

    rst = lineIntersects([5, 5], [15, 5], [10, 0], [10, 10]);
    expect(rst).toBeDefined();
    expect(rst).toMatchObject([10, 5]);
  });

  it('should not intersect', () => {
    const rst = lineIntersects([0, 0], [1, 0], [0, 1], [1, 1]);
    expect(rst).toBeNull();
  });

  it('should intersect when infinity', () => {
    const rst = lineIntersects([0, 0], [0, 10], [1, 1], [10, 1], true);
    expect(rst).toBeDefined();
    expect(rst).toMatchObject([0, 1]);
  });

  it('lineEllipseIntersects', () => {
    const rst = lineEllipseIntersects([0, -5], [0, 5], [0, 0], 1, 1);
    const expected: IVec[] = [
      [0, 1],
      [0, -1],
    ];
    if (!rst) throw new Error('Failed to get line ellipse intersects');
    expect(
      rst.every((point, index) => pointAlmostEqual(point, expected[index]))
    ).toBeTruthy();
  });

  it('lineEllipseIntersects with rotate', () => {
    const rst = lineEllipseIntersects(
      [0, -5],
      [0, 5],
      [0, 0],
      3,
      2,
      Math.PI / 2
    );
    expect(rst).toBeDefined();
    if (rst) {
      pointAlmostEqual(rst[0], [0, 3]);
      pointAlmostEqual(rst[1], [0, -3]);
    }
  });

  it('linePolygonIntersects', () => {
    const rst = linePolygonIntersects(
      [5, 5],
      [15, 5],
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]
    );
    if (!rst) throw new Error('Failed to get line polygon intersects');
    expect(pointAlmostEqual(rst[0], [10, 5])).toBeTruthy();
  });

  it('linePolylineIntersects', () => {
    const rst = linePolylineIntersects(
      [5, 5],
      [-5, 5],
      [
        [0, 0],
        [10, 0],
        [10, 10],
        [0, 10],
      ]
    );

    expect(rst).toBeNull();
  });

  it('isPointOnLineSegment', () => {
    const line: IVec[] = [
      [0, 0],
      [1, 0],
    ];
    const point: IVec = [0.5, 0];
    expect(isPointOnLineSegment(point, line)).toBe(true);
    expect(isPointOnLineSegment([0.01, 0], line)).toBe(true);
    expect(isPointOnLineSegment([-0.01, 0], line)).toBe(false);
    expect(isPointOnLineSegment([0.5, 0.1], line)).toBe(false);
    expect(isPointOnLineSegment([0.5, -0.1], line)).toBe(false);
  });

  it('rotatePoints', () => {
    const points: IVec[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    const rst = rotatePoints(points, [0.5, 0.5], 90);
    const expected = [
      [1, 0],
      [1, 1],
      [0, 1],
      [0, 0],
    ];
    expect(
      rst.every((p, i) => {
        return (
          almostEqual(p[0], expected[i][0]) && almostEqual(p[1], expected[i][1])
        );
      })
    ).toBeTruthy();
  });

  it('polygonGetPointTangent', () => {
    const points: IVec[] = [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 1],
    ];
    expect(polygonGetPointTangent(points, [0, 0.5])).toMatchObject([0, -1]);
    expect(polygonGetPointTangent(points, [0.5, 0])).toMatchObject([1, 0]);
  });

  it('toRadian', () => {
    expect(toRadian(180)).toBe(Math.PI);
    expect(toRadian(90)).toBe(Math.PI / 2);
    expect(toRadian(0)).toBe(0);
    expect(toRadian(360)).toBe(Math.PI * 2);
  });

  it('toDegree', () => {
    expect(toDegree(Math.PI)).toBe(180);
    expect(toDegree(Math.PI / 2)).toBe(90);
    expect(toDegree(0)).toBe(0);
    expect(toDegree(Math.PI * 2)).toBe(360);
  });
});
