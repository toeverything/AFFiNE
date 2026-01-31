/**
 * Connector Segment Utilities
 *
 * Provides segment-based model for connector path manipulation.
 * Used for draw.io-style segment dragging.
 *
 * Based on CONNECTOR_DYNAMICS.md specification and draw.io mxEdgeSegmentHandler.js
 */

import { type IVec, PointLocation } from '@blocksuite/global/gfx';

/**
 * Represents a single segment of a connector path.
 * Segments are the lines between consecutive path points.
 */
export interface ConnectorSegment {
  /** Absolute canvas coordinates of segment start */
  start: IVec;
  /** Absolute canvas coordinates of segment end */
  end: IVec;

  /** Orientation determined by dominant direction */
  orientation: 'horizontal' | 'vertical';

  /** Length of the segment */
  length: number;

  /** Midpoint of the segment (for handle placement) */
  midpoint: IVec;

  /**
   * Segment type:
   * - 'tail': First/last segment near shapes, NOT draggable
   * - 'movable': Middle segments that can be dragged
   */
  type: 'tail' | 'movable';

  /** Index in the path (0 = first segment from source) */
  index: number;
}

/**
 * Tolerance for floating point comparisons.
 * Points within this distance are considered the same.
 */
const EPSILON = 0.001;

/**
 * Calculate the distance between two points.
 */
function distance(a: IVec, b: IVec): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate the midpoint between two points.
 */
function midpoint(a: IVec, b: IVec): IVec {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Determine the orientation of a segment.
 *
 * From draw.io mxEdgeSegmentHandler.js:
 * - Same X = vertical segment (can be dragged left/right)
 * - Same Y = horizontal segment (can be dragged up/down)
 *
 * For diagonal segments, we use the dominant direction.
 */
export function determineOrientation(
  start: IVec,
  end: IVec
): 'horizontal' | 'vertical' {
  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);

  // If both are near zero, default to horizontal
  if (dx < EPSILON && dy < EPSILON) {
    return 'horizontal';
  }

  // Same X (within tolerance) = vertical segment
  // Same Y (within tolerance) = horizontal segment
  // For diagonal, use dominant direction
  return dx < dy ? 'vertical' : 'horizontal';
}

/**
 * Determine if a segment is a tail (not draggable) or movable.
 *
 * Tails are the first and last segments, which connect directly to shapes.
 * All segments in between are movable.
 *
 * SPECIAL CASE: A single-segment path (2 points) IS movable.
 * When dragged, it splits into 3 segments (creating an S-shape).
 */
function determineTailOrMovable(
  index: number,
  totalSegments: number
): 'tail' | 'movable' {
  // Special case: single segment paths are movable (they split when dragged)
  if (totalSegments === 1) {
    return 'movable';
  }
  // First and last segments are tails
  if (index === 0 || index === totalSegments - 1) {
    return 'tail';
  }
  return 'movable';
}

/**
 * Parse a connector path into segments.
 *
 * The path is an array of points. This function converts it to
 * an array of segments, each with metadata about its orientation,
 * type (tail/movable), and midpoint for handle placement.
 *
 * @param path - Array of path points in absolute coordinates
 * @returns Array of segments parsed from the path
 */
export function parsePathToSegments(path: IVec[]): ConnectorSegment[] {
  if (!path || path.length < 2) {
    return [];
  }

  const segments: ConnectorSegment[] = [];
  const totalSegments = path.length - 1;

  for (let i = 0; i < totalSegments; i++) {
    const start = path[i];
    const end = path[i + 1];

    const segment: ConnectorSegment = {
      start: [start[0], start[1]],
      end: [end[0], end[1]],
      orientation: determineOrientation(start, end),
      length: distance(start, end),
      midpoint: midpoint(start, end),
      type: determineTailOrMovable(i, totalSegments),
      index: i,
    };

    segments.push(segment);
  }

  return segments;
}

/**
 * Get only the movable (draggable) segments.
 * These are the segments that should have visible handles.
 */
export function getMovableSegments(
  segments: ConnectorSegment[]
): ConnectorSegment[] {
  return segments.filter(s => s.type === 'movable');
}

/**
 * Get the CSS cursor for a segment based on its orientation.
 *
 * From draw.io mxEdgeSegmentHandler.js:
 * - Vertical segment (same X) → 'col-resize' → drag left/right
 * - Horizontal segment (same Y) → 'row-resize' → drag up/down
 */
export function getCursorForSegment(segment: ConnectorSegment): string {
  if (segment.type === 'tail') {
    return 'default';
  }

  // Match draw.io behavior exactly
  return segment.orientation === 'vertical' ? 'col-resize' : 'row-resize';
}

/**
 * Constrain a drag delta based on segment orientation.
 *
 * - Horizontal segments can only move in Y direction
 * - Vertical segments can only move in X direction
 *
 * @param segment - The segment being dragged
 * @param deltaX - Raw X movement from mouse
 * @param deltaY - Raw Y movement from mouse
 * @returns Constrained delta [dx, dy]
 */
export function constrainDrag(
  segment: ConnectorSegment,
  deltaX: number,
  deltaY: number
): IVec {
  if (segment.orientation === 'horizontal') {
    // Horizontal segment: only Y movement allowed
    return [0, deltaY];
  } else {
    // Vertical segment: only X movement allowed
    return [deltaX, 0];
  }
}

/**
 * Update segment positions after dragging.
 *
 * When a movable segment is dragged:
 * 1. Apply delta to the segment's start and end points
 * 2. Update adjacent segments to maintain connectivity
 *
 * @param segments - All segments
 * @param draggedIndex - Index of the segment being dragged
 * @param delta - Constrained movement [dx, dy]
 * @returns Updated segments array
 */
export function updateSegmentPosition(
  segments: ConnectorSegment[],
  draggedIndex: number,
  delta: IVec
): ConnectorSegment[] {
  if (draggedIndex < 0 || draggedIndex >= segments.length) {
    return segments;
  }

  const updated = segments.map(s => ({
    ...s,
    start: [...s.start] as IVec,
    end: [...s.end] as IVec,
    midpoint: [...s.midpoint] as IVec,
  }));

  const dragged = updated[draggedIndex];

  // Update dragged segment
  dragged.start[0] += delta[0];
  dragged.start[1] += delta[1];
  dragged.end[0] += delta[0];
  dragged.end[1] += delta[1];
  dragged.midpoint = midpoint(dragged.start, dragged.end);

  // Update previous segment's end point to maintain connectivity
  if (draggedIndex > 0) {
    const prev = updated[draggedIndex - 1];
    if (dragged.orientation === 'horizontal') {
      // Horizontal segment moved vertically, update prev's end Y
      prev.end[1] = dragged.start[1];
    } else {
      // Vertical segment moved horizontally, update prev's end X
      prev.end[0] = dragged.start[0];
    }
    prev.midpoint = midpoint(prev.start, prev.end);
    prev.length = distance(prev.start, prev.end);
  }

  // Update next segment's start point to maintain connectivity
  if (draggedIndex < updated.length - 1) {
    const next = updated[draggedIndex + 1];
    if (dragged.orientation === 'horizontal') {
      // Horizontal segment moved vertically, update next's start Y
      next.start[1] = dragged.end[1];
    } else {
      // Vertical segment moved horizontally, update next's start X
      next.start[0] = dragged.end[0];
    }
    next.midpoint = midpoint(next.start, next.end);
    next.length = distance(next.start, next.end);
  }

  return updated;
}

/**
 * Convert segments back to a path array.
 *
 * @param segments - Array of segments
 * @returns Path as array of PointLocation
 */
export function segmentsToPath(segments: ConnectorSegment[]): PointLocation[] {
  if (segments.length === 0) {
    return [];
  }

  const path: PointLocation[] = [PointLocation.fromVec(segments[0].start)];
  for (const segment of segments) {
    path.push(PointLocation.fromVec(segment.end));
  }
  return path;
}

/**
 * Split a 2-point line into an S-shape when its midpoint is dragged.
 *
 * For a horizontal line dragged vertically:
 *   Before: [start] ────────── [end]
 *   After:  [start]─┐
 *                   │
 *                   └─[end]
 *
 * For a vertical line dragged horizontally:
 *   Before: [start]
 *              │
 *           [end]
 *   After:  [start]
 *              │
 *              └───┐
 *                  │
 *               [end]
 *
 * @param segments - Current segments (should be single segment for 2-point path)
 * @param delta - Constrained movement [dx, dy]
 * @returns New segments array representing the S-shape
 */
export function splitSegmentToSShape(
  segments: ConnectorSegment[],
  delta: IVec
): ConnectorSegment[] {
  if (segments.length !== 1) {
    // Not a 2-point line, use regular update
    return segments;
  }

  const original = segments[0];
  const start = original.start;
  const end = original.end;

  // Calculate the midpoint of the original segment
  const mid = original.midpoint;

  // Create 3 new segments forming an S-shape
  // The middle segment moves by delta, creating perpendicular tails

  let newPath: IVec[];

  if (original.orientation === 'horizontal') {
    // Horizontal line dragged vertically
    // Creates: start -> (mid.x, start.y) -> (mid.x, start.y + delta.y) -> end
    // Actually: vertical tail from start, horizontal middle, vertical tail to end
    const midY = mid[1] + delta[1];
    newPath = [
      start,
      [start[0], midY], // First turn point
      [end[0], midY], // Second turn point
      end,
    ];
  } else {
    // Vertical line dragged horizontally
    // Creates vertical tail from start, horizontal middle, vertical tail to end
    const midX = mid[0] + delta[0];
    newPath = [
      start,
      [midX, start[1]], // First turn point
      [midX, end[1]], // Second turn point
      end,
    ];
  }

  // Parse the new path into segments
  return parsePathToSegments(newPath);
}
