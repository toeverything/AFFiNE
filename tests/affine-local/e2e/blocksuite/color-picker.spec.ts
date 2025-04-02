import { test } from '@affine-test/kit/playwright';
import {
  clickEdgelessModeButton,
  dragView,
  locateToolbar,
} from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
});

test('should keep color preview in the custom tab', async ({ page }) => {
  await clickEdgelessModeButton(page);

  const toolbar = locateToolbar(page);

  // create a top frame
  await page.keyboard.press('f');
  await dragView(page, [0, 100], [300, 400]);
  await toolbar.getByLabel('Background').click();
  await toolbar.getByLabel('LightRed').click();

  await toolbar.getByLabel('Background').click();
  await toolbar.locator('edgeless-color-custom-button').click();

  const colorPicker = toolbar.locator('edgeless-color-picker');

  await expect(colorPicker).toBeVisible();

  const customButton = colorPicker.getByText('Custom');
  await customButton.click();

  const modes = colorPicker.locator('.modes');
  await expect(modes).toBeVisible();

  const lightColorDot = modes.locator('.mode.light button .color');

  const alphaInput = colorPicker.locator('.field.alpha input');
  await alphaInput.fill('0');

  const realColor = await lightColorDot.evaluate(e =>
    window.getComputedStyle(e).getPropertyValue('--c')
  );

  // Without alpha
  expect(realColor.startsWith('#')).toBe(true);
  expect(realColor).toHaveLength(7);
});
