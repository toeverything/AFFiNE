import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

test('should have page0', async ({ page }) => {
  await page.goto('http://localhost:8080/_debug/init-page');
  await page.waitForSelector('v-line');
  const pageId = await page.evaluate(async () => {
    // @ts-ignore
    return globalThis.page.id;
  });
  expect(pageId).toBe('page0');
});
