import { expect } from '@playwright/test';

import {
  createConnectorElement,
  edgelessCommonSetup,
  selectElementsByService,
  setEdgelessTool,
} from '../../utils/actions/edgeless.js';
import {
  redoByKeyboard,
  undoByKeyboard,
} from '../../utils/actions/keyboard.js';
import { test } from '../../utils/playwright.js';

async function dragHandleToCreateWaypoints(
  page: Parameters<typeof test>[0]['page']
) {
  const handle = page.locator('.segment-handle').first();
  const box = await handle.boundingBox();
  if (!box) throw new Error('segment handle not found');
  const startX = box.x + box.width / 2;
  const startY = box.y + box.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY - 60, { steps: 10 });
  await page.mouse.up();
}

async function getHandleCount(page: Parameters<typeof test>[0]['page']) {
  return page.locator('.segment-handle').count();
}

async function getConnectorState(
  page: Parameters<typeof test>[0]['page'],
  id: string
) {
  return page.evaluate(connectorId => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const model = root.service.crud.getElementById(connectorId);
    if (!model) throw new Error('connector not found');
    return {
      pathLength: model.path?.length ?? 0,
      waypointsLength: model.waypoints?.length ?? 0,
    };
  }, id);
}

test.describe('connector undo/redo', () => {
  test('segment handles update after undo and redo', async ({ page }) => {
    await edgelessCommonSetup(page);
    await setEdgelessTool(page, 'connector');

    const connectorId = await createConnectorElement(
      page,
      [120, 200],
      [360, 200]
    );
    await selectElementsByService(page, [connectorId]);

    const initialHandles = await getHandleCount(page);
    const initialState = await getConnectorState(page, connectorId);
    await dragHandleToCreateWaypoints(page);
    const withWaypointHandles = await getHandleCount(page);
    expect(withWaypointHandles).toBeGreaterThan(initialHandles);
    const withWaypointState = await getConnectorState(page, connectorId);
    expect(withWaypointState.waypointsLength).toBeGreaterThan(0);
    expect(withWaypointState.pathLength).toBeGreaterThan(
      initialState.pathLength
    );

    await undoByKeyboard(page);
    await selectElementsByService(page, [connectorId]);
    const afterUndoState = await getConnectorState(page, connectorId);
    expect(afterUndoState.waypointsLength).toBe(0);
    expect(afterUndoState.pathLength).toBe(initialState.pathLength);

    await redoByKeyboard(page);
    await selectElementsByService(page, [connectorId]);
    const afterRedoState = await getConnectorState(page, connectorId);
    expect(afterRedoState.waypointsLength).toBeGreaterThan(0);
    expect(afterRedoState.pathLength).toBeGreaterThan(initialState.pathLength);
  });
});
