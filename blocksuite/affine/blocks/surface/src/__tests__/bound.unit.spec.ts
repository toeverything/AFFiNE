import {
  Bound,
  getCommonBound,
  inflateBound,
  transformPointsToNewBound,
} from '@blocksuite/global/gfx';
import { describe, expect, it } from 'vitest';

describe('bound utils', () => {
  it('Bound basic', () => {
    const bound = new Bound(1, 1, 2, 2);
    const serialized = bound.serialize();
    expect(serialized).toBe('[1,1,2,2]');
    expect(Bound.deserialize(serialized)).toMatchObject(bound);
    expect(bound.center).toMatchObject([2, 2]);
    expect(bound.minX).toBe(1);
    expect(bound.minY).toBe(1);
    expect(bound.maxX).toBe(3);
    expect(bound.maxY).toBe(3);
    expect(bound.tl).toMatchObject([1, 1]);
    expect(bound.tr).toMatchObject([3, 1]);
    expect(bound.bl).toMatchObject([1, 3]);
    expect(bound.br).toMatchObject([3, 3]);
  });

  it('from', () => {
    const b1 = new Bound(1, 1, 2, 2);
    const b2 = Bound.from(b1);
    expect(b1).toMatchObject(b2);
  });

  it('getCommonBound basic', () => {
    const bounds = Array.from({ length: 10 })
      .fill(0)
      .map((_, index) => {
        return {
          x: index,
          y: index,
          w: 1,
          h: 1,
        };
      });
    expect(getCommonBound(bounds)).toMatchObject({
      x: 0,
      y: 0,
      w: 10,
      h: 10,
    });
  });

  it('getCommonBound parameters length equal to 0', () => {
    expect(getCommonBound([])).toBeNull();
  });

  it('getCommonBound parameters length less than 2', () => {
    const b1 = {
      x: 0,
      y: 0,
      w: 1,
      h: 1,
    };
    expect(getCommonBound([b1])).toMatchObject(b1);
  });

  it('inflateBound', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = inflateBound(a, 4);
    expect(b.serialize()).toBe('[-2,-2,14,14]');

    expect(() => inflateBound(a, -12)).toThrowError(
      'Invalid delta range or bound size.'
    );
  });

  it('transformPointsToNewBound basic', () => {
    const a = new Bound(0, 0, 20, 20);
    const b = new Bound(4, 4, 18, 18);
    const marginA = 4;
    const marginB = 6;
    const points = [{ x: 6, y: 6, other: 10 }];
    const transformed = transformPointsToNewBound(
      points,
      a,
      marginA,
      b,
      marginB
    );

    expect(transformed.bound.serialize()).toBe(b.serialize());
    expect(transformed.points[0]).toMatchObject({
      x: 7,
      y: 7,
      other: 10,
    });
  });

  it('transformPointsToNewBound, new bound too small', () => {
    const a = new Bound(0, 0, 20, 20);
    const b = new Bound(4, 4, 4, 4);
    const marginA = 4;
    const marginB = 6;
    const points = [{ x: 6, y: 6, other: 10 }];
    const transformed = transformPointsToNewBound(
      points,
      a,
      marginA,
      b,
      marginB
    );

    expect(transformed.bound.serialize()).toBe('[4,4,13,13]');
    expect(transformed.points[0].x).toBeCloseTo(6.1667);
    expect(transformed.points[0].y).toBeCloseTo(6.1667);
    expect(transformed.points[0].other).toBe(10);
  });

  it('intersectLine', () => {
    const bound = new Bound(0, 0, 10, 10);
    expect(bound.intersectLine([0, 0], [10, 10])).toBeTruthy();
  });

  it('intersectline no intersection', () => {
    const bound = new Bound(0, 0, 10, 10);
    expect(bound.intersectLine([0, -1], [10, -10])).toBeFalsy();
  });

  it('isIntersectWithBound', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = new Bound(5, 5, 10, 10);
    expect(a.isIntersectWithBound(b)).toBeTruthy();
  });

  it('isIntersectWithBound no intersection', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = new Bound(11, 11, 10, 10);
    expect(a.isIntersectWithBound(b)).toBeFalsy();
  });

  it('unite', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = new Bound(5, 5, 10, 10);
    expect(a.unite(b).serialize()).toBe('[0,0,15,15]');
  });

  it('isHorizontalCross', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = new Bound(5, 5, 10, 10);
    expect(a.isHorizontalCross(b)).toBeTruthy();
  });

  it('isHorizontalCross no intersection', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = new Bound(11, 11, 10, 10);
    expect(a.isHorizontalCross(b)).toBeFalsy();
  });

  it('isVerticalCross', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = new Bound(5, 5, 10, 10);
    expect(a.isVerticalCross(b)).toBeTruthy();
  });

  it('isVerticalCross no intersection', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = new Bound(11, 11, 10, 10);
    expect(a.isVerticalCross(b)).toBeFalsy();
  });

  it('horizontalDistance', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = new Bound(15, 15, 10, 10);
    expect(a.horizontalDistance(b)).toBe(5);
  });

  it('verticalDistance', () => {
    const a = new Bound(0, 0, 10, 10);
    const b = new Bound(15, 15, 10, 10);
    expect(a.verticalDistance(b)).toBe(5);
  });
});
