import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import { test } from '../../libs/playwright';

async function openStorybook(page: Page, storyName?: string) {
  return page.goto(`http://localhost:6006`);
}

test.describe('storybook - Button', () => {
  test('Basic', async ({ page }) => {
    await openStorybook(page);
    await page.click('#storybook-explorer-tree >> #affine-button');
    await page.click('#affine-button--test');

    const iframe = page.frameLocator('iframe');
    await iframe
      .locator('input[data-testid="test-input"]')
      .type('Hello World!');

    expect(
      await iframe.locator('input[data-testid="test-input"]').inputValue()
    ).toBe('Hello World!');
    await iframe.locator('[data-testid="clear-button"]').click();
    expect(
      await iframe.locator('input[data-testid="test-input"]').textContent()
    ).toBe('');
  });
});
