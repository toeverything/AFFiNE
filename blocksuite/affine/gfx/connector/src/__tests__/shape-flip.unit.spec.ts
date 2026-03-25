import { beforeAll, describe, expect, test } from 'vitest';

import { getAnchors } from '../connector-manager.js';

const createMockShape = (props: Partial<Record<string, unknown>> = {}) => ({
  xywh: '[0,0,100,100]',
  rotate: 0,
  shapeType: 'rect',
  getLineIntersections: () => null,
  ...props,
});

beforeAll(() => {
  const Point = globalThis.DOMPoint as
    | (typeof DOMPoint & { prototype: DOMPoint })
    | undefined;
  if (!Point || Point.prototype.matrixTransform) return;
  Point.prototype.matrixTransform = function (matrix: DOMMatrix) {
    const x = this.x ?? 0;
    const y = this.y ?? 0;
    const a = matrix.a ?? 1;
    const b = matrix.b ?? 0;
    const c = matrix.c ?? 0;
    const d = matrix.d ?? 1;
    const e = matrix.e ?? matrix.m41 ?? 0;
    const f = matrix.f ?? matrix.m42 ?? 0;
    return new DOMPoint(a * x + c * y + e, b * x + d * y + f);
  };
});

describe('shape flip anchors', () => {
  test('flipX mirrors anchor positions across center', () => {
    const base = createMockShape();
    const unflipped = getAnchors(base as any).map(anchor => anchor.point);
    const flipped = getAnchors(createMockShape({ flipX: true }) as any).map(
      anchor => anchor.point
    );

    const centerX = 50;
    unflipped.forEach((point, index) => {
      expect(flipped[index][0]).toBeCloseTo(2 * centerX - point[0], 4);
      expect(flipped[index][1]).toBeCloseTo(point[1], 4);
    });
  });

  test('flipY mirrors anchor positions across center', () => {
    const base = createMockShape();
    const unflipped = getAnchors(base as any).map(anchor => anchor.point);
    const flipped = getAnchors(createMockShape({ flipY: true }) as any).map(
      anchor => anchor.point
    );

    const centerY = 50;
    unflipped.forEach((point, index) => {
      expect(flipped[index][0]).toBeCloseTo(point[0], 4);
      expect(flipped[index][1]).toBeCloseTo(2 * centerY - point[1], 4);
    });
  });
});
