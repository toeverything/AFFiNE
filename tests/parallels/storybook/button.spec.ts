import { expect, Page } from '@playwright/test';

import { test } from '../../libs/playwright';

async function openStorybook(page: Page, storyName?: string) {
  return page.goto(`http://localhost:6006/?path=/story/${storyName}`);
}

test.describe('Button', () => {
  test('Basic', async ({ page }) => {
    await openStorybook(page, 'affine-button--test');
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
