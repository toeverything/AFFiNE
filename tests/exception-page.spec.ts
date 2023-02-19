import { expect } from '@playwright/test';

import { loadPage } from './libs/load-page';
import { test } from './libs/playwright';

loadPage();

// ps aux | grep 8080
test.describe('exception page', () => {
  test('visit 404 page', async ({ page }) => {
    await page.goto('http://localhost:8080/404');
    const notFoundTip = page.locator('[data-testid=notFound]');
    await expect(notFoundTip).toBeVisible();
  });
});
