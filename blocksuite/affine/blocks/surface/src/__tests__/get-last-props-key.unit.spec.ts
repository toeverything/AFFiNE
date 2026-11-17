import { ShapeType } from '@blocksuite/affine-model';
import { describe, expect, it } from 'vitest';

import { getLastPropsKey } from '../utils/get-last-props-key.js';

function shapeModelProps(shapeType: ShapeType, radius = 0) {
  return { shapeType, radius } as any;
}

describe('getLastPropsKey', () => {
  it('keeps independent keys for rect and ellipse', () => {
    expect(getLastPropsKey('shape', shapeModelProps(ShapeType.Rect))).toBe(
      'shape:rect'
    );

    expect(getLastPropsKey('shape', shapeModelProps(ShapeType.Ellipse))).toBe(
      'shape:ellipse'
    );

    expect(getLastPropsKey('shape', shapeModelProps(ShapeType.Rect, 0.1))).toBe(
      'shape:roundedRect'
    );
  });

  it('maps non-rect and non-ellipse shapes to triangle key', () => {
    expect(getLastPropsKey('shape', shapeModelProps(ShapeType.Triangle))).toBe(
      'shape:triangle'
    );

    expect(getLastPropsKey('shape', shapeModelProps(ShapeType.Diamond))).toBe(
      'shape:triangle'
    );
  });
});
