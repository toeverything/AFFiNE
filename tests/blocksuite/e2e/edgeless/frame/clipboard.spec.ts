import type { Page } from '@playwright/test';

import { clickView, moveView } from '../../utils/actions/click.js';
import {
  autoFit,
  createFrame as _createFrame,
  createShapeElement,
  deleteAll,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  getAllSortedIds,
  getFirstContainerId,
  getIds,
  Shape,
  shiftClickView,
  triggerComponentToolbarAction,
  zoomResetByKeyboard,
} from '../../utils/actions/edgeless.js';
import {
  copyByKeyboard,
  pasteByKeyboard,
  pressBackspace,
  pressEscape,
} from '../../utils/actions/keyboard.js';
import { assertContainerOfElements } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

const createFrame = async (
  page: Page,
  coord1: [number, number],
  coord2: [number, number]
) => {
  await _createFrame(page, coord1, coord2);
  await autoFit(page);
};

test.beforeEach(async ({ page }) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);
});

test.describe('frame copy and paste', () => {
  test('copy of frame should keep relationship of child elements', async ({
    page,
  }) => {
    await createFrame(page, [50, 50], [450, 450]);
    await createShapeElement(page, [200, 200], [300, 300], Shape.Square);

    const frameTitle = page.locator('affine-frame-title');

    await pressEscape(page);
    await frameTitle.click();
    await copyByKeyboard(page);
    await deleteAll(page);
    await moveView(page, [500, 500]); // center copy
    await pasteByKeyboard(page);

    const frameId = await getFirstContainerId(page);
    const shapeId = (await getAllSortedIds(page)).filter(id => id !== frameId);
    await assertContainerOfElements(page, shapeId, frameId);
  });

  test('copy of frame by alt/option dragging should keep relationship of child elements', async ({
    page,
  }) => {
    await createFrame(page, [50, 50], [450, 450]);
    await createShapeElement(page, [200, 200], [300, 300], Shape.Square);
    await createShapeElement(page, [250, 250], [350, 350], Shape.Square);
    await createShapeElement(page, [300, 300], [400, 400], Shape.Square);
    await pressEscape(page);

    const frameTitles = page.locator('affine-frame-title');

    await shiftClickView(page, [260, 260]);
    await shiftClickView(page, [310, 310]);
    await triggerComponentToolbarAction(page, 'addGroup');
    await pressEscape(page);

    await frameTitles.nth(0).click();
    await page.keyboard.down('Alt');
    await dragBetweenViewCoords(page, [60, 60], [460, 460]);
    await page.keyboard.up('Alt');
    await pressEscape(page);

    await frameTitles.nth(0).click({ modifiers: ['Shift'] });
    await shiftClickView(page, [250, 250]);
    await shiftClickView(page, [350, 350]);
    await pressBackspace(page); // remove original elements

    const frameId = await getFirstContainerId(page);
    const groupId = await getFirstContainerId(page, [frameId]);
    const shapeIds = (await getIds(page)).filter(
      id => ![frameId, groupId].includes(id)
    );

    await assertContainerOfElements(page, [groupId], frameId);
    await assertContainerOfElements(page, [shapeIds[0]], frameId);
    await assertContainerOfElements(page, [shapeIds[1]], groupId);
    await assertContainerOfElements(page, [shapeIds[2]], groupId);
  });

  test('duplicate element in frame', async ({ page }) => {
    await createFrame(page, [50, 50], [450, 450]);
    await createShapeElement(page, [100, 100], [200, 200], Shape.Square);
    await pressEscape(page);

    const frameTitles = page.locator('affine-frame-title');

    await frameTitles.nth(0).click();

    const moreMenu = page.getByLabel('More menu');

    await moreMenu.click();
    await moreMenu
      .locator('editor-menu-action', { hasText: 'Duplicate' })
      .click();
    await pressEscape(page);

    await frameTitles.nth(0).click();
    await shiftClickView(page, [150, 150]);
    await pressBackspace(page); // remove original elements

    const frameId = await getFirstContainerId(page);
    const shapeIds = (await getIds(page)).filter(id => id !== frameId);
    await assertContainerOfElements(page, shapeIds, frameId);
  });

  test('copy of element by alt/option dragging in frame should belong to frame', async ({
    page,
  }) => {
    await createFrame(page, [50, 50], [450, 450]);
    await createShapeElement(page, [100, 100], [200, 200], Shape.Square);
    await pressEscape(page);

    await clickView(page, [150, 150]);
    await page.keyboard.down('Alt');
    await dragBetweenViewCoords(page, [150, 150], [250, 250]);
    await page.keyboard.up('Alt');

    const frameId = await getFirstContainerId(page);
    const shapeIds = (await getIds(page)).filter(id => id !== frameId);
    await assertContainerOfElements(page, shapeIds, frameId);
  });

  test('copy of element by alt/option dragging out of frame should not belong to frame', async ({
    page,
  }) => {
    await createFrame(page, [50, 50], [450, 450]);
    await createShapeElement(page, [100, 100], [200, 200], Shape.Square);
    await pressEscape(page);

    await clickView(page, [150, 150]);
    await page.keyboard.down('Alt');
    await dragBetweenViewCoords(page, [150, 150], [550, 550]);
    await page.keyboard.up('Alt');

    const frameId = await getFirstContainerId(page);
    const shapeIds = (await getIds(page)).filter(id => id !== frameId);
    await assertContainerOfElements(page, [shapeIds[0]], frameId);
    await assertContainerOfElements(page, [shapeIds[1]], null);
  });
});
