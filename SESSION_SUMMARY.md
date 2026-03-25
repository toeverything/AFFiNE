# Connector Movement & Jumping - Implementation Session Summary

## 🎯 Session Objectives

Implement draw.io-style connector features in AFFiNE:

1. Connector dragging with waypoint addition
2. Waypoint management
3. Jump styles (None, Arc, Gap, Sharp, Line)

## ✅ Completed Work

### Commits Made

1. **4a8341650** - Add waypoints and jump style properties to connector model
2. **b56c03bd8** - Add jump detection algorithm for connector intersections
3. **472e2c266** - Add jump rendering infrastructure to connector DOM renderer
4. **76179904a** - Add jump style selector to connector toolbar

### Features Implemented

#### 1. Model Schema (Phase 1) ✅

- Added `waypoints?: IVec[]` for user-defined routing points
- Added `jumpStyle: JumpStyle` with 5 options (none/arc/gap/sharp/line)
- Added `jumpSize: number` for jump rendering size
- All properties persisted via `@field()` decorators

#### 2. Jump Detection Algorithm (Phase 3) ✅

**File**: `/blocksuite/affine/gfx/connector/src/jump-calculator.ts` (NEW)

- `updateConnectorJumps()` - detects intersections between connectors
- `lineIntersection()` - calculates segment intersection points
- `findNearestSegment()` - helper for waypoint insertion
- Returns `RoutedPoint[]` with type markers (0=waypoint, 1=jump)

#### 3. Jump Rendering (Phase 4) ✅

**File**: `/blocksuite/affine/gfx/connector/src/renderer/dom-renderer.ts`

- `createConnectorPathWithJumps()` - renders all 5 jump styles:
  - **arc**: Curved bezier arc perpendicular to line (f \* 1.3 amplification)
  - **sharp**: Angular jump at 90° to line direction
  - **gap**: Discontinuity in path (moveTo without drawing)
  - **line**: Crossing X shape at intersection
  - **none**: Straight through (no modification)
- Based on draw.io's rendering algorithm (Graph.js:9161-9292)

#### 4. UI Controls (Phase 5) ✅

**File**: `/blocksuite/affine/gfx/connector/src/toolbar/connector-menu.ts`

- Added jump style dropdown to connector toolbar
- 5 options: None, Arc, Gap, Sharp, Line
- Integrated with EditPropsStore for persistence
- Custom CSS styling for selector

## 🚧 Remaining Work

### High Priority - View Layer Integration

**Status**: Infrastructure ready, needs wiring

The jump rendering function is complete but not yet called because it needs access to all connectors in the scene. Two integration options:

**Option A (Recommended)**: Add view-level update hook

```typescript
// Pseudo-code for where to add
function onConnectorPathUpdate(connector) {
  if (connector.jumpStyle !== 'none') {
    const allConnectors = getAllConnectorsFromStore();
    connector.routedPoints = updateConnectorJumps(connector, allConnectors);
  }
}
```

**File to modify**: `/blocksuite/affine/gfx/connector/src/renderer/dom-renderer.ts` (lines 447-452)

- Replace TODO comment with actual rendering call
- Use `connector.routedPoints` if available

### Medium Priority - Segment Dragging (Phase 2)

**Status**: Not started - High complexity

Implement draw.io-style virtual bends:

1. Extend `EdgelessConnectorHandle` component
2. Render semi-transparent handles on segment midpoints
3. Render solid handles on existing waypoints
4. Add drag interaction to create/modify waypoints
5. Update path calculation to include explicit waypoints

**File to modify**: `/blocksuite/affine/gfx/connector/src/components/connector-handle.ts`
**Estimated**: 300-500 lines of code

### Low Priority - Context Menu Actions (Phase 6)

**Status**: Not started - Low complexity

Add right-click menu items:

- "Add Waypoint Here" - insert at nearest segment
- "Remove Waypoint" - delete specific waypoint
- "Clear All Waypoints" - reset to auto-routing

## 📊 Statistics

- **Lines of Code**: ~500+
- **New Files**: 1
- **Modified Files**: 3
- **Commits**: 4
- **Feature Completeness**: 60% (core ready, needs integration & UI)

## 🧪 Testing Status

**Cannot test yet** - requires view layer integration to calculate intersections.

Once integrated, test by:

1. Create two connectors that cross
2. Select one connector
3. Change jump style in toolbar
4. Verify jump appears at intersection

## 📝 Notes for Next Session

### Quick Win - Enable Jump Rendering

To get jumps working:

1. Find where connector paths are updated/rendered
2. Add hook to call `updateConnectorJumps(connector, allConnectors)`
3. Store result in model or local state
4. Update dom-renderer.ts line 452 to use jump rendering

This is ~20-30 lines of integration code.

### Next Major Feature - Segment Dragging

More complex but high value for user experience. Consider breaking into sub-tasks:

1. First: Show waypoint handles only (read-only visualization)
2. Then: Add drag to modify existing waypoints
3. Finally: Add virtual bends for adding new waypoints

## 🔗 Reference

All research and implementation details in:

- `/workspace/CONNECTOR_RESEARCH.md` - Draw.io code analysis & algorithms
- Commit history on branch `feature/frawio-connector-shape-menu`

## 🎉 Session Success

Core infrastructure complete! The model, algorithms, rendering, and UI are all in place. Just needs final wiring to the view layer to become fully functional.
