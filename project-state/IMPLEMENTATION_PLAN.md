# Connector Dynamics Implementation Plan

## Status: STARTING FRESH
**Date**: 2025-01-30
**Branch**: TBD (will create from commit 40da0f088)

---

## Problem Statement

The connector waypoint/segment dragging functionality has been attempted 7+ times without success. The core issues are:

1. **Relative coordinate system** - Waypoints stored relative to bounding box causes corruption when box changes
2. **Complex type system** - Mixing `PointLocation` and `IVec` types
3. **Path generation** - A* router not treating waypoints as mandatory points
4. **Segment identification** - Difficulty identifying which segment is being dragged

## Proposed Solution: Segment-Based Model

Based on the CONNECTOR_DYNAMICS.md specification, we should model connectors as:

1. **Fixed tails** (A, C) - Short segments exiting/entering shapes (immovable)
2. **Movable segments** (B, D, E, etc.) - User-draggable segments
3. **Segment constraints** - Horizontal segments only move in Y, vertical in X

### Key Insight from draw.io

Draw.io doesn't use arbitrary waypoints. Instead, it tracks **segment positions**:
- For orthogonal connectors, each segment has a position (X for vertical, Y for horizontal)
- Dragging a segment changes that position
- New segments are created when needed

---

## Implementation Phases

### Phase 1: Setup & Testing Framework
- [ ] Create clean branch from commit 40da0f088 (before segment dragging)
- [ ] Examine and understand AFFiNE's testing framework
- [ ] Write test cases for all scenarios in CONNECTOR_DYNAMICS.md
- [ ] Tests should fail initially (TDD approach)

### Phase 2: Segment Model
- [ ] Define segment data structure (NOT waypoints)
- [ ] Store as absolute coordinates (not relative)
- [ ] Each segment knows its type (tail vs movable) and orientation (H/V)

### Phase 3: Segment Rendering
- [ ] Render draggable handles on movable segments
- [ ] Visual distinction between fixed tails and movable segments
- [ ] Show segment midpoint handles for splitting

### Phase 4: Segment Dragging
- [ ] Horizontal segments: constrain to Y movement only
- [ ] Vertical segments: constrain to X movement only
- [ ] Update adjacent segments when one is dragged

### Phase 5: Segment Creation
- [ ] Clicking a segment midpoint creates a new junction
- [ ] Properly handle the segment splitting logic

### Phase 6: Edge Cases
- [ ] Dragging past a tail (converts tail to movable)
- [ ] S-shaped and reverse-S connectors
- [ ] Connectors with multiple waypoints

### Phase 7: Backwards Compatibility
- [ ] Migration function for existing diagrams
- [ ] Handle old waypoint data format

---

## Key Files

### Main Implementation
- `/blocksuite/affine/gfx/connector/src/connector-manager.ts` - Path generation
- `/blocksuite/affine/gfx/connector/src/components/connector-handle.ts` - UI handles
- `/blocksuite/affine/model/src/elements/connector/connector.ts` - Data model

### Testing
- TBD - need to examine testing framework

---

## Design Decisions

### Decision 1: Absolute Coordinates
**Rationale**: Relative coordinates cause corruption when bounding box changes
**Implementation**: Store all segment positions in absolute canvas coordinates

### Decision 2: Segment-Based Model (not Waypoint-Based)
**Rationale**: Waypoints don't map well to orthogonal connector behavior
**Implementation**: Model connectors as series of connected horizontal/vertical segments

### Decision 3: Constrained Movement
**Rationale**: Matches draw.io behavior and CONNECTOR_DYNAMICS.md spec
**Implementation**:
- Horizontal segments only move in Y direction
- Vertical segments only move in X direction

---

## Test Scenarios (from CONNECTOR_DYNAMICS.md)

### Scenario 1: Simple Horizontal Connector
```
Initial:  [Shape]--A--x---B---x--C--[Shape]
Drag B up: Creates D (vertical) and E (vertical) segments
```

### Scenario 2: Drag E Left
```
After B up: D and E are vertical segments
Drag E left: B shrinks, F (horizontal) is created
```

### Scenario 3: Drag F Down
```
F moves down, E elongates, G is created
```

### Scenario 4: Add Waypoint to E
```
Creates H segment (splits E into E and H)
```

### Scenario 5: Drag H Left
```
H moves left, F elongates, I is created
```

### Scenario 6: Vertical Connector (Mirror)
```
Same as horizontal but rotated 90 degrees
```

### Scenario 7: Drag Past Tail
```
D moves up past shape boundary
A (tail) converts to movable segment E
```

### Scenario 8: S-Shaped Connector
```
Auto-routed S-shape with movable section D
Drag D up: B shrinks, E is created
```

---

## Git Strategy

### Commits
- Use `--no-verify` to skip slow lint hooks during development
- Commit frequently with descriptive messages
- Tag working milestones

### Branches
- `connector-dynamics-v2` - Main development branch
- Keep current branch for reference

---

## Progress Log

### 2025-01-30 - Session Start
- Read and understood CONNECTOR_DYNAMICS.md specification
- Reviewed 7 failed attempts in CONNECTOR_CORRECTION_PLAN.md
- Created this implementation plan
- Next: Check MCP tools, examine testing framework
