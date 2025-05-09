import { expect } from '@playwright/test';

import * as actions from '../../utils/actions/edgeless.js';
import {
  addBasicConnectorElement,
  createConnectorElement,
  createShapeElement,
  dragBetweenCoords,
  enterPlaygroundRoom,
  initEmptyEdgelessState,
  Shape,
  switchEditorMode,
  toModelCoord,
  waitNextFrame,
} from '../../utils/actions/index.js';
import { test } from '../../utils/playwright.js';

test.describe('select multiple connectors', () => {
  test('should show single selection rect', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await actions.zoomResetByKeyboard(page);

    await addBasicConnectorElement(
      page,
      { x: 100, y: 200 },
      { x: 300, y: 200 }
    );
    await addBasicConnectorElement(
      page,
      { x: 100, y: 230 },
      { x: 300, y: 230 }
    );
    await addBasicConnectorElement(
      page,
      { x: 100, y: 260 },
      { x: 300, y: 260 }
    );

    await dragBetweenCoords(page, { x: 50, y: 50 }, { x: 400, y: 290 });
    await waitNextFrame(page);

    expect(
      await page
        .locator('.affine-edgeless-selected-rect')
        .locator('.element-handle')
        .count()
    ).toBe(0);
  });

  test('should disable resize when a connector is already connected', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await actions.zoomResetByKeyboard(page);

    const start = await toModelCoord(page, [100, 0]);
    const end = await toModelCoord(page, [200, 100]);
    await createShapeElement(page, start, end, Shape.Diamond);
    const c1 = await toModelCoord(page, [200, 50]);
    const c2 = await toModelCoord(page, [450, 50]);
    await createConnectorElement(page, c1, c2);

    await addBasicConnectorElement(
      page,
      { x: 250, y: 200 },
      { x: 450, y: 200 }
    );
    await addBasicConnectorElement(
      page,
      { x: 250, y: 230 },
      { x: 450, y: 230 }
    );
    await addBasicConnectorElement(
      page,
      { x: 250, y: 260 },
      { x: 450, y: 260 }
    );

    await dragBetweenCoords(page, { x: 500, y: 20 }, { x: 400, y: 290 });
    await waitNextFrame(page);

    const selectedRectLocalor = page.locator('.affine-edgeless-selected-rect');
    expect(await selectedRectLocalor.locator('.element-handle').count()).toBe(
      0
    );
    expect(
      await selectedRectLocalor.locator('.handle').locator('.resize').count()
    ).toBe(0);
  });
});
