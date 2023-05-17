import { expect, test } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  getBlockSuiteEditorTitle,
  newPage,
  waitMarkdownImported,
} from '../libs/page-logic';

test('image preview should be shown', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  const title = await getBlockSuiteEditorTitle(page);
  await title.click();
  await page.keyboard.press('Enter');
  await page.evaluate(() => {
    const clipData = {
      'text/html': `<img src="http://localhost:8081/large-image.png" />`,
    };
    const e = new ClipboardEvent('paste', {
      clipboardData: new DataTransfer(),
    });
    Object.defineProperty(e, 'target', {
      writable: false,
      value: document.body,
    });
    Object.entries(clipData).forEach(([key, value]) => {
      e.clipboardData?.setData(key, value);
    });
    document.body.dispatchEvent(e);
  });
  await page.waitForTimeout(500);
  await page.locator('img').first().dblclick();
  const locator = page.getByTestId('image-preview-modal');
  expect(locator.isVisible()).toBeTruthy();
  await page
    .getByTestId('image-preview-modal')
    .locator('button')
    .first()
    .click();
  await page.waitForTimeout(500);
  expect(await locator.isVisible()).toBeFalsy();
});
