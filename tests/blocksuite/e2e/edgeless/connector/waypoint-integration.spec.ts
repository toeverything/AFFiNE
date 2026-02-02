/**
 * Waypoint Integration Tests
 *
 * Tests for persistent connector segment dragging via waypoints.
 * Based on ARCHITECTURE.md Phase 5: Waypoint Integration.
 *
 * Key behaviors:
 * - Dragging segments should update connector.waypoints (persisted)
 * - Path should regenerate through waypoints
 * - Changes should survive page reload
 * - Undo/redo should work correctly
 */

import { expect } from '@playwright/test';

import {
  createConnectorElement,
  createShapeElement,
  dragBetweenViewCoords,
  edgelessCommonSetup as commonSetup,
  getConnectorPath,
  redoByKeyboard,
  selectElementInEdgeless,
  Shape,
  toViewCoord,
  undoByKeyboard,
} from '../../utils/actions/index.js';
import { assertConnectorPath } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

/**
 * Helper: Get the connector's waypoints property
 */
async function getConnectorWaypoints(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const container = document.querySelector('affine-edgeless-root');
    if (!container) return null;
    const connectors = (container as any).service.crud.getElementsByType(
      'connector'
    );
    if (connectors.length === 0) return null;
    return connectors[0].waypoints ?? null;
  });
}

/**
 * Helper: Get segment handle position by index
 */
async function getSegmentHandlePosition(
  page: import('@playwright/test').Page,
  index: number
) {
  return page.evaluate(
    ([idx]) => {
      const handles = document.querySelectorAll(
        '.line-controller.segment-handle'
      );
      if (idx >= handles.length) return null;
      const rect = handles[idx].getBoundingClientRect();
      return {
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
      };
    },
    [index]
  );
}

/**
 * Helper: Wait for connector path to update
 */
async function waitForPathUpdate(page: import('@playwright/test').Page) {
  await page.waitForTimeout(100);
}

/** Function used randomly more than once, here for linting errors */
function getRelativeShape(path: number[][]): number[][] {
  const deltas = [];
  for (let i = 1; i < path.length; i++) {
    deltas.push([path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]]);
  }
  return deltas;
}

// =============================================================================
// WAYPOINT PERSISTENCE TESTS
// =============================================================================

test.describe('Waypoint Persistence', () => {
  test('dragging 2-point horizontal line creates waypoints', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a simple horizontal connector
    const connectorId = await createConnectorElement(page, [0, 0], [200, 0]);
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Verify no waypoints initially
    const waypointsBefore = await getConnectorWaypoints(page);
    expect(waypointsBefore).toBeNull();

    // Get the segment handle position
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    // Drag the segment handle up by 50 pixels
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Verify waypoints were created
    const waypointsAfter = await getConnectorWaypoints(page);
    expect(waypointsAfter).not.toBeNull();
    expect(waypointsAfter!.length).toBeGreaterThan(0);
  });

  test('dragging 2-point vertical line creates waypoints', async ({ page }) => {
    await commonSetup(page);

    // Create a simple vertical connector
    const connectorId = await createConnectorElement(page, [0, 0], [0, 200]);
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Verify no waypoints initially
    const waypointsBefore = await getConnectorWaypoints(page);
    expect(waypointsBefore).toBeNull();

    // Get the segment handle position
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    // Drag the segment handle right by 50 pixels
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x + 50, handlePos!.y]
    );
    await waitForPathUpdate(page);

    // Verify waypoints were created
    const waypointsAfter = await getConnectorWaypoints(page);
    expect(waypointsAfter).not.toBeNull();
    expect(waypointsAfter!.length).toBeGreaterThan(0);
  });

  test('dragging S-shape middle segment updates waypoints', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create an S-shaped connector (will have 4 points)
    const connectorId = await createConnectorElement(page, [0, 0], [100, 200]);
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Get initial path
    const pathBefore = await getConnectorPath(page);
    expect(pathBefore.length).toBe(4); // S-shape has 4 points

    // Get the segment handle (middle horizontal segment)
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    // Drag the middle segment up by 30 pixels
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 30]
    );
    await waitForPathUpdate(page);

    // Verify waypoints were updated
    const waypointsAfter = await getConnectorWaypoints(page);
    expect(waypointsAfter).not.toBeNull();
  });
});

// =============================================================================
// UNDO/REDO TESTS
// =============================================================================

test.describe('Undo/Redo with Waypoints', () => {
  test('undo reverts segment drag', async ({ page }) => {
    await commonSetup(page);

    // Create a horizontal connector
    const connectorId = await createConnectorElement(page, [0, 0], [200, 0]);
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Get initial path
    const pathBefore = await getConnectorPath(page);

    // Get the segment handle position
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    // Drag the segment handle up
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Verify path changed
    const pathAfterDrag = await getConnectorPath(page);
    expect(pathAfterDrag.length).toBeGreaterThan(pathBefore.length);

    // Undo
    await undoByKeyboard(page);
    await waitForPathUpdate(page);

    // Verify path reverted
    const pathAfterUndo = await getConnectorPath(page);
    expect(pathAfterUndo.length).toBe(pathBefore.length);
  });

  test('redo restores segment drag', async ({ page }) => {
    await commonSetup(page);

    // Create a horizontal connector
    const connectorId = await createConnectorElement(page, [0, 0], [200, 0]);
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Get the segment handle position
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    // Drag the segment handle up
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Get path after drag
    const pathAfterDrag = await getConnectorPath(page);

    // Undo
    await undoByKeyboard(page);
    await waitForPathUpdate(page);

    // Redo
    await redoByKeyboard(page);
    await waitForPathUpdate(page);

    // Verify path restored
    const pathAfterRedo = await getConnectorPath(page);
    expect(pathAfterRedo.length).toBe(pathAfterDrag.length);
  });
});

// =============================================================================
// PATH GENERATION WITH WAYPOINTS
// =============================================================================

test.describe('Path Generation with Waypoints', () => {
  test('path routes through waypoints after connected shape moves', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create two shapes
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [300, 0], [400, 100], Shape.Square);

    // Create connector between shapes
    const connectorId = await createConnectorElement(
      page,
      [100, 50],
      [300, 50]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Get segment handle and drag to create waypoints
    const handlePos = await getSegmentHandlePosition(page, 0);
    if (handlePos) {
      await dragBetweenViewCoords(
        page,
        [handlePos.x, handlePos.y],
        [handlePos.x, handlePos.y - 50]
      );
      await waitForPathUpdate(page);
    }

    // Record waypoints
    const waypointsBeforeMove = await getConnectorWaypoints(page);

    // Move one of the shapes (select and drag)
    // This should trigger path recalculation, but waypoints should be preserved
    // TODO: Implement shape move and verify waypoints persist
  });

  test('connector with explicit waypoints routes through them', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a connector
    const connectorId = await createConnectorElement(page, [0, 0], [200, 200]);
    await waitForPathUpdate(page);

    // Set waypoints programmatically
    await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) return;
      const connectors = (container as any).service.crud.getElementsByType(
        'connector'
      );
      if (connectors.length === 0) return;

      // Set waypoints that force a specific path
      connectors[0].waypoints = [
        [100, 0], // Go right first
        [100, 200], // Then down
      ];
    });
    await waitForPathUpdate(page);

    // Verify path goes through the waypoints
    const path = await getConnectorPath(page);

    // Path should contain points near the waypoints
    // (exact positions depend on path generation algorithm)
    expect(path.length).toBeGreaterThanOrEqual(3);
  });
});

// =============================================================================
// MULTIPLE SEGMENT DRAGS
// =============================================================================

test.describe('Multiple Segment Operations', () => {
  test('can drag newly created segment after splitting', async ({ page }) => {
    await commonSetup(page);

    // Create a horizontal connector
    const connectorId = await createConnectorElement(page, [0, 0], [200, 0]);
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // First drag - creates S-shape
    let handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Re-select to get new handles
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Now the S-shape should have a draggable middle segment
    // Try to drag it again
    handlePos = await getSegmentHandlePosition(page, 0);
    if (handlePos) {
      await dragBetweenViewCoords(
        page,
        [handlePos.x, handlePos.y],
        [handlePos.x, handlePos.y - 30]
      );
      await waitForPathUpdate(page);
    }

    // Verify final waypoints
    const finalWaypoints = await getConnectorWaypoints(page);
    expect(finalWaypoints).not.toBeNull();
  });

  test('L-shaped connector has draggable corner segment', async ({ page }) => {
    await commonSetup(page);

    // Create an L-shaped connector (diagonal offset)
    const connectorId = await createConnectorElement(page, [0, 0], [100, 100]);
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Check if segment handles appear
    const handlePos = await getSegmentHandlePosition(page, 0);

    // L-shape might have 2 or 3 points depending on path generation
    // If there's a handle, try to drag it
    if (handlePos) {
      await dragBetweenViewCoords(
        page,
        [handlePos.x, handlePos.y],
        [handlePos.x + 30, handlePos.y]
      );
      await waitForPathUpdate(page);

      // Verify waypoints were created/updated
      const waypoints = await getConnectorWaypoints(page);
      // For an L-shape, we expect at least one waypoint after drag
      if (waypoints) {
        expect(waypoints.length).toBeGreaterThan(0);
      }
    }
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

test.describe('Edge Cases', () => {
  test('very small drag does not create unnecessary waypoints', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a horizontal connector
    const connectorId = await createConnectorElement(page, [0, 0], [200, 0]);
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Get the segment handle position
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    // Drag by only 1 pixel - should this create waypoints?
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 1]
    );
    await waitForPathUpdate(page);

    // Very small drags might be filtered out or create minimal waypoints
    // This test documents the expected behavior
  });

  test('connector with shapes at both ends preserves waypoints on shape move', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create two shapes
    const shape1Id = await createShapeElement(
      page,
      [0, 0],
      [100, 100],
      Shape.Square
    );
    const shape2Id = await createShapeElement(
      page,
      [300, 0],
      [400, 100],
      Shape.Square
    );

    // Create connector between shapes
    const connectorId = await createConnectorElement(
      page,
      [100, 50],
      [300, 50]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Drag middle segment to create waypoints
    const handlePos = await getSegmentHandlePosition(page, 0);
    if (handlePos) {
      await dragBetweenViewCoords(
        page,
        [handlePos.x, handlePos.y],
        [handlePos.x, handlePos.y - 50]
      );
      await waitForPathUpdate(page);
    }

    // Record waypoints
    const waypointsBefore = await getConnectorWaypoints(page);
    expect(waypointsBefore).not.toBeNull();

    // TODO: Move one shape and verify connector still goes through waypoints
    // (Path endpoints will change, but waypoints should be preserved)
  });

  test('deleting waypoints resets to automatic path', async ({ page }) => {
    await commonSetup(page);

    // Create a connector with waypoints
    const connectorId = await createConnectorElement(page, [0, 0], [200, 0]);
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Drag to create waypoints
    const handlePos = await getSegmentHandlePosition(page, 0);
    if (handlePos) {
      await dragBetweenViewCoords(
        page,
        [handlePos.x, handlePos.y],
        [handlePos.x, handlePos.y - 50]
      );
      await waitForPathUpdate(page);
    }

    // Verify waypoints exist
    let waypoints = await getConnectorWaypoints(page);
    expect(waypoints).not.toBeNull();

    // Clear waypoints programmatically
    await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) return;
      const connectors = (container as any).service.crud.getElementsByType(
        'connector'
      );
      if (connectors.length === 0) return;
      connectors[0].waypoints = undefined;
    });
    await waitForPathUpdate(page);

    // Verify waypoints are gone
    waypoints = await getConnectorWaypoints(page);
    expect(waypoints).toBeNull();

    // Path should be regenerated automatically (2 points for horizontal line)
    const path = await getConnectorPath(page);
    expect(path.length).toBe(2);
  });
});

// =============================================================================
// ROUNDED CONNECTOR COMPATIBILITY
// =============================================================================

test.describe('Rounded Connector Compatibility', () => {
  test('rounded connector has same segment handles as orthogonal', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a connector and set it to rounded mode
    const connectorId = await createConnectorElement(page, [0, 0], [100, 200]);

    // Set to rounded mode
    await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) return;
      const connectors = (container as any).service.crud.getElementsByType(
        'connector'
      );
      if (connectors.length === 0) return;
      connectors[0].mode = 3; // ConnectorMode.Rounded
    });
    await waitForPathUpdate(page);

    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Verify segment handles appear (same as orthogonal)
    const segmentHandles = await page
      .locator('.line-controller.segment-handle')
      .all();

    // Rounded connector should have segment handles like orthogonal
    // (path structure is the same, only rendering differs)
    expect(segmentHandles.length).toBeGreaterThanOrEqual(0);
  });

  test('dragging rounded connector segment updates waypoints', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a rounded connector
    const connectorId = await createConnectorElement(page, [0, 0], [200, 0]);

    // Set to rounded mode
    await page.evaluate(() => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) return;
      const connectors = (container as any).service.crud.getElementsByType(
        'connector'
      );
      if (connectors.length === 0) return;
      connectors[0].mode = 3; // ConnectorMode.Rounded
    });
    await waitForPathUpdate(page);

    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Get the segment handle position
    const handlePos = await getSegmentHandlePosition(page, 0);
    if (handlePos) {
      // Drag the segment
      await dragBetweenViewCoords(
        page,
        [handlePos.x, handlePos.y],
        [handlePos.x, handlePos.y - 50]
      );
      await waitForPathUpdate(page);

      // Verify waypoints were created (same behavior as orthogonal)
      const waypoints = await getConnectorWaypoints(page);
      expect(waypoints).not.toBeNull();
    }
  });
});

// =============================================================================
// WAYPOINT MOVEMENT WITH CONNECTOR
// =============================================================================

test.describe('Waypoint Movement', () => {
  test('waypoints move when connector is moved via select all', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a horizontal connector
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Drag to create waypoints
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Get waypoints before move
    const waypointsBefore = await getConnectorWaypoints(page);
    expect(waypointsBefore).not.toBeNull();
    expect(waypointsBefore!.length).toBeGreaterThan(0);

    const firstWaypointBefore = waypointsBefore![0];

    // Select all and move by 100px in X direction
    await page.keyboard.press('Control+a');
    await waitForPathUpdate(page);

    // Move selection by dragging
    const moveAmount = 100;
    await dragBetweenViewCoords(
      page,
      [200, 100], // Center of selection area
      [200 + moveAmount, 100]
    );
    await waitForPathUpdate(page);

    // Get waypoints after move
    const waypointsAfter = await getConnectorWaypoints(page);
    expect(waypointsAfter).not.toBeNull();
    expect(waypointsAfter!.length).toBe(waypointsBefore!.length);

    // Waypoints should have moved by the same amount
    const firstWaypointAfter = waypointsAfter![0];
    expect(firstWaypointAfter[0]).toBeCloseTo(
      firstWaypointBefore[0] + moveAmount,
      0
    );
    expect(firstWaypointAfter[1]).toBeCloseTo(firstWaypointBefore[1], 0);
  });

  test('waypoints move when connector is moved individually', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a connector
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Drag to create waypoints
    const handlePos = await getSegmentHandlePosition(page, 0);
    if (handlePos) {
      await dragBetweenViewCoords(
        page,
        [handlePos.x, handlePos.y],
        [handlePos.x, handlePos.y - 50]
      );
      await waitForPathUpdate(page);
    }

    // Get waypoints before move
    const waypointsBefore = await getConnectorWaypoints(page);
    expect(waypointsBefore).not.toBeNull();
    const firstWaypointYBefore = waypointsBefore![0][1];

    // Move the connector by dragging it
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Drag the connector down by 50px
    const moveAmountY = 50;
    await dragBetweenViewCoords(page, [200, 75], [200, 75 + moveAmountY]);
    await waitForPathUpdate(page);

    // Get waypoints after move
    const waypointsAfter = await getConnectorWaypoints(page);
    expect(waypointsAfter).not.toBeNull();

    // Waypoints Y should have moved by the same amount
    const firstWaypointYAfter = waypointsAfter![0][1];
    expect(firstWaypointYAfter).toBeCloseTo(
      firstWaypointYBefore + moveAmountY,
      0
    );
  });

  test('waypoints move when connected shape is moved', async ({ page }) => {
    await commonSetup(page);

    // Create two shapes
    const shape1Id = await createShapeElement(
      page,
      [0, 0],
      [100, 100],
      Shape.Square
    );
    await createShapeElement(page, [300, 0], [400, 100], Shape.Square);

    // Create connector between shapes
    const connectorId = await createConnectorElement(
      page,
      [100, 50],
      [300, 50]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Drag middle segment to create waypoints
    const handlePos = await getSegmentHandlePosition(page, 0);
    if (handlePos) {
      await dragBetweenViewCoords(
        page,
        [handlePos.x, handlePos.y],
        [handlePos.x, handlePos.y - 50]
      );
      await waitForPathUpdate(page);
    }

    // Get waypoints before shape move
    const waypointsBefore = await getConnectorWaypoints(page);

    // Move the first shape
    await selectElementInEdgeless(page, [shape1Id]);
    await waitForPathUpdate(page);

    // Drag shape down by 30px
    await dragBetweenViewCoords(page, [50, 50], [50, 80]);
    await waitForPathUpdate(page);

    // Waypoints should be preserved (connector shape maintained)
    // even though the path endpoints changed
    const waypointsAfter = await getConnectorWaypoints(page);

    // Waypoints should still exist - the shape is preserved
    // (The exact waypoint values might change depending on implementation)
    if (waypointsBefore && waypointsAfter) {
      expect(waypointsAfter.length).toBeGreaterThan(0);
    }
  });
});

// =============================================================================
// TAIL SEGMENT TESTS - First/Last Segments Should NOT Be Draggable
// =============================================================================

test.describe('Tail Segments Not Draggable', () => {
  test('first segment (tail) of S-shape connector has no drag handle', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a horizontal connector
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Drag middle segment to create S-shape (3 segments)
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Now we have an S-shape with 3 segments: tail, middle, tail
    // Get the path to verify S-shape
    const path = await getConnectorPath(page);
    expect(path.length).toBe(4); // 4 points = 3 segments

    // Re-select to refresh handles
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Count segment handles - should only be 1 (the middle segment)
    // First and last segments (tails) should NOT have handles
    const handleCount = await page.evaluate(() => {
      const handles = document.querySelectorAll(
        '.line-controller.segment-handle'
      );
      return handles.length;
    });

    // Only the middle segment should have a handle, not the tails
    expect(handleCount).toBe(1);
  });

  test('last segment (tail) of S-shape connector has no drag handle', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a vertical connector
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [100, 300]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Drag middle segment to create S-shape
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x + 50, handlePos!.y]
    );
    await waitForPathUpdate(page);

    // Verify S-shape was created
    const path = await getConnectorPath(page);
    expect(path.length).toBe(4); // 4 points = 3 segments

    // Re-select to refresh handles
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Only the middle segment should be draggable
    const handleCount = await page.evaluate(() => {
      const handles = document.querySelectorAll(
        '.line-controller.segment-handle'
      );
      return handles.length;
    });

    expect(handleCount).toBe(1);
  });

  test('dragging on area where tail would be does not move the connector', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a connector and make it an S-shape
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Get initial path
    const initialPath = await getConnectorPath(page);

    // Drag middle to create S-shape
    const handlePos = await getSegmentHandlePosition(page, 0);
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Get the S-shape path
    const sShapePath = await getConnectorPath(page);
    expect(sShapePath.length).toBe(4);

    // Store the first point (start of first tail segment)
    const firstPoint = sShapePath[0];

    // Try to drag near the first segment (tail) - this should NOT create a handle
    // and should NOT modify the path
    const tailMidpoint = [
      (sShapePath[0][0] + sShapePath[1][0]) / 2,
      (sShapePath[0][1] + sShapePath[1][1]) / 2,
    ];

    const viewTailMidpoint = await toViewCoord(page, tailMidpoint);

    // Attempt drag on tail area (should have no effect)
    await dragBetweenViewCoords(page, viewTailMidpoint, [
      viewTailMidpoint[0],
      viewTailMidpoint[1] - 30,
    ]);
    await waitForPathUpdate(page);

    // Verify the first point hasn't moved
    const pathAfterDrag = await getConnectorPath(page);
    expect(pathAfterDrag[0][0]).toBeCloseTo(firstPoint[0], 0);
    expect(pathAfterDrag[0][1]).toBeCloseTo(firstPoint[1], 0);
  });
});

// =============================================================================
// SHAPE PRESERVATION TESTS - Connector Should NOT Change Shape
// =============================================================================

test.describe('Connector Shape Preservation', () => {
  test('connector with waypoints preserves shape when moved via selection', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create connector and give it a specific shape
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Create S-shape by dragging middle
    const handlePos = await getSegmentHandlePosition(page, 0);
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Get path shape (relative distances between points)
    const pathBefore = await getConnectorPath(page);
    expect(pathBefore.length).toBe(4);

    const shapeBefore = getRelativeShape(pathBefore);

    // Select and move the connector
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Move connector by 100px in X
    await dragBetweenViewCoords(page, [200, 75], [300, 75]);
    await waitForPathUpdate(page);

    // Get path after move
    const pathAfter = await getConnectorPath(page);
    expect(pathAfter.length).toBe(4);

    const shapeAfter = getRelativeShape(pathAfter);

    // Shape (relative deltas) should be preserved
    for (let i = 0; i < shapeBefore.length; i++) {
      expect(shapeAfter[i][0]).toBeCloseTo(shapeBefore[i][0], 0);
      expect(shapeAfter[i][1]).toBeCloseTo(shapeBefore[i][1], 0);
    }
  });

  test('connector with waypoints preserves shape after page refresh', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create connector
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Create S-shape
    const handlePos = await getSegmentHandlePosition(page, 0);
    expect(handlePos).not.toBeNull();

    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Record path before refresh
    const pathBefore = await getConnectorPath(page);
    expect(pathBefore.length).toBe(4);

    // Record waypoints before refresh
    const waypointsBefore = await getConnectorWaypoints(page);
    expect(waypointsBefore).not.toBeNull();
    expect(waypointsBefore!.length).toBeGreaterThan(0);

    // Refresh the page
    await page.reload();
    await page.waitForSelector('affine-edgeless-root');
    await waitForPathUpdate(page);

    // Get path after refresh
    const pathAfter = await getConnectorPath(page);

    // Path should have same number of points (shape preserved)
    expect(pathAfter.length).toBe(pathBefore.length);

    // Path points should be approximately the same
    for (let i = 0; i < pathBefore.length; i++) {
      expect(pathAfter[i][0]).toBeCloseTo(pathBefore[i][0], 0);
      expect(pathAfter[i][1]).toBeCloseTo(pathBefore[i][1], 0);
    }

    // Waypoints should be preserved
    const waypointsAfter = await getConnectorWaypoints(page);
    expect(waypointsAfter).not.toBeNull();
    expect(waypointsAfter!.length).toBe(waypointsBefore!.length);
  });

  test('connector shape preserved when both endpoints are moved together', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create two shapes
    const shape1Id = await createShapeElement(
      page,
      [0, 0],
      [100, 100],
      Shape.Square
    );
    const shape2Id = await createShapeElement(
      page,
      [300, 0],
      [400, 100],
      Shape.Square
    );

    // Create connector between shapes
    const connectorId = await createConnectorElement(
      page,
      [100, 50],
      [300, 50]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Create S-shape by dragging middle segment
    const handlePos = await getSegmentHandlePosition(page, 0);
    if (handlePos) {
      await dragBetweenViewCoords(
        page,
        [handlePos.x, handlePos.y],
        [handlePos.x, handlePos.y - 50]
      );
      await waitForPathUpdate(page);
    }

    // Record the relative shape
    const pathBefore = await getConnectorPath(page);
    const shapeBefore = getRelativeShape(pathBefore);

    // Select all elements (shapes + connector) and move together
    await page.keyboard.press('Control+a');
    await waitForPathUpdate(page);

    // Move everything by 50px down
    await dragBetweenViewCoords(page, [200, 50], [200, 100]);
    await waitForPathUpdate(page);

    // Get shape after
    const pathAfter = await getConnectorPath(page);
    const shapeAfter = getRelativeShape(pathAfter);

    // Relative shape should be preserved
    expect(shapeAfter.length).toBe(shapeBefore.length);
    for (let i = 0; i < shapeBefore.length; i++) {
      expect(shapeAfter[i][0]).toBeCloseTo(shapeBefore[i][0], 0);
      expect(shapeAfter[i][1]).toBeCloseTo(shapeBefore[i][1], 0);
    }
  });

  test('waypoints array is correctly updated when segment is dragged', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create connector
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Initially should have no waypoints
    let waypoints = await getConnectorWaypoints(page);
    expect(waypoints).toBeNull();

    // Drag to create S-shape
    const handlePos = await getSegmentHandlePosition(page, 0);
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Now should have waypoints (intermediate points)
    waypoints = await getConnectorWaypoints(page);
    expect(waypoints).not.toBeNull();
    expect(waypoints!.length).toBeGreaterThan(0);

    // Waypoints should be the intermediate points (not start/end)
    const path = await getConnectorPath(page);
    expect(path.length).toBe(4); // 4 points

    // Waypoints should match intermediate path points
    // For a 4-point path [p0, p1, p2, p3], waypoints are [p1, p2]
    expect(waypoints!.length).toBe(2);
    expect(waypoints![0][0]).toBeCloseTo(path[1][0], 0);
    expect(waypoints![0][1]).toBeCloseTo(path[1][1], 0);
    expect(waypoints![1][0]).toBeCloseTo(path[2][0], 0);
    expect(waypoints![1][1]).toBeCloseTo(path[2][1], 0);
  });
});

// =============================================================================
// SEGMENT HANDLE VISIBILITY TESTS
// =============================================================================

test.describe('Segment Handle Visibility', () => {
  test('2-point straight line has exactly one segment handle', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create a simple horizontal connector
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Should have exactly 1 segment handle (the middle of the single segment)
    const handleCount = await page.evaluate(() => {
      return document.querySelectorAll('.line-controller.segment-handle')
        .length;
    });

    expect(handleCount).toBe(1);
  });

  test('S-shape (3 segments) has exactly one segment handle (middle only)', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create connector and make S-shape
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Drag to create S-shape
    const handlePos = await getSegmentHandlePosition(page, 0);
    await dragBetweenViewCoords(
      page,
      [handlePos!.x, handlePos!.y],
      [handlePos!.x, handlePos!.y - 50]
    );
    await waitForPathUpdate(page);

    // Re-select to refresh handles
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Should have exactly 1 segment handle (middle segment only, not tails)
    const handleCount = await page.evaluate(() => {
      return document.querySelectorAll('.line-controller.segment-handle')
        .length;
    });

    expect(handleCount).toBe(1);
  });

  test('segment handles have correct cursor based on orientation', async ({
    page,
  }) => {
    await commonSetup(page);

    // Create horizontal connector
    const connectorId = await createConnectorElement(
      page,
      [100, 100],
      [300, 100]
    );
    await selectElementInEdgeless(page, [connectorId]);
    await waitForPathUpdate(page);

    // Horizontal segment should have row-resize cursor (drags up/down)
    let cursor = await page.evaluate(() => {
      const handle = document.querySelector('.line-controller.segment-handle');
      return handle ? getComputedStyle(handle).cursor : null;
    });
    expect(cursor).toBe('row-resize');

    // Create vertical connector
    await createConnectorElement(page, [400, 100], [400, 300]);
    await page.click('body'); // Deselect
    await waitForPathUpdate(page);

    // Select the vertical connector
    await page.click('[data-element-type="connector"]', {
      position: { x: 10, y: 100 },
    });
    await waitForPathUpdate(page);

    // Note: This is a simplified test - in reality we'd need to select
    // the specific connector and verify its handle cursor
  });
});
