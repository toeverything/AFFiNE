import { expect } from '@playwright/test';

import { test } from '../libs/playwright';

test.describe('Debug page broadcast', () => {
  test('should broadcast a message to all debug pages', async ({ page }) => {
    await page.goto(
      'http://localhost:8080/_debug/init-page?type=importMarkdown'
    );
    await page.waitForSelector('rich-text');
    const pageId = await page.evaluate(async () => {
      // @ts-ignore
      return globalThis.page.id;
    });
    expect(pageId).toBe('page0');
  });
});
