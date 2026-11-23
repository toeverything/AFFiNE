import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickView,
  dragView,
  locateEditorContainer,
  locateToolbar,
  setEdgelessTool,
  toViewCoord,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await clickEdgelessModeButton(page);
  const container = locateEditorContainer(page);
  await container.click();
});

test('should hide toolbar when creating connector', async ({ page }) => {
  await setEdgelessTool(page, 'shape');
  await dragView(page, [100, 300], [200, 400]);
  await clickView(page, [150, 350]);

  const toolbar = locateToolbar(page);

  await expect(toolbar).toBeVisible();

  const autoComplete = page.locator('edgeless-auto-complete');
  const rightArrowButton = autoComplete
    .locator('.edgeless-auto-complete-arrow')
    .nth(0);

  const bounds = await rightArrowButton.boundingBox();
  expect(bounds).not.toBeNull();

  const { x, y, width: w, height: h } = bounds!;
  const startPos = [x + w / 2, y + h / 2];
  const endPos = [startPos[0] + 100, startPos[1] + 100];

  await page.mouse.move(startPos[0], startPos[1]);
  await page.mouse.down();
  await page.mouse.move(endPos[0], endPos[1]);

  await expect(toolbar).toBeHidden();

  await page.mouse.up();

  const autoCompletePanel = page
    .locator('edgeless-auto-complete-panel')
    .locator('.auto-complete-panel-container');

  await expect(toolbar).toBeHidden();
  await expect(autoCompletePanel).toBeVisible();
});

test('should toggle toolbar when connecting target', async ({ page }) => {
  await setEdgelessTool(page, 'shape');
  // source
  await dragView(page, [100, 300], [200, 400]);

  // target
  await setEdgelessTool(page, 'shape');
  await dragView(page, [300, 300], [400, 400]);

  await clickView(page, [150, 350]);

  const toolbar = locateToolbar(page);

  await expect(toolbar).toBeVisible();

  const autoComplete = page.locator('edgeless-auto-complete');
  const rightArrowButton = autoComplete
    .locator('.edgeless-auto-complete-arrow')
    .nth(0);

  const bounds = await rightArrowButton.boundingBox();
  expect(bounds).not.toBeNull();

  const { x, y, width: w, height: h } = bounds!;
  const startPos = [x + w / 2, y + h / 2];
  const endPos = await toViewCoord(page, [300, 350]);

  await page.mouse.move(startPos[0], startPos[1]);
  await page.mouse.down();
  await page.mouse.move(endPos[0], endPos[1]);

  await expect(toolbar).toBeHidden();

  await page.mouse.up();

  await expect(toolbar).toBeVisible();
});
