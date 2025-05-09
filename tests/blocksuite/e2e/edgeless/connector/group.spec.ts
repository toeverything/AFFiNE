import type { Page } from '@playwright/test';

import {
  clickView,
  createShapeElement,
  dragBetweenViewCoords,
  edgelessCommonSetup as commonSetup,
  moveView,
  selectAllByKeyboard,
  Shape,
  triggerComponentToolbarAction,
  waitNextFrame,
} from '../../utils/actions/index.js';
import { assertConnectorPath } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test.describe('groups connections', () => {
  async function groupsSetup(page: Page) {
    await commonSetup(page);

    // group 1
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [100, 100], [200, 200], Shape.Square);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');

    // group 2
    await createShapeElement(page, [500, 0], [600, 100], Shape.Square);
    await createShapeElement(page, [600, 100], [700, 200], Shape.Square);
    await dragBetweenViewCoords(page, [550, -50], [650, 250]);
    await triggerComponentToolbarAction(page, 'addGroup');

    await waitNextFrame(page);
  }

  test('should connect to other groups', async ({ page }) => {
    await groupsSetup(page);

    // click button
    await triggerComponentToolbarAction(page, 'quickConnect');

    // move to group 1
    await moveView(page, [200, 50]);
    await waitNextFrame(page);

    await assertConnectorPath(page, [
      [500, 100],
      [200, 50],
    ]);
  });

  test('should connect to elements within other groups', async ({ page }) => {
    await groupsSetup(page);

    // click button
    await triggerComponentToolbarAction(page, 'quickConnect');

    // move to group 1
    await moveView(page, [200, 100]);
    await waitNextFrame(page);

    await assertConnectorPath(page, [
      [500, 100],
      [200, 100],
    ]);

    // move to elements within group 1
    await moveView(page, [190, 150]);
    await waitNextFrame(page);

    await assertConnectorPath(page, [
      [500, 100],
      [200, 150],
    ]);
  });

  test('elements within groups should connect to other groups', async ({
    page,
  }) => {
    await groupsSetup(page);

    // click elements within group 1
    await clickView(page, [40, 40]);
    await clickView(page, [60, 60]);

    // click button
    await triggerComponentToolbarAction(page, 'quickConnect');

    // move to elements within group 2
    await moveView(page, [610, 50]);
    await waitNextFrame(page);

    await assertConnectorPath(page, [
      [100, 50],
      [600, 50],
    ]);

    // move to group 2
    await moveView(page, [600, 100]);
    await waitNextFrame(page);

    await assertConnectorPath(page, [
      [100, 50],
      [600, 100],
    ]);
  });
});
