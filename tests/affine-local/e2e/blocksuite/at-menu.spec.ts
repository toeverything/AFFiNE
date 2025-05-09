import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEditorLoad(page);
});

test('at menu should not be close when press arrow key', async ({ page }) => {
  await page.keyboard.press('Enter');
  await type(page, '@');

  const atMenu = page.locator('.linked-doc-popover');
  await expect(atMenu).toBeVisible();

  await page.keyboard.press('ArrowRight');
  await expect(atMenu).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(atMenu).toBeVisible();
});
