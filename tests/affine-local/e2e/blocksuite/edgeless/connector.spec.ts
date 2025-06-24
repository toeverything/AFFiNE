import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  clickView,
  dblclickView,
  dragView,
  locateEditorContainer,
  locateToolbar,
  setEdgelessTool,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  switchEdgelessTheme,
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

test('should correct text color on toolbar', async ({ page }) => {
  await setEdgelessTool(page, 'connector');
  await dragView(page, [100, 300], [200, 400]);
  await dblclickView(page, [150, 350]);

  await expect(
    page.locator('edgeless-connector-label-editor rich-text')
  ).toBeVisible();
  await page.keyboard.type('label');
  await page.keyboard.press('Escape');

  const toolbar = locateToolbar(page);
  const textColorContainer = toolbar.locator(
    'edgeless-color-picker-button.text-color'
  );
  const textColorBtn = textColorContainer.getByLabel('Text color');
  const blackBtn = textColorContainer
    .locator('edgeless-color-button[active]')
    .getByLabel('Black');

  await expect(textColorContainer).toBeVisible();

  await textColorBtn.click();
  await expect(blackBtn).toHaveCount(1);

  const svgFillColor = await blackBtn.locator('svg').getAttribute('fill');
  expect(svgFillColor).toBe('#000000');

  await switchEdgelessTheme(page, 'dark');

  await clickView(page, [150, 350]);
  await textColorBtn.click();

  await expect(blackBtn).toHaveCount(1);

  const svgFillColor2 = await blackBtn.locator('svg').getAttribute('fill');
  expect(svgFillColor2).toBe('#ffffff');
});
