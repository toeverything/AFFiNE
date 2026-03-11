import { describe, expect, test } from 'vitest';

import { getBezierParameters } from '../gfx/curve.js';
import { PointLocation } from '../gfx/model/index.js';

describe('getBezierParameters', () => {
  test('should handle empty path', () => {
    expect(() => getBezierParameters([])).not.toThrow();
    expect(getBezierParameters([])).toEqual([
      new PointLocation(),
      new PointLocation(),
      new PointLocation(),
      new PointLocation(),
    ]);
  });

  test('should handle single-point path', () => {
    const point = new PointLocation([10, 20]);

    expect(getBezierParameters([point])).toEqual([point, point, point, point]);
  });
});
