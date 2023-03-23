import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import { test } from '../libs/playwright';

test.describe('Shortcuts Modal', () => {
  test('Open shortcuts modal', async ({ page }) => {
    await openHomePage(page);
    await page.locator('[data-testid=help-island]').click();

    const shortcutsIcon = page.locator('[data-testid=shortcuts-icon]');
    await page.waitForTimeout(1000);
    expect(await shortcutsIcon.isVisible()).toEqual(true);

    await shortcutsIcon.click();
    await page.waitForTimeout(1000);
    const shortcutsModal = page.locator('[data-testid=shortcuts-modal]');
    await expect(shortcutsModal).toContainText('Keyboard Shortcuts');
  });
});
