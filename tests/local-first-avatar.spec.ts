import { expect } from '@playwright/test';

import { loadPage } from './libs/load-page';
import { newPage } from './libs/page-logic';
import { test } from './libs/playwright';

loadPage();

test.describe('Local first create page', () => {
  test('should create a page with a local first avatar', async ({ page }) => {
    await newPage(page);
    await page.getByTestId('workspace-name').click();
    await page.getByTestId('new-workspace').click({ delay: 50 });
    await page
      .getByTestId('create-workspace-input')
      .type('Test Workspace 1', { delay: 50 });
    await page.getByTestId('create-workspace-button').click();
    await page.getByTestId('workspace-name').click();
    await page.getByTestId('workspace-card').nth(1).click();
    await page.getByText('Workspace Setting').click();
    await page
      .getByTestId('upload-avatar')
      .setInputFiles('./tests/fixtures/smile.png');
    await page.getByTestId('workspace-name').click();
    await page.getByTestId('workspace-card').nth(0).click();
    await page.waitForTimeout(1000);
    const text = await page.getByTestId('workspace-avatar').textContent();
    // default avatar for default workspace
    expect(text).toBe('U');
    await page.getByTestId('workspace-name').click();
    await page.getByTestId('workspace-card').nth(1).click();
    const blobUrl = await page
      .getByTestId('workspace-avatar')
      .locator('img')
      .getAttribute('src');
    // out user uploaded avatar
    expect(blobUrl).toContain('blob:');
  });
});
