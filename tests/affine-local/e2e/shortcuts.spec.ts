import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import { waitForEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('Open shortcuts modal', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await page.locator('[data-testid=help-island]').click();

  const shortcutsIcon = page.locator('[data-testid=shortcuts-icon]');
  await page.waitForTimeout(1000);
  expect(await shortcutsIcon.isVisible()).toEqual(true);

  await shortcutsIcon.click();
  await page.waitForTimeout(1000);
  const shortcutsModal = page.locator('[data-testid=shortcuts-modal]');
  await expect(shortcutsModal).toContainText('Page');
});
