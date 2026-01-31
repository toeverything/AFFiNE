# Draw.io Connector Segment Handling Research

## Key File: `mxEdgeSegmentHandler.js`

### Segment Orientation Detection

```javascript
// From mxEdgeSegmentHandler.js lines 320-324
var horizontal = Math.round(pts[i].x - pts[i + 1].x) == 0;

// Special case where dy is 0 as well
if (Math.round(pts[i].y - pts[i + 1].y) == 0 && i < pts.length - 2) {
    horizontal = Math.round(pts[i].x - pts[i + 2].x) == 0;
}

bend.setCursor((horizontal) ? 'col-resize' : 'row-resize');
```

### Key Insight: Cursor Meanings

| Segment Type | Same Coordinate | Cursor | Drag Direction |
|--------------|-----------------|--------|----------------|
| **Vertical** | Same X | `col-resize` | Left/Right (X axis) |
| **Horizontal** | Same Y | `row-resize` | Up/Down (Y axis) |

This is EXACTLY what CONNECTOR_DYNAMICS.md specifies!

### Virtual Bend Creation

```javascript
// From mxEdgeSegmentHandler.js lines 307-332
for (var i = 0; i < pts.length - 1; i++) {
    bend = this.createVirtualBend();
    bends.push(bend);
    // ... orientation detection and cursor setting
    this.points.push(new mxPoint(0,0));
}
```

### Handle Positioning (redrawInnerBends)

```javascript
// From mxEdgeSegmentHandler.js lines 357-395
// Handles are placed at segment midpoints
var p0 = pts[i];
var pe = pts[i + 1];
// Position handle at midpoint between p0 and pe
```

## Data Model

Draw.io stores edge points as:
- **geometry.points** - Array of `mxPoint` objects (control points/waypoints)
- **absolutePoints** - Computed absolute positions of all path points
- Points are in **absolute coordinates**

## Key Architecture Differences from AFFiNE

| Aspect | Draw.io | AFFiNE (current) |
|--------|---------|------------------|
| Coordinates | Absolute | Relative to bounding box |
| Waypoints | Stored as points array | Stored as IVec[] |
| Path | Computed from points | Computed from A* routing |
| Segments | Derived from points | Not explicitly tracked |

## Implementation Recommendations for AFFiNE

### 1. Segment Identification
Parse the connector path into explicit segments:
```typescript
interface Segment {
  index: number;
  start: [number, number];  // Absolute coordinates
  end: [number, number];    // Absolute coordinates
  orientation: 'horizontal' | 'vertical';
  isTail: boolean;          // First/last segment near shape
}
```

### 2. Drag Constraints
Apply during mouse move:
```typescript
function constrainDrag(segment: Segment, mousePos: Point): Point {
  if (segment.orientation === 'horizontal') {
    // Only allow Y movement
    return { x: segment.start.x, y: mousePos.y };
  } else {
    // Only allow X movement
    return { x: mousePos.x, y: segment.start.y };
  }
}
```

### 3. Segment Updates
When a segment is dragged:
1. Update the segment's position
2. Adjust adjacent segments to maintain connectivity
3. Potentially create new segments if needed
4. Regenerate the path

### 4. Handle Rendering
Place handles at segment midpoints:
```typescript
function getHandlePosition(segment: Segment): Point {
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2
  };
}
```

## Testing Strategy

Based on draw.io's approach, tests should verify:

1. **Orientation Detection**
   - Vertical segment (same X) detected correctly
   - Horizontal segment (same Y) detected correctly

2. **Drag Constraints**
   - Horizontal segment only moves in Y
   - Vertical segment only moves in X

3. **Segment Updates**
   - Adjacent segments adjust when one is dragged
   - New segments created when needed

4. **Handle Rendering**
   - Handles appear at correct midpoint positions
   - Correct cursor shown for each segment type
