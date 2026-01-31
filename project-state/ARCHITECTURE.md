# Connector Dynamics Architecture

## Overview

This document defines the architecture for implementing draw.io-style connector segment dragging in AFFiNE. Based on CONNECTOR_DYNAMICS.md specification and draw.io code analysis.

---

## Core Data Structures

### Segment Model

```typescript
interface ConnectorSegment {
  // Absolute canvas coordinates
  start: [number, number];
  end: [number, number];

  // Derived properties
  orientation: 'horizontal' | 'vertical';
  length: number;
  midpoint: [number, number];

  // Segment type
  type: 'tail' | 'movable';

  // Index in path (0 = first segment from source)
  index: number;
}
```

### Why Absolute Coordinates

Previous attempts used relative coordinates (relative to bounding box). This caused corruption because:
1. Dragging changes the path
2. Path change recalculates bounding box
3. Relative coordinates now reference wrong position
4. Corruption on next render

**Solution**: Store and manipulate in absolute coordinates. Only convert for persistence if needed.

---

## Segment Classification

### Tail Segments (Type: 'tail')
- First segment from source shape (A in spec)
- Last segment to target shape (C in spec)
- **NOT draggable** initially
- Short, fixed-length segments
- Can become movable if dragged past (edge case)

### Movable Segments (Type: 'movable')
- All segments between tails
- **Draggable** with axis constraint:
  - Horizontal segments → move in Y only
  - Vertical segments → move in X only

---

## Coordinate System

```
Canvas Absolute Coordinates:
  (0,0) ─────────────────────────► X
    │
    │     ┌─────┐
    │     │Shape│──A──x──B──x──C──►┌─────┐
    │     └─────┘                  │Shape│
    │                              └─────┘
    ▼
    Y
```

- All segment positions in absolute canvas coordinates
- No relative-to-bounding-box calculations
- Handles positioned using viewport transform only

---

## Path Parsing Algorithm

Given a connector path (array of points), parse into segments:

```typescript
function parsePathToSegments(
  path: PointLocation[],
  tailLength: number = 20
): ConnectorSegment[] {
  const segments: ConnectorSegment[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const start = path[i];
    const end = path[i + 1];

    const segment: ConnectorSegment = {
      start: [start[0], start[1]],
      end: [end[0], end[1]],
      orientation: determineOrientation(start, end),
      length: distance(start, end),
      midpoint: midpoint(start, end),
      type: determineTailOrMovable(i, path.length, tailLength),
      index: i
    };

    segments.push(segment);
  }

  return segments;
}

function determineOrientation(
  start: PointLocation,
  end: PointLocation
): 'horizontal' | 'vertical' {
  // Same X = vertical, Same Y = horizontal
  // Use tolerance for floating point comparison
  const dx = Math.abs(end[0] - start[0]);
  const dy = Math.abs(end[1] - start[1]);

  return dx < dy ? 'vertical' : 'horizontal';
}

function determineTailOrMovable(
  index: number,
  pathLength: number,
  tailLength: number
): 'tail' | 'movable' {
  // First and last segments are tails
  if (index === 0 || index === pathLength - 2) {
    return 'tail';
  }
  return 'movable';
}
```

---

## Drag Behavior

### Constraint Logic

```typescript
function constrainDrag(
  segment: ConnectorSegment,
  newMousePos: [number, number],
  startMousePos: [number, number]
): [number, number] {
  const delta = [
    newMousePos[0] - startMousePos[0],
    newMousePos[1] - startMousePos[1]
  ];

  if (segment.orientation === 'horizontal') {
    // Horizontal segment: only Y movement allowed
    return [0, delta[1]];
  } else {
    // Vertical segment: only X movement allowed
    return [delta[0], 0];
  }
}
```

### Segment Update Logic

When a movable segment is dragged:

1. **Apply delta** to segment start and end points
2. **Update adjacent segments** to maintain connectivity
3. **Detect segment creation/deletion**:
   - If segment shrinks to zero length → merge
   - If segment extends past tail → may create new segment

```typescript
function updateSegmentPosition(
  segments: ConnectorSegment[],
  draggedIndex: number,
  delta: [number, number]
): ConnectorSegment[] {
  const dragged = segments[draggedIndex];

  // Update dragged segment
  dragged.start[0] += delta[0];
  dragged.start[1] += delta[1];
  dragged.end[0] += delta[0];
  dragged.end[1] += delta[1];

  // Update previous segment's end point
  if (draggedIndex > 0) {
    const prev = segments[draggedIndex - 1];
    if (dragged.orientation === 'horizontal') {
      prev.end[1] = dragged.start[1];
    } else {
      prev.end[0] = dragged.start[0];
    }
  }

  // Update next segment's start point
  if (draggedIndex < segments.length - 1) {
    const next = segments[draggedIndex + 1];
    if (dragged.orientation === 'horizontal') {
      next.start[1] = dragged.end[1];
    } else {
      next.start[0] = dragged.end[0];
    }
  }

  return segments;
}
```

---

## Handle Rendering

### Handle Types

1. **Tail handles** (visual only, not draggable)
   - Small circles at start/end points
   - For connecting to shapes

2. **Segment handles** (draggable)
   - Circles at segment midpoints
   - Visible for movable segments only
   - Cursor indicates drag direction

### Cursor Selection

```typescript
function getCursorForSegment(segment: ConnectorSegment): string {
  if (segment.type === 'tail') {
    return 'default';
  }

  // Match draw.io behavior
  return segment.orientation === 'vertical'
    ? 'col-resize'  // Drag left/right
    : 'row-resize'; // Drag up/down
}
```

---

## Implementation Phases

### Phase 1: Segment Parsing (Read-Only)
- Parse path into segments
- Identify tail vs movable
- Render handles at midpoints
- Show correct cursors
- **No dragging yet**

### Phase 2: Single Segment Drag
- Implement constrained dragging
- Update adjacent segments
- Rebuild path from segments
- Trigger connector update

### Phase 3: Segment Creation
- Click midpoint to split segment
- Handle zero-length segment merging
- Handle tail conversion

### Phase 4: Edge Cases
- Drag past tail
- S-shaped connectors
- Multiple waypoints

---

## File Changes Required

### New/Modified Files

1. **`connector-segment.ts`** (NEW)
   - Segment data structures
   - Path parsing functions
   - Segment update logic

2. **`connector-handle.ts`** (MODIFY)
   - Render segment handles
   - Handle drag events
   - Apply constraints

3. **`connector-manager.ts`** (MODIFY)
   - Integrate segment model
   - Path regeneration from segments

4. **`connector.ts`** (MODIFY)
   - Optional: Store segments instead of/alongside waypoints

---

## Test Strategy

### Unit Tests (if framework exists)
- `parsePathToSegments` with various paths
- `determineOrientation` edge cases
- `constrainDrag` constraints
- `updateSegmentPosition` adjacent updates

### E2E Tests (Playwright)
- Create connector, verify handles appear
- Drag horizontal segment, verify Y-only movement
- Drag vertical segment, verify X-only movement
- Verify adjacent segments update correctly

---

## Success Criteria

1. **Handles visible** at segment midpoints
2. **Correct cursors** (col-resize/row-resize)
3. **Constrained movement** (H→Y, V→X)
4. **Adjacent segments update** when one is dragged
5. **Path regenerates** correctly after drag
6. **No coordinate corruption** on page reload
