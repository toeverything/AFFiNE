import { expect, type Page } from '@playwright/test';

import {
  createShapeElement,
  dblclickView,
  edgelessCommonSetup,
  getSelectedBound,
  pressEnter,
  selectAllByKeyboard,
  Shape,
  triggerComponentToolbarAction,
  type,
} from '../../utils/actions/index.js';
import { assertEdgelessCanvasText } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

async function init(page: Page) {
  await edgelessCommonSetup(page);
  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [100, 0], [200, 100], Shape.Square);
}

test.describe('group title', () => {
  test.beforeEach(async ({ page }) => {
    await init(page);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');
  });

  test('edit group title by component toolbar', async ({ page }) => {
    expect(await page.locator('edgeless-group-title-editor').count()).toBe(0);

    await triggerComponentToolbarAction(page, 'renameGroup');
    await page.locator('edgeless-group-title-editor').waitFor({
      state: 'attached',
    });
  });

  test('edit group title by dbclick', async ({ page }) => {
    expect(await page.locator('edgeless-group-title-editor').count()).toBe(0);

    const bound = await getSelectedBound(page);
    await dblclickView(page, [bound[0] + 10, bound[1] - 10]);
    await page.locator('edgeless-group-title-editor').waitFor({
      state: 'attached',
    });
    await type(page, 'ABC');
    await assertEdgelessCanvasText(page, 'ABC');
  });

  test('blur unmount group editor', async ({ page }) => {
    const bound = await getSelectedBound(page);
    await dblclickView(page, [bound[0] + 10, bound[1] - 10]);

    await page.locator('edgeless-group-title-editor').waitFor({
      state: 'attached',
    });
    await page.mouse.click(10, 10);
    expect(await page.locator('edgeless-group-title-editor').count()).toBe(0);
  });

  test('enter unmount group editor', async ({ page }) => {
    const bound = await getSelectedBound(page);
    await dblclickView(page, [bound[0] + 10, bound[1] - 10]);

    await page.locator('edgeless-group-title-editor').waitFor({
      state: 'attached',
    });
    await pressEnter(page);
    expect(await page.locator('edgeless-group-title-editor').count()).toBe(0);
  });
});
