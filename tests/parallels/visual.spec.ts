import { expect } from '@playwright/test';

import { test } from '../libs/playwright';
import { clickSideBarSettingButton } from '../libs/sidebar';
import { openHomePage } from '../libs/utils';

test('visual test - home page', async ({ page }) => {
  await openHomePage(page);
  await page.waitForSelector('.affine-block-children-container');
  await expect(page).toHaveScreenshot('home-page.png');
});

test('visual test - setting page', async ({ page }) => {
  await openHomePage(page);
  await clickSideBarSettingButton(page);
  await expect(page).toHaveScreenshot('setting-page.png');
});
