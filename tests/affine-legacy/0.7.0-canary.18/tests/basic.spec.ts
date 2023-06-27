import { test } from '@playwright/test';

test('init page', async ({ page }) => {
  await page.goto('http://localhost:8081/');
  await page.waitForSelector('v-line');
});
