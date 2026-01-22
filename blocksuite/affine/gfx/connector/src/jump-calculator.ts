import type { ConnectorElementModel } from '@blocksuite/affine-model';
import { ConnectorMode } from '@blocksuite/affine-model';
import type { IVec } from '@blocksuite/global/gfx';
import type { PointLocation } from '@blocksuite/global/gfx';

/**
 * Represents a point on the connector path with a type indicator.
 * Type 0: Normal waypoint (start, end, or user-defined)
 * Type 1: Jump intersection point
 */
export interface RoutedPoint {
  type: 0 | 1;
  x: number;
  y: number;
}

export type JumpOrder = {
  ordered: ConnectorElementModel[];
  orderMap: Map<string, number>;
};

export function buildJumpOrder(connectors: ConnectorElementModel[]): JumpOrder {
  const ordered = [...connectors].sort((a, b) =>
    a.index.localeCompare(b.index)
  );
  const orderMap = new Map(
    ordered.map((connector, index) => [connector.id, index])
  );
  return { ordered, orderMap };
}

/**
 * Calculate line segment intersection point.
 * Returns null if segments don't intersect or are parallel.
 */
function lineIntersection(
  p0: IVec,
  p1: IVec,
  p2: IVec,
  p3: IVec
): { x: number; y: number } | null {
  const x1 = p0[0],
    y1 = p0[1];
  const x2 = p1[0],
    y2 = p1[1];
  const x3 = p2[0],
    y3 = p2[1];
  const x4 = p3[0],
    y4 = p3[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);

  // Parallel or coincident lines
  if (Math.abs(denom) < 0.0001) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

  // Check if intersection point is within both segments
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1),
    };
  }

  return null;
}

/**
 * Update jump points for a connector based on intersections with other connectors.
 *
 * This function calculates where the given connector intersects with other connectors
 * and creates a routed points array with jump markers at intersection locations.
 *
 * Based on draw.io's updateLineJumps algorithm (Graph.js:9015-9154).
 *
 * @param connector - The connector to calculate jumps for
 * @param allConnectors - All connectors in the scene (for intersection detection)
 * @returns Array of routed points with type markers (0=waypoint, 1=jump)
 */
export function updateConnectorJumps(
  connector: ConnectorElementModel,
  allConnectors: ConnectorElementModel[],
  orderMap?: Map<string, number>
): RoutedPoint[] {
  const { absolutePath: path, jumpStyle } = connector;

  if (connector.mode === ConnectorMode.Curve) {
    return [];
  }

  // Early return if no jump style or insufficient path points
  if (!path || path.length < 2 || jumpStyle === 'none') {
    return [];
  }

  const routedPoints: RoutedPoint[] = [];
  const thresh = 0.5; // Threshold for detecting near-identical points

  // Add start point as type 0 (normal waypoint)
  routedPoints.push({ type: 0, x: path[0][0], y: path[0][1] });

  // For each segment in this connector
  for (let i = 0; i < path.length - 1; i++) {
    const p0 = path[i];
    const p1 = path[i + 1];
    const intersections: Array<{ x: number; y: number; distSq: number }> = [];

    // Check against all other connectors
    for (const other of allConnectors) {
      // Skip self
      if (other.id === connector.id) {
        continue;
      }

      if (other.mode === ConnectorMode.Curve) {
        continue;
      }

      if (orderMap) {
        const connectorOrder = orderMap.get(connector.id) ?? 0;
        const otherOrder = orderMap.get(other.id) ?? 0;
        if (otherOrder >= connectorOrder) {
          continue;
        }
      }

      const otherPath = other.absolutePath;
      if (!otherPath || otherPath.length < 2) continue;

      // Check each segment of the other connector
      for (let j = 0; j < otherPath.length - 1; j++) {
        const p2 = otherPath[j];
        const p3 = otherPath[j + 1];

        const pt = lineIntersection(p0, p1, p2, p3);

        if (pt) {
          // Filter out intersections too close to segment endpoints
          const distToP0Sq =
            Math.pow(pt.x - p0[0], 2) + Math.pow(pt.y - p0[1], 2);
          const distToP1Sq =
            Math.pow(pt.x - p1[0], 2) + Math.pow(pt.y - p1[1], 2);

          if (distToP0Sq > thresh * thresh && distToP1Sq > thresh * thresh) {
            intersections.push({
              x: pt.x,
              y: pt.y,
              distSq: distToP0Sq,
            });
          }
        }
      }
    }

    // Sort intersections by distance from p0 to maintain order along segment
    intersections.sort((a, b) => a.distSq - b.distSq);

    // Add unique intersections as type 1 (jump points)
    for (const pt of intersections) {
      // Check if this intersection is different from the last added point
      const lastPt = routedPoints[routedPoints.length - 1];
      if (
        !lastPt ||
        Math.abs(lastPt.x - pt.x) > thresh ||
        Math.abs(lastPt.y - pt.y) > thresh
      ) {
        routedPoints.push({ type: 1, x: pt.x, y: pt.y });
      }
    }

    // Add next segment point as type 0
    if (i < path.length - 2) {
      routedPoints.push({ type: 0, x: p1[0], y: p1[1] });
    }
  }

  // Add end point as type 0 (normal waypoint)
  const last = path[path.length - 1];
  routedPoints.push({ type: 0, x: last[0], y: last[1] });

  return routedPoints;
}

/**
 * Helper function to calculate distance from point to line segment.
 * Used for finding nearest segment when adding waypoints.
 */
export function pointToSegmentDistance(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;

  if (lenSq === 0) {
    // Segment is a point
    return Math.hypot(x - x1, y - y1);
  }

  // Parameter t represents projection of point onto line (0 = start, 1 = end)
  let t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t)); // Clamp to [0, 1]

  const projX = x1 + t * dx;
  const projY = y1 + t * dy;

  return Math.hypot(x - projX, y - projY);
}

/**
 * Find the index of the segment nearest to the given point.
 * Used for inserting waypoints at the correct position.
 */
export function findNearestSegment(
  path: PointLocation[],
  x: number,
  y: number
): number {
  let minDist = Infinity;
  let index = 0;

  for (let i = 0; i < path.length - 1; i++) {
    const p0 = path[i];
    const p1 = path[i + 1];

    const dist = pointToSegmentDistance(x, y, p0[0], p0[1], p1[0], p1[1]);
    if (dist < minDist) {
      minDist = dist;
      index = i + 1; // Insert after segment start
    }
  }

  return index;
}
