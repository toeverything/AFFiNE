import { test } from '@playwright/test';

export function loadPage() {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8080');
    // waiting for page loading end
    await page.waitForSelector('#__next');
  });
}
