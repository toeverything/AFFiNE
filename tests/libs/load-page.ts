import { test } from '@playwright/test';

export function loadPage() {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:3000');
    // waiting for page loading end
    await page.waitForTimeout(1000);
  });
}
