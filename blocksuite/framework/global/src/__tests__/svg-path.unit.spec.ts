import { describe, expect, test } from 'vitest';

import { SVGPathBuilder, SVGShapeBuilder } from '../gfx/svg-path.js';

describe('SVGPathBuilder', () => {
  test('should build a simple path', () => {
    const pathBuilder = new SVGPathBuilder();
    const result = pathBuilder.moveTo(10, 20).lineTo(30, 40).build();

    expect(result).toBe('M 10 20 L 30 40');
  });

  test('should build a path with curves', () => {
    const pathBuilder = new SVGPathBuilder();
    const result = pathBuilder
      .moveTo(0, 0)
      .curveTo(10, 0, 10, 10, 20, 10)
      .build();

    expect(result).toBe('M 0 0 C 10 0 10 10 20 10');
  });

  test('should build a closed path', () => {
    const pathBuilder = new SVGPathBuilder();
    const result = pathBuilder
      .moveTo(0, 0)
      .lineTo(10, 0)
      .lineTo(5, 10)
      .closePath()
      .build();

    expect(result).toBe('M 0 0 L 10 0 L 5 10 Z');
  });

  test('should clear commands', () => {
    const pathBuilder = new SVGPathBuilder();
    pathBuilder.moveTo(10, 20).lineTo(30, 40);
    pathBuilder.clear();
    const result = pathBuilder.moveTo(0, 0).build();

    expect(result).toBe('M 0 0');
  });
});

describe('SVGShapeBuilder', () => {
  test('should generate diamond polygon points', () => {
    const result = SVGShapeBuilder.diamond(100, 80, 2);
    expect(result).toBe('50,1 99,40 50,79 1,40');
  });

  test('should generate triangle polygon points', () => {
    const result = SVGShapeBuilder.triangle(100, 80, 2);
    expect(result).toBe('50,1 99,79 1,79');
  });

  test('should generate diamond path', () => {
    const result = SVGShapeBuilder.diamondPath(100, 80, 2);
    expect(result).toBe('M 50 1 L 99 40 L 50 79 L 1 40 Z');
  });

  test('should generate triangle path', () => {
    const result = SVGShapeBuilder.trianglePath(100, 80, 2);
    expect(result).toBe('M 50 1 L 99 79 L 1 79 Z');
  });

  test('should handle zero stroke width', () => {
    const diamondResult = SVGShapeBuilder.diamond(100, 80, 0);
    expect(diamondResult).toBe('50,0 100,40 50,80 0,40');

    const triangleResult = SVGShapeBuilder.triangle(100, 80, 0);
    expect(triangleResult).toBe('50,0 100,80 0,80');
  });
});
