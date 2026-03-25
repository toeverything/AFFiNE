import { PointLocation } from '@blocksuite/global/gfx';
import { describe, expect, test } from 'vitest';

import { ConnectorPathGenerator } from '../connector-manager.js';

describe('connector waypoints routing', () => {
  test('preserves waypoint order when generating path', () => {
    const generator = new ConnectorPathGenerator({
      getElementById: () => null,
    });
    const start = new PointLocation([0, 0]);
    const end = new PointLocation([200, 0]);
    const waypoints: [number, number][] = [
      [120, 0],
      [120, 60],
      [40, 60],
    ];

    const path = (generator as any)._generatePathThroughWaypoints(
      start,
      end,
      null,
      null,
      waypoints
    ) as PointLocation[];

    const coords = path.map(point => [point[0], point[1]]);
    const indices = waypoints.map(wp =>
      coords.findIndex(point => point[0] === wp[0] && point[1] === wp[1])
    );

    expect(indices.every(index => index >= 0)).toBe(true);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
  });
});
