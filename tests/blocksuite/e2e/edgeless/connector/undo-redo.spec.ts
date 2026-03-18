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
    await dragHandleToCreateWaypoints(page);
    const withWaypointHandles = await getHandleCount(page);
    expect(withWaypointHandles).toBeGreaterThan(initialHandles);

    await undoByKeyboard(page);
    await selectElementsByService(page, [connectorId]);
    const afterUndoHandles = await getHandleCount(page);
    expect(afterUndoHandles).toBe(initialHandles);

    await redoByKeyboard(page);
    await selectElementsByService(page, [connectorId]);
    const afterRedoHandles = await getHandleCount(page);
    expect(afterRedoHandles).toBe(withWaypointHandles);
  });
});
