import { test } from '@affine-test/kit/mobile';
import { expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  const docsTab = page.locator('#app-tabs').getByRole('tab', { name: 'all' });
  await expect(docsTab).toBeVisible();
  await docsTab.click();
  await page.getByTestId('doc-card').first().click();
  await expect(page.locator('.affine-edgeless-viewport')).toBeVisible();
});

test('can open page view more menu', async ({ page }) => {
  await page.click('[data-testid="detail-page-header-more-button"]');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('switch to page mode', async ({ page }) => {
  await page.click('[data-testid="detail-page-header-more-button"]');
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByRole('menuitem', { name: 'Default to Page mode' }).click();
  await expect(page.locator('.doc-title-container')).toBeVisible();
});

test('doc info', async ({ page }) => {
  await page.click('[data-testid="detail-page-header-more-button"]');
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByRole('menuitem', { name: 'view info' }).click();
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible();

  await expect(page.getByRole('dialog')).toContainText('Created');
  await expect(page.getByRole('dialog')).toContainText('Updated');
});
