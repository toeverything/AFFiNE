import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

// ps aux | grep 8080
test.describe('exception page', () => {
  test('visit 404 page', async ({ page }) => {
    await page.goto('http://localhost:8080/404');
    await page.waitForTimeout(1000);
    const notFoundTipDom = await page.getByText('404 - Page Not Found');

    await expect(await notFoundTipDom.isVisible()).toBe(true);
  });
});
