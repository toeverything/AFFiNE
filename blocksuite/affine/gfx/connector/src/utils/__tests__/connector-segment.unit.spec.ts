import { describe, expect, test } from 'vitest';

import type { ConnectorSegment } from '../connector-segment.js';
import {
  constrainDrag,
  parsePathToSegments,
  segmentsToPath,
  splitSegmentToSShape,
} from '../connector-segment.js';

const buildSegment = (
  orientation: 'horizontal' | 'vertical'
): ConnectorSegment => ({
  start: [0, 0],
  end: [100, 0],
  orientation,
  length: 100,
  midpoint: [50, 0],
  type: 'movable',
  index: 0,
});

describe('connector segment utilities', () => {
  test('constrainDrag clamps to segment axis', () => {
    const horizontal = buildSegment('horizontal');
    const vertical = buildSegment('vertical');

    expect(constrainDrag(horizontal, 30, -20)).toEqual([0, -20]);
    expect(constrainDrag(vertical, 30, -20)).toEqual([30, 0]);
  });

  test('splitSegmentToSShape creates S path for horizontal drag', () => {
    const segments = parsePathToSegments([
      [0, 0],
      [100, 0],
    ]);
    const updated = splitSegmentToSShape(segments, [0, 30]);
    const points = segmentsToPath(updated).map(point => [point[0], point[1]]);

    expect(points).toEqual([
      [0, 0],
      [20, 0],
      [20, 30],
      [80, 30],
      [80, 0],
      [100, 0],
    ]);
  });
});
