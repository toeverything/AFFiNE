import { expect, type Page } from '@playwright/test';

import { clickView } from '../../utils/actions/click.js';
import {
  createShapeElement,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  getFirstContainerId,
  locatorComponentToolbar,
  Shape,
  shiftClickView,
  triggerComponentToolbarAction,
} from '../../utils/actions/edgeless.js';
import {
  pressBackspace,
  redoByKeyboard,
  selectAllByKeyboard,
  SHORT_KEY,
  undoByKeyboard,
} from '../../utils/actions/keyboard.js';
import { captureHistory } from '../../utils/actions/misc.js';
import {
  assertCanvasElementsCount,
  assertContainerChildCount,
  assertContainerIds,
  assertEdgelessNonSelectedRect,
  assertSelectedBound,
} from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

export const GROUP_ROOT_ID = 'GROUP_ROOT';

test.describe('group', () => {
  async function init(page: Page) {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [100, 0], [200, 100], Shape.Square);
  }

  test.describe('group create', () => {
    test.beforeEach(async ({ page }) => {
      await init(page);
    });

    test('create group button not show when single select', async ({
      page,
    }) => {
      await clickView(page, [50, 50]);
      const toolbar = locatorComponentToolbar(page);
      await expect(toolbar).toBeVisible();
      await expect(toolbar.getByLabel(/^Group$/)).not.toBeVisible();
    });

    test('create button show up when multi select', async ({ page }) => {
      await selectAllByKeyboard(page);
      const toolbar = locatorComponentToolbar(page);
      await expect(toolbar).toBeVisible();
      await expect(toolbar.getByLabel(/^Group$/)).toBeVisible();
    });

    test('create group by component toolbar', async ({ page }) => {
      await selectAllByKeyboard(page);
      await triggerComponentToolbarAction(page, 'addGroup');
      await assertSelectedBound(page, [0, 0, 200, 100]);
    });

    test('create group by shortcut mod + G', async ({ page }) => {
      await selectAllByKeyboard(page);
      await page.keyboard.press(`${SHORT_KEY}+g`);
      await assertSelectedBound(page, [0, 0, 200, 100]);
    });

    test('create group and undo, redo', async ({ page }) => {
      await selectAllByKeyboard(page);
      await captureHistory(page);
      await page.keyboard.press(`${SHORT_KEY}+g`);
      await assertSelectedBound(page, [0, 0, 200, 100]);
      await undoByKeyboard(page);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await redoByKeyboard(page);
      await assertSelectedBound(page, [0, 0, 200, 100]);
    });
  });

  test.describe('ungroup', () => {
    test.beforeEach(async ({ page }) => {
      await init(page);
    });

    test('ungroup by component toolbar', async ({ page }) => {
      await selectAllByKeyboard(page);
      await triggerComponentToolbarAction(page, 'addGroup');
      await assertSelectedBound(page, [0, 0, 200, 100]);
      await triggerComponentToolbarAction(page, 'ungroup');
      await assertEdgelessNonSelectedRect(page);
    });

    test('ungroup by shortcut mod + shift + G', async ({ page }) => {
      await selectAllByKeyboard(page);
      await triggerComponentToolbarAction(page, 'addGroup');
      await assertSelectedBound(page, [0, 0, 200, 100]);
      await page.keyboard.press(`${SHORT_KEY}+Shift+g`);
      await assertEdgelessNonSelectedRect(page);
    });

    test('ungroup and undo, redo', async ({ page }) => {
      await selectAllByKeyboard(page);
      await triggerComponentToolbarAction(page, 'addGroup');
      await assertSelectedBound(page, [0, 0, 200, 100]);
      await captureHistory(page);
      await page.keyboard.press(`${SHORT_KEY}+Shift+g`);
      await assertEdgelessNonSelectedRect(page);
      await undoByKeyboard(page);
      await assertSelectedBound(page, [0, 0, 200, 100]);
      await redoByKeyboard(page);
      await assertEdgelessNonSelectedRect(page);
    });
  });

  test.describe('drag group', () => {
    test.beforeEach(async ({ page }) => {
      await init(page);
    });

    test('drag group to move', async ({ page }) => {
      await selectAllByKeyboard(page);
      await triggerComponentToolbarAction(page, 'addGroup');
      await dragBetweenViewCoords(page, [100, 50], [110, 50]);
      await assertSelectedBound(page, [10, 0, 200, 100]);
    });
  });

  test.describe('select', () => {
    test.beforeEach(async ({ page }) => {
      await init(page);
      await selectAllByKeyboard(page);
      await triggerComponentToolbarAction(page, 'addGroup');
    });

    test('select group by click', async ({ page }) => {
      await clickView(page, [300, -100]);
      await assertEdgelessNonSelectedRect(page);
      await clickView(page, [50, 50]);
      await assertSelectedBound(page, [0, 0, 200, 100]);
    });

    test('select sub-element by first select group', async ({ page }) => {
      await clickView(page, [50, 50]);
      await assertSelectedBound(page, [0, 0, 100, 100]);
    });

    test('select element when enter gorup', async ({ page }) => {
      await clickView(page, [50, 50]);
      await assertSelectedBound(page, [0, 0, 100, 100]);
      await clickView(page, [150, 50]);
      await assertSelectedBound(page, [100, 0, 100, 100]);
    });
  });

  test.describe('delete', () => {
    test.beforeEach(async ({ page }) => {
      await init(page);
    });

    test('delete root group', async ({ page }) => {
      await selectAllByKeyboard(page);
      await triggerComponentToolbarAction(page, 'addGroup');
      const groupId = await getFirstContainerId(page);
      await captureHistory(page);
      await pressBackspace(page);
      await assertCanvasElementsCount(page, 0);

      // undo the delete
      await undoByKeyboard(page);
      await assertCanvasElementsCount(page, 3);
      await assertContainerIds(page, {
        [groupId]: 2,
        null: 1,
      });
      await assertContainerChildCount(page, groupId, 2);

      // redo the delete
      await redoByKeyboard(page);
      await assertCanvasElementsCount(page, 0);
    });

    test('delete sub-element in group', async ({ page }) => {
      await selectAllByKeyboard(page);
      await triggerComponentToolbarAction(page, 'addGroup');
      const groupId = await getFirstContainerId(page);
      await captureHistory(page);
      await clickView(page, [50, 50]);
      await pressBackspace(page);

      await assertCanvasElementsCount(page, 2);
      await assertContainerIds(page, {
        [groupId]: 1,
        null: 1,
      });
      await assertContainerChildCount(page, groupId, 1);

      // undo the delete
      await undoByKeyboard(page);
      await assertCanvasElementsCount(page, 3);
      await assertContainerIds(page, {
        [groupId]: 2,
        null: 1,
      });
      await assertContainerChildCount(page, groupId, 2);

      // redo the delete
      await redoByKeyboard(page);
      await assertCanvasElementsCount(page, 2);
      await assertContainerIds(page, {
        [groupId]: 1,
        null: 1,
      });
      await assertContainerChildCount(page, groupId, 1);
    });

    test('delete group in group', async ({ page }) => {
      await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
      await selectAllByKeyboard(page);
      await triggerComponentToolbarAction(page, 'addGroup');
      const firstGroup = await getFirstContainerId(page);
      await clickView(page, [50, 50]);
      await shiftClickView(page, [150, 50]);
      await triggerComponentToolbarAction(page, 'addGroup');
      const secondGroup = await getFirstContainerId(page, [firstGroup]);
      await captureHistory(page);

      // delete group in group
      await pressBackspace(page);
      await assertCanvasElementsCount(page, 2);
      await assertContainerIds(page, {
        [firstGroup]: 1,
        null: 1,
      });
      await assertContainerChildCount(page, firstGroup, 1);

      // undo the delete
      await undoByKeyboard(page);
      await assertCanvasElementsCount(page, 5);
      await assertContainerIds(page, {
        [firstGroup]: 2,
        [secondGroup]: 2,
        null: 1,
      });
      await assertContainerChildCount(page, firstGroup, 2);
      await assertContainerChildCount(page, secondGroup, 2);

      // redo the delete
      await redoByKeyboard(page);
      await assertCanvasElementsCount(page, 2);
      await assertContainerIds(page, {
        [firstGroup]: 1,
        null: 1,
      });
      await assertContainerChildCount(page, firstGroup, 1);
    });
  });
});
