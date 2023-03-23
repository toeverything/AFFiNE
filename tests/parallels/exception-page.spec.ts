import { expect } from '@playwright/test';

import { test } from '../libs/playwright';

test.describe('exception page', () => {
  test('visit 404 page', async ({ page }) => {
    await page.goto('http://localhost:8080/404');
    const notFoundTip = page.locator('[data-testid=notFound]');
    await expect(notFoundTip).toBeVisible();
  });
});
