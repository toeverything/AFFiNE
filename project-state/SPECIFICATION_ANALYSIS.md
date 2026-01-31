# Connector Dynamics Specification Analysis

Based on `/AFFiNE/CONNECTOR_DYNAMICS.md`

## Core Concepts

### 1. Segment Types

| Type | Description | Draggable | Movement Constraint |
|------|-------------|-----------|---------------------|
| **Tail (A, C)** | Short segment exiting/entering shape | NO | Fixed |
| **Movable** | User-draggable segment | YES | H: Y only, V: X only |

### 2. Segment Orientation

- **Horizontal segments**: Can only be dragged UP/DOWN (Y axis)
- **Vertical segments**: Can only be dragged LEFT/RIGHT (X axis)
- This constraint is CRITICAL - it's what makes orthogonal connectors work

### 3. Visual Representation

- Draggable handles appear at segment MIDPOINTS
- Tails (A, C) have NO visible handles
- (x) marks the boundary between tail and movable sections

## Behavior Scenarios

### Scenario 1: Initial Horizontal Connector

```
[Shape]--A--x---B---x--C--[Shape]
```

- A, C are fixed tails
- B is the movable segment
- Handle appears at midpoint of B

### Scenario 2: Drag B Upward

```
        ┌───B───┐
        D       E
        │       │
[Shape]─┘       └─[Shape]
```

**Result**:
- B moves up, becomes shorter
- D (vertical) created on left
- E (vertical) created on right
- Now 3 movable segments: B, D, E

### Scenario 3: Drag E Left

```
        ┌─B─┐
        D   E
        │   │
[Shape]─┘   └─F─[Shape]
```

**Result**:
- E moves left
- B shrinks
- F (horizontal) created

### Scenario 4: Add Waypoint to E

- Creates new segment by splitting E
- Creates H segment below the split point
- (x) marks the junction

### Scenario 5: Drag Past Tail

```
   ┌────D────┐
   │         │
┌──┼──┐      │
│  E  │      B
└──┴──┘      │
```

**Result**:
- When D moves up past shape boundary
- Tail A has no length
- E becomes movable (replaces A)
- Even if dragged back, E remains movable

## Edge Cases Identified

### EC1: Zero-Length Segments
When a drag makes a segment have zero length, it should:
- Be removed from the visual path
- But potentially preserved in the model for undo

### EC2: Segment Collapse
When dragging creates overlapping segments:
- Merge adjacent segments of same orientation
- Maintain path continuity

### EC3: Tail Conversion
When a tail is "overwritten":
- The tail becomes a movable segment
- This is a one-way conversion (doesn't revert)

### EC4: S-Shaped Connectors
Auto-routed S-shape with sections:
- A (tail from source)
- B (vertical, movable)
- D (horizontal, movable)
- C (tail to target)

## Data Model Proposal

### Segment-Based Model (NEW)

```typescript
interface ConnectorSegment {
  id: string;
  type: 'tail' | 'movable';
  orientation: 'horizontal' | 'vertical';

  // Absolute coordinates
  start: [number, number];
  end: [number, number];
}

interface ConnectorModel {
  segments: ConnectorSegment[];
  sourceId?: string;
  targetId?: string;
}
```

### Why NOT Waypoints

The current waypoint model stores arbitrary (x, y) points. Problems:

1. **Coordinate system**: Relative coordinates drift when bounding box changes
2. **No orientation**: Waypoints don't encode H vs V constraint
3. **No segment identity**: Can't track which segment is being dragged
4. **Insertion order**: Waypoints added at end, not at correct path position

### Why Segments Work Better

1. **Absolute coordinates**: No drift
2. **Explicit orientation**: H segments constrain to Y movement
3. **Segment identity**: Each segment can be independently tracked
4. **Ordered by definition**: Path is segments[0] → segments[n]

## Implementation Strategy

### Phase 1: Read-Only Segment Display
- Parse existing path into segments
- Identify tail vs movable segments
- Render handles at movable segment midpoints

### Phase 2: Single Segment Drag
- Implement constrained dragging (H→Y, V→X)
- Update adjacent segments when one moves
- Regenerate path

### Phase 3: Segment Creation
- Click midpoint to create new junction
- Split segment into two
- Insert new perpendicular segment

### Phase 4: Edge Cases
- Zero-length segment handling
- Tail conversion
- Undo/redo support

## Test Cases Needed

Based on CONNECTOR_DYNAMICS.md:

1. **test_horizontal_drag_up** - Drag B up, verify D and E created
2. **test_vertical_drag_left** - Drag E left, verify F created
3. **test_segment_shrink** - Drag that shrinks B
4. **test_add_waypoint** - Click midpoint, verify split
5. **test_drag_new_segment** - Drag newly created segment
6. **test_drag_past_tail** - Verify tail conversion
7. **test_s_connector** - Test S-shape specific behavior
8. **test_mirror_vertical** - Same tests but for vertical connectors
