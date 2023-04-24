import { expect } from '@playwright/test';

import { test } from '../libs/playwright';

test('should have page0', async ({ page }) => {
  await page.goto('http://localhost:8080/_debug/init-page?type=importMarkdown');
  await page.waitForSelector('v-line');
  const pageId = await page.evaluate(async () => {
    // @ts-ignore
    return globalThis.page.id;
  });
  expect(pageId).toBe('page0');
});
