import { expect } from '@playwright/test';

import {
  clickView,
  copyByKeyboard,
  createConnectorElement,
  createNote,
  createShapeElement,
  decreaseZoomLevel,
  edgelessCommonSetup as commonSetup,
  edgelessCommonSetup,
  getAllSortedIds,
  getFirstContainerId,
  moveView,
  pasteByKeyboard,
  pressEscape,
  selectAllByKeyboard,
  Shape,
  triggerComponentToolbarAction,
} from '../../utils/actions/index.js';
import {
  assertContainerChildCount,
  assertContainerIds,
} from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test.describe('clipboard', () => {
  test('copy and paste group', async ({ page }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [100, 0], [200, 100], Shape.Square);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');
    const originGroupId = await getFirstContainerId(page);

    await copyByKeyboard(page);
    await pressEscape(page);
    await clickView(page, [100, -50]);
    await pasteByKeyboard(page, false);
    const copyedGroupId = await getFirstContainerId(page, [originGroupId]);

    await assertContainerIds(page, {
      [originGroupId]: 2,
      [copyedGroupId]: 2,
      null: 2,
    });
    await assertContainerChildCount(page, originGroupId, 2);
    await assertContainerChildCount(page, copyedGroupId, 2);
  });

  test('copy and paste group with connector', async ({ page }) => {
    await edgelessCommonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [100, 0], [200, 100], Shape.Square);
    await createConnectorElement(page, [100, 50], [200, 50]);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');
    const originGroupId = await getFirstContainerId(page);

    await copyByKeyboard(page);
    await pressEscape(page);
    await clickView(page, [100, -50]);
    await pasteByKeyboard(page, false);
    const copyedGroupId = await getFirstContainerId(page, [originGroupId]);

    await assertContainerIds(page, {
      [originGroupId]: 3,
      [copyedGroupId]: 3,
      null: 2,
    });
    await assertContainerChildCount(page, originGroupId, 3);
    await assertContainerChildCount(page, copyedGroupId, 3);
  });
});

test.describe('group clipboard', () => {
  test('copy and paste group with shape and note inside', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createNote(page, [100, -100]);
    await pressEscape(page, 3);

    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');
    const originIds = await getAllSortedIds(page);
    expect(originIds.length).toBe(3);

    await copyByKeyboard(page);
    await pressEscape(page);
    await moveView(page, [250, 250]);
    await pasteByKeyboard(page, true);
    const sortedIds = await getAllSortedIds(page);
    expect(sortedIds.length).toBe(6);
  });

  test('copy and paste group with group inside', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');
    await pressEscape(page);

    await createNote(page, [100, -200]);
    await pressEscape(page, 3);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'createGroupOnMoreOption');

    const originIds = await getAllSortedIds(page);
    expect(originIds.length).toBe(5);

    await copyByKeyboard(page);
    await pressEscape(page);
    await moveView(page, [250, 250]);
    await pasteByKeyboard(page, true);
    const sortedIds = await getAllSortedIds(page);
    expect(sortedIds.length).toBe(10);
  });

  test('copy and paste group with frame inside', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createNote(page, [100, -100]);
    await pressEscape(page, 3);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addFrame');

    await decreaseZoomLevel(page);
    await createShapeElement(page, [700, 0], [800, 100], Shape.Square);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');

    const originIds = await getAllSortedIds(page);
    expect(originIds.length).toBe(5);

    await copyByKeyboard(page);
    await pressEscape(page);
    await moveView(page, [250, 250]);
    await pasteByKeyboard(page, true);
    const sortedIds = await getAllSortedIds(page);
    expect(sortedIds.length).toBe(10);
  });
});
