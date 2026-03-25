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
 * Fixed length for tail segments (the non-draggable portions near shape connections).
 * This ensures tails remain short while allowing the movable segments to be dragged.
 */
const TAIL_LENGTH = 20;

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
 * Rules (consistent across ALL connector shapes):
 * - Tails are SHORT segments (≤ TAIL_LENGTH * 2) at shape connections (first/last position)
 * - Long first/last segments ARE draggable (they're not just tails)
 * - Middle segments are ALWAYS movable
 * - Single-segment path: ALWAYS movable (splits into S-shape when dragged)
 *
 * This ensures consistent behavior whether connector started as straight line, L-shape, or S-shape.
 */
function determineTailOrMovable(
  index: number,
  totalSegments: number,
  segmentLength: number
): 'tail' | 'movable' {
  // Special case: single segment paths are movable (they split when dragged)
  if (totalSegments === 1) {
    return 'movable';
  }

  // Middle segments are ALWAYS movable
  if (index > 0 && index < totalSegments - 1) {
    return 'movable';
  }

  // First and last segments: tail if short, movable if long
  // This allows users to drag long edge segments while keeping short tails fixed
  const tailThreshold = TAIL_LENGTH * 2; // 40px
  if (segmentLength <= tailThreshold) {
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

  const oppositeOrientation = (orientation: 'horizontal' | 'vertical') =>
    orientation === 'horizontal' ? 'vertical' : 'horizontal';

  const resolveZeroLengthOrientation = (
    index: number
  ): 'horizontal' | 'vertical' => {
    // Zero-length segments are used to represent a perpendicular handle
    // when adding a waypoint. Infer orientation from neighbors.
    const prevStart = index > 0 ? path[index - 1] : null;
    const prevEnd = index > 0 ? path[index] : null;
    const nextStart = index + 1 < path.length - 1 ? path[index + 1] : null;
    const nextEnd = index + 2 < path.length ? path[index + 2] : null;

    const prevOrientation =
      prevStart && prevEnd && distance(prevStart, prevEnd) >= EPSILON
        ? determineOrientation(prevStart, prevEnd)
        : null;
    const nextOrientation =
      nextStart && nextEnd && distance(nextStart, nextEnd) >= EPSILON
        ? determineOrientation(nextStart, nextEnd)
        : null;

    if (prevOrientation && nextOrientation) {
      return prevOrientation === nextOrientation
        ? oppositeOrientation(prevOrientation)
        : prevOrientation;
    }

    if (prevOrientation) {
      return oppositeOrientation(prevOrientation);
    }

    if (nextOrientation) {
      return oppositeOrientation(nextOrientation);
    }

    // Fall back to horizontal to match default orientation behavior.
    return 'horizontal';
  };

  for (let i = 0; i < totalSegments; i++) {
    const start = path[i];
    const end = path[i + 1];
    const segmentLength = distance(start, end);

    const orientation =
      segmentLength < EPSILON
        ? resolveZeroLengthOrientation(i)
        : determineOrientation(start, end);

    const segment: ConnectorSegment = {
      start: [start[0], start[1]],
      end: [end[0], end[1]],
      orientation,
      length: segmentLength,
      midpoint: midpoint(start, end),
      type: determineTailOrMovable(i, totalSegments, segmentLength),
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
 * NOTE: This function does NOT create new segments. For first/last segment
 * dragging that requires new segments, use updateSegmentWithNewSegments instead.
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
 * Update middle segment position while preserving adjacent tails.
 *
 * When dragging a middle segment that's adjacent to a tail:
 * - The tail should NOT be stretched/shrunk
 * - Instead, create a new perpendicular segment to bridge the gap
 *
 * Example: S-shape with E (vertical) dragged left:
 *
 * Before:                    After dragging E left:
 *      ┌─B─┐                      ┌─B─┐
 *      │   │                      │   │
 *      D   E                      D   E
 *      │   │                      │   │
 *   A──┘   └──C──              A──┘   └─F──C──
 *                                       (F created)
 *
 * C is a tail and stays fixed. F is created to bridge E to C.
 *
 * @param segments - All segments
 * @param draggedIndex - Index of the middle segment being dragged
 * @param delta - Constrained movement [dx, dy]
 * @returns Object with updated segments and flag indicating if new segments were created
 */
export function updateMiddleSegmentPreservingTails(
  segments: ConnectorSegment[],
  draggedIndex: number,
  delta: IVec
): {
  segments: ConnectorSegment[];
  created: boolean;
  segmentsCreatedBefore: number;
} {
  if (draggedIndex <= 0 || draggedIndex >= segments.length - 1) {
    // Not a middle segment
    return { segments, created: false, segmentsCreatedBefore: 0 };
  }

  const dragged = segments[draggedIndex];
  const prev = segments[draggedIndex - 1];
  const next = segments[draggedIndex + 1];

  const prevIsTail = prev.type === 'tail';
  const nextIsTail = next.type === 'tail';

  // If neither adjacent segment is a tail, use regular update
  if (!prevIsTail && !nextIsTail) {
    return {
      segments: updateSegmentPosition(segments, draggedIndex, delta),
      created: false,
      segmentsCreatedBefore: 0,
    };
  }

  // Only create new segments if there's actual movement
  const hasDelta = Math.abs(delta[0]) > EPSILON || Math.abs(delta[1]) > EPSILON;
  if (!hasDelta) {
    return { segments, created: false, segmentsCreatedBefore: 0 };
  }

  // Calculate dragged segment's new positions
  const draggedNewStart: IVec = [
    dragged.start[0] + delta[0],
    dragged.start[1] + delta[1],
  ];
  const draggedNewEnd: IVec = [
    dragged.end[0] + delta[0],
    dragged.end[1] + delta[1],
  ];

  // Build new path point by point, preserving tails
  const newPath: IVec[] = [];

  // Add all points before the dragged segment
  for (let i = 0; i < draggedIndex; i++) {
    if (i === 0) {
      newPath.push([...segments[i].start] as IVec);
    }
    newPath.push([...segments[i].end] as IVec);
  }

  // Handle connection from prev to dragged
  if (prevIsTail) {
    // Prev is a tail - keep its end fixed, add bridge to dragged's new start
    // The tail's end is already in newPath, now add bridge point
    if (dragged.orientation === 'vertical') {
      // Bridge is horizontal at tail's Y, going to dragged's new X
      newPath.push([draggedNewStart[0], prev.end[1]]);
    } else {
      // Bridge is vertical at tail's X, going to dragged's new Y
      newPath.push([prev.end[0], draggedNewStart[1]]);
    }
  } else {
    // Prev is not a tail - adjust the last point to connect to dragged's new position
    const lastIdx = newPath.length - 1;
    if (dragged.orientation === 'vertical') {
      newPath[lastIdx][0] = draggedNewStart[0];
    } else {
      newPath[lastIdx][1] = draggedNewStart[1];
    }
  }

  // Add the dragged segment's new end point
  // Note: The start is implicitly connected by the previous point
  newPath.push(draggedNewEnd);

  // Handle connection from dragged to next
  if (nextIsTail) {
    // Next is a tail - add bridge from dragged's new end to tail's fixed start
    if (dragged.orientation === 'vertical') {
      // Bridge is horizontal from dragged's new X to tail's X
      newPath.push([next.start[0], draggedNewEnd[1]]);
    } else {
      // Bridge is vertical from dragged's new Y to tail's Y
      newPath.push([draggedNewEnd[0], next.start[1]]);
    }
    // Add tail's end (start is implicitly the bridge end)
    newPath.push([...next.end] as IVec);
  } else {
    // Next is not a tail - it will be adjusted, add its end
    // The connection point is implicitly at dragged's new end position
    newPath.push([...next.end] as IVec);
  }

  // Add remaining segments after next
  for (let i = draggedIndex + 2; i < segments.length; i++) {
    newPath.push([...segments[i].end] as IVec);
  }

  return {
    segments: parsePathToSegments(newPath),
    created: prevIsTail || nextIsTail,
    // When prevIsTail, one bridge segment is created before the dragged segment
    segmentsCreatedBefore: prevIsTail ? 1 : 0,
  };
}

/**
 * Update segment position with new segment creation for L-shapes and similar.
 *
 * When dragging the first or last segment of an L-shape (or any path where
 * these segments are movable), we need to:
 * 1. Keep the original start/end point fixed (at the shape connection)
 * 2. Create a new perpendicular segment to connect to the moved segment
 * 3. Move the segment to its new position
 *
 * Example: L-shape with first segment being dragged right:
 *
 * Before:           After dragging B right:
 *    A                  A
 *    │                  │
 *    B                  └───E────┐   E created (new segment)
 *    │                           │
 *    └─────D─────         ──►  B (moved right)
 *                                │
 *                                └─────D─────
 *
 * @param segments - All segments
 * @param draggedIndex - Index of the segment being dragged
 * @param delta - Constrained movement [dx, dy]
 * @returns Object with updated segments and flag indicating if new segments were created
 */
export function updateSegmentWithNewSegments(
  segments: ConnectorSegment[],
  draggedIndex: number,
  delta: IVec
): {
  segments: ConnectorSegment[];
  created: boolean;
  segmentsCreatedBefore: number;
} {
  if (draggedIndex < 0 || draggedIndex >= segments.length) {
    return { segments, created: false, segmentsCreatedBefore: 0 };
  }

  // Check if we need to create new segments
  // This happens when dragging first or last segment that's movable
  const isFirstSegment = draggedIndex === 0;
  const isLastSegment = draggedIndex === segments.length - 1;

  // For middle segments, use tail-preserving update (creates new segments if adjacent to tails)
  if (!isFirstSegment && !isLastSegment) {
    return updateMiddleSegmentPreservingTails(segments, draggedIndex, delta);
  }

  const dragged = segments[draggedIndex];

  // Only create new segments if there's actual movement
  const hasDelta = Math.abs(delta[0]) > EPSILON || Math.abs(delta[1]) > EPSILON;
  if (!hasDelta) {
    return { segments, created: false, segmentsCreatedBefore: 0 };
  }

  // Build new path with additional segment
  let newPath: IVec[];

  if (isFirstSegment) {
    // Dragging the first segment - create a proper tail at the shape connection
    // Structure: fixedStart -> tailEnd -> bridgeEnd -> movedEnd -> rest
    // This creates: Tail A (short) -> Bridge F (movable) -> Moved segment -> rest
    const fixedStart = [...dragged.start] as IVec;

    // Calculate tail length (like S-shape does)
    const tailLen = Math.min(TAIL_LENGTH, dragged.length / 4);

    // Calculate moved segment's end position
    const movedEnd: IVec = [
      dragged.end[0] + delta[0],
      dragged.end[1] + delta[1],
    ];

    newPath = [fixedStart];

    if (dragged.orientation === 'horizontal') {
      // Horizontal segment moved vertically
      // Tail A: horizontal from fixedStart, length = tailLen
      // Bridge F: vertical from tailEnd to the moved Y position
      const direction = dragged.end[0] > dragged.start[0] ? 1 : -1;
      const tailEnd: IVec = [
        fixedStart[0] + tailLen * direction,
        fixedStart[1],
      ];
      const bridgeEnd: IVec = [tailEnd[0], fixedStart[1] + delta[1]];

      newPath.push(tailEnd); // End of tail A
      newPath.push(bridgeEnd); // End of bridge F, start of moved segment
      newPath.push(movedEnd); // End of moved segment
    } else {
      // Vertical segment moved horizontally
      // Tail A: vertical from fixedStart, length = tailLen
      // Bridge F: horizontal from tailEnd to the moved X position
      const direction = dragged.end[1] > dragged.start[1] ? 1 : -1;
      const tailEnd: IVec = [
        fixedStart[0],
        fixedStart[1] + tailLen * direction,
      ];
      const bridgeEnd: IVec = [fixedStart[0] + delta[0], tailEnd[1]];

      newPath.push(tailEnd); // End of tail A
      newPath.push(bridgeEnd); // End of bridge F, start of moved segment
      newPath.push(movedEnd); // End of moved segment
    }

    // Add remaining segments' end points, preserving target connection
    if (segments.length === 2) {
      // L-shape: add corner point to ensure orthogonality, then target
      const target = segments[1].end;
      if (dragged.orientation === 'horizontal') {
        // Moved segment is horizontal, next segment should be vertical
        // Add corner at [movedEnd[0], target[1]] if different from target
        const corner: IVec = [movedEnd[0], target[1]];
        if (
          Math.abs(corner[0] - target[0]) > EPSILON ||
          Math.abs(corner[1] - target[1]) > EPSILON
        ) {
          newPath.push(corner);
        }
      } else {
        // Moved segment is vertical, next segment should be horizontal
        // Add corner at [target[0], movedEnd[1]] if different from target
        const corner: IVec = [target[0], movedEnd[1]];
        if (
          Math.abs(corner[0] - target[0]) > EPSILON ||
          Math.abs(corner[1] - target[1]) > EPSILON
        ) {
          newPath.push(corner);
        }
      }
      newPath.push([...target] as IVec);
    } else {
      // More complex paths (3+ segments): handle connectivity adjustments
      // First, add corner point to ensure orthogonality from movedEnd to first remaining segment
      const firstRemaining = segments[1];
      if (dragged.orientation === 'horizontal') {
        // Moved segment is horizontal, next should be vertical
        const corner: IVec = [movedEnd[0], firstRemaining.end[1]];
        if (
          Math.abs(corner[0] - firstRemaining.end[0]) > EPSILON ||
          Math.abs(corner[1] - firstRemaining.end[1]) > EPSILON
        ) {
          newPath.push(corner);
        }
      } else {
        // Moved segment is vertical, next should be horizontal
        const corner: IVec = [firstRemaining.end[0], movedEnd[1]];
        if (
          Math.abs(corner[0] - firstRemaining.end[0]) > EPSILON ||
          Math.abs(corner[1] - firstRemaining.end[1]) > EPSILON
        ) {
          newPath.push(corner);
        }
      }

      // Add remaining segments' endpoints
      for (let i = 1; i < segments.length; i++) {
        newPath.push([...segments[i].end] as IVec);
      }
    }
  } else {
    // isLastSegment - Dragging the last segment - create a proper tail at the target connection
    // Structure: prev segments (adjusted) -> bridgeStart -> tailStart -> fixedEnd
    // The previous segment is stretched/adjusted to reach the moved position
    // This creates: ... -> Adjusted prev -> Moved (shortened) -> Bridge F -> Tail C
    const fixedEnd = [...dragged.end] as IVec;

    // Calculate tail length (like S-shape does)
    const tailLen = Math.min(TAIL_LENGTH, dragged.length / 4);

    // Calculate where the moved segment starts (previous segment's end, adjusted)
    const movedStart: IVec = [
      dragged.start[0] + delta[0],
      dragged.start[1] + delta[1],
    ];

    // Start with existing path up to (but not including) the last segment
    newPath = [[...segments[0].start] as IVec];
    for (let i = 0; i < segments.length - 1; i++) {
      const seg = segments[i];
      if (i === segments.length - 2) {
        // The segment just before the dragged one needs to stretch to reach movedStart
        if (dragged.orientation === 'vertical') {
          // Dragged is vertical, so prev segment's end X changes
          newPath.push([movedStart[0], seg.end[1]]);
        } else {
          // Dragged is horizontal, so prev segment's end Y changes
          newPath.push([seg.end[0], movedStart[1]]);
        }
      } else {
        newPath.push([...seg.end] as IVec);
      }
    }

    // Calculate tail and bridge positions
    if (dragged.orientation === 'horizontal') {
      // Horizontal segment moved vertically
      // Tail C: horizontal at fixedEnd, length = tailLen
      // Bridge F: vertical from bridgeStart to tailStart
      const direction = dragged.end[0] > dragged.start[0] ? 1 : -1;
      const tailStart: IVec = [fixedEnd[0] - tailLen * direction, fixedEnd[1]];
      const bridgeStart: IVec = [tailStart[0], movedStart[1]];

      // Moved segment: from adjusted prev end (movedStart) to bridgeStart
      newPath.push(bridgeStart); // End of moved segment
      newPath.push(tailStart); // Bridge goes from bridgeStart to here
      newPath.push(fixedEnd); // End of tail C
    } else {
      // Vertical segment moved horizontally
      // Tail C: vertical at fixedEnd, length = tailLen
      // Bridge F: horizontal from bridgeStart to tailStart
      const direction = dragged.end[1] > dragged.start[1] ? 1 : -1;
      const tailStart: IVec = [fixedEnd[0], fixedEnd[1] - tailLen * direction];
      const bridgeStart: IVec = [movedStart[0], tailStart[1]];

      // Moved segment: from adjusted prev end (movedStart) to bridgeStart
      newPath.push(bridgeStart); // End of moved segment
      newPath.push(tailStart); // Bridge goes from bridgeStart to here
      newPath.push(fixedEnd); // End of tail C
    }
  }

  // For first segment drag, TWO segments are created before (tail + bridge), index shifts by 2
  // For last segment drag, segments are created after, index stays the same
  return {
    segments: parsePathToSegments(newPath),
    created: true,
    segmentsCreatedBefore: isFirstSegment ? 2 : 0,
  };
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
 *   Before: [start] ──A──x─────B─────x──C── [end]
 *
 *   After:        ┌───B───┐
 *          ──A──x─┘       └─x──C──
 *                 D       E
 *
 *   Where A and C are tails (not draggable), and D, B, E are movable.
 *
 * For a vertical line dragged horizontally:
 *   Similar structure rotated 90 degrees.
 *
 * The key insight from CONNECTOR_DYNAMICS.md:
 * - Tails (A, C) are short fixed segments near shape connections
 * - After split, we get 3 movable segments (D, B, E)
 * - This requires 6 path points to create 5 segments (2 tails + 3 movable)
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

  // Calculate the tail length, capped to not exceed segment length
  const segmentLength = original.length;
  const tailLen = Math.min(TAIL_LENGTH, segmentLength / 4);

  let newPath: IVec[];

  if (original.orientation === 'horizontal') {
    // Horizontal line dragged vertically
    // Creates 6 points: start -> tailEnd -> corner1 -> corner2 -> tailStart -> end
    // Where:
    //   - A (start to tailEnd): horizontal tail
    //   - D (tailEnd to corner1): vertical movable
    //   - B (corner1 to corner2): horizontal movable (the dragged segment)
    //   - E (corner2 to tailStart): vertical movable
    //   - C (tailStart to end): horizontal tail

    const direction = end[0] > start[0] ? 1 : -1;
    const tailEndX = start[0] + tailLen * direction;
    const tailStartX = end[0] - tailLen * direction;
    const newY = start[1] + delta[1];

    newPath = [
      start, // Point 0: start
      [tailEndX, start[1]], // Point 1: end of tail A, start of D
      [tailEndX, newY], // Point 2: end of D, start of B (corner)
      [tailStartX, newY], // Point 3: end of B, start of E (corner)
      [tailStartX, end[1]], // Point 4: end of E, start of tail C
      end, // Point 5: end
    ];
  } else {
    // Vertical line dragged horizontally
    // Creates 6 points for vertical orientation

    const direction = end[1] > start[1] ? 1 : -1;
    const tailEndY = start[1] + tailLen * direction;
    const tailStartY = end[1] - tailLen * direction;
    const newX = start[0] + delta[0];

    newPath = [
      start, // Point 0: start
      [start[0], tailEndY], // Point 1: end of tail A, start of D
      [newX, tailEndY], // Point 2: end of D, start of B (corner)
      [newX, tailStartY], // Point 3: end of B, start of E (corner)
      [end[0], tailStartY], // Point 4: end of E, start of tail C
      end, // Point 5: end
    ];
  }

  // Parse the new path into segments
  return parsePathToSegments(newPath);
}

/**
 * Shape bounds information for tail detachment detection.
 */
export interface ShapeBounds {
  /** Left edge X coordinate */
  x: number;
  /** Top edge Y coordinate */
  y: number;
  /** Width of the shape */
  w: number;
  /** Height of the shape */
  h: number;
}

/**
 * Detect and handle tail detachment when dragging a segment.
 *
 * Tail detachment occurs when a segment adjacent to a tail is dragged
 * past the shape boundary, causing the tail to "flip" direction.
 *
 * For example, when segment D (adjacent to tail A at source shape) is
 * dragged past the shape's boundary:
 *
 * Before:
 *   [Shape] ──A──┬──D──┐
 *                │     │
 *                │     B
 *
 * After dragging D past shape left edge:
 *          ┌──D──┐
 *          │     │
 *   ┌──────┼─────┤
 *   │      F     │     (F is new segment, A removed)
 *   └──────┴─────┘
 *          │
 *          B
 *
 * @param segments - Current segments
 * @param draggedIndex - Index of segment being dragged
 * @param delta - Constrained movement [dx, dy]
 * @param sourceBounds - Bounds of source shape (if connected), null otherwise
 * @param targetBounds - Bounds of target shape (if connected), null otherwise
 * @returns Object with updated segments and flag indicating if detachment occurred
 */
export function updateSegmentWithTailDetachment(
  segments: ConnectorSegment[],
  draggedIndex: number,
  delta: IVec,
  sourceBounds: ShapeBounds | null,
  targetBounds: ShapeBounds | null
): { segments: ConnectorSegment[]; detached: boolean } {
  if (draggedIndex < 0 || draggedIndex >= segments.length) {
    return { segments, detached: false };
  }

  // First, perform the regular segment update
  const updated = updateSegmentPosition(segments, draggedIndex, delta);

  // Check for source tail detachment (index 0 is a tail)
  if (
    draggedIndex === 1 &&
    segments.length >= 2 &&
    segments[0].type === 'tail' &&
    sourceBounds
  ) {
    const tail = updated[0];
    const dragged = updated[1];

    // Check if the dragged segment has moved past the shape boundary
    // For a vertical dragged segment moving horizontally:
    // - If it moves left past the shape's left edge, detach
    // For a horizontal dragged segment moving vertically:
    // - If it moves up past the shape's top edge (or down past bottom), detach
    const shouldDetach = checkTailDetachment(
      tail,
      dragged,
      sourceBounds,
      'source'
    );

    if (shouldDetach) {
      const restructured = performTailDetachment(
        updated,
        0, // tail index
        draggedIndex,
        sourceBounds,
        'source'
      );
      return { segments: restructured, detached: true };
    }
  }

  // Check for target tail detachment (last segment is a tail)
  const lastIndex = segments.length - 1;
  if (
    draggedIndex === lastIndex - 1 &&
    segments.length >= 2 &&
    segments[lastIndex].type === 'tail' &&
    targetBounds
  ) {
    const tail = updated[lastIndex];
    const dragged = updated[draggedIndex];

    const shouldDetach = checkTailDetachment(
      tail,
      dragged,
      targetBounds,
      'target'
    );

    if (shouldDetach) {
      const restructured = performTailDetachment(
        updated,
        lastIndex, // tail index
        draggedIndex,
        targetBounds,
        'target'
      );
      return { segments: restructured, detached: true };
    }
  }

  return { segments: updated, detached: false };
}

/**
 * Check if a tail should be detached based on the dragged segment position.
 */
function checkTailDetachment(
  tail: ConnectorSegment,
  _dragged: ConnectorSegment,
  shapeBounds: ShapeBounds,
  connection: 'source' | 'target'
): boolean {
  // The adjacent point is where the tail meets the dragged segment
  const adjacentPoint = connection === 'source' ? tail.end : tail.start;

  // Check if the adjacent point (where tail meets the dragged segment)
  // has moved past the shape boundary in the direction of the drag

  if (tail.orientation === 'horizontal') {
    // Horizontal tail - check if X coordinate has crossed shape boundary
    if (connection === 'source') {
      // Source tail goes from shape rightward
      // Detach if the tail end (adjacent to dragged) is now LEFT of shape's left edge
      if (adjacentPoint[0] < shapeBounds.x) {
        return true;
      }
    } else {
      // Target tail comes from right to shape
      // Detach if the tail start (adjacent to dragged) is now RIGHT of shape's right edge
      if (adjacentPoint[0] > shapeBounds.x + shapeBounds.w) {
        return true;
      }
    }
  } else {
    // Vertical tail - check if Y coordinate has crossed shape boundary
    if (connection === 'source') {
      // Source tail goes from shape downward
      // Detach if the tail end (adjacent to dragged) is now ABOVE shape's top edge
      if (adjacentPoint[1] < shapeBounds.y) {
        return true;
      }
    } else {
      // Target tail comes from below to shape
      // Detach if the tail start (adjacent to dragged) is now BELOW shape's bottom edge
      if (adjacentPoint[1] > shapeBounds.y + shapeBounds.h) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Perform the tail detachment operation.
 *
 * This removes the old tail and creates a new segment structure:
 * - The old tail is removed
 * - A new segment F is created perpendicular to the old tail
 * - The path is adjusted to maintain connectivity
 */
function performTailDetachment(
  segments: ConnectorSegment[],
  tailIndex: number,
  draggedIndex: number,
  _shapeBounds: ShapeBounds,
  connection: 'source' | 'target'
): ConnectorSegment[] {
  const tail = segments[tailIndex];
  const dragged = segments[draggedIndex];

  // The connection point stays at the shape boundary
  const connectionPoint =
    connection === 'source' ? [...tail.start] : [...tail.end];

  // Calculate the new structure:
  // 1. Keep the connection point on the shape
  // 2. Create a new perpendicular segment (F) from the connection point
  // 3. Connect F to the dragged segment

  let newPath: IVec[];

  if (connection === 'source') {
    // Source tail detachment
    // Original: connectionPoint -> tailEnd -> draggedEnd -> ...
    // New: connectionPoint -> newCorner1 -> newCorner2 -> draggedEnd -> ...

    if (tail.orientation === 'horizontal') {
      // Horizontal tail was connecting shape right side
      // After detachment, create vertical segment from shape right side

      // The new Y position is where the dragged segment is now
      const newY = dragged.start[1];

      // Create the new path:
      // connectionPoint -> [shapeRightX, newY] -> draggedStart -> ...rest
      newPath = [
        connectionPoint as IVec,
        [connectionPoint[0], newY], // New corner (vertical F segment)
        dragged.start,
        dragged.end,
      ];

      // Add remaining segments
      for (let i = draggedIndex + 1; i < segments.length; i++) {
        newPath.push(segments[i].end);
      }
    } else {
      // Vertical tail was connecting shape bottom side
      // After detachment, create horizontal segment from shape bottom side

      const newX = dragged.start[0];

      newPath = [
        connectionPoint as IVec,
        [newX, connectionPoint[1]], // New corner (horizontal F segment)
        dragged.start,
        dragged.end,
      ];

      // Add remaining segments
      for (let i = draggedIndex + 1; i < segments.length; i++) {
        newPath.push(segments[i].end);
      }
    }
  } else {
    // Target tail detachment
    // Original: ...-> draggedStart -> draggedEnd -> tailStart -> connectionPoint
    // New: ...-> draggedStart -> draggedEnd -> newCorner -> connectionPoint

    if (tail.orientation === 'horizontal') {
      const newY = dragged.end[1];

      // Build path from start
      newPath = [segments[0].start];

      // Add segments up to and including dragged
      for (let i = 0; i <= draggedIndex; i++) {
        newPath.push(segments[i].end);
      }

      // Add new corner and connection point
      newPath.push([connectionPoint[0], newY]); // New corner (vertical F segment)
      newPath.push(connectionPoint as IVec);
    } else {
      const newX = dragged.end[0];

      newPath = [segments[0].start];

      for (let i = 0; i <= draggedIndex; i++) {
        newPath.push(segments[i].end);
      }

      newPath.push([newX, connectionPoint[1]]); // New corner (horizontal F segment)
      newPath.push(connectionPoint as IVec);
    }
  }

  return parsePathToSegments(newPath);
}
