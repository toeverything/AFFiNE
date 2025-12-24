import { test } from '@affine-test/kit/mobile';
import { expect, type Page } from '@playwright/test';

const openDocInfoModal = async (page: Page) => {
  await page.click('[data-testid="detail-page-header-more-button"]');
  await expect(page.getByRole('dialog')).toBeVisible();

  await page.getByRole('menuitem', { name: 'view info' }).click();
  await expect(page.getByTestId('mobile-menu-back-button')).toBeVisible();
};

test.beforeEach(async ({ page }) => {
  const docsTab = page.locator('#app-tabs').getByRole('tab', { name: 'all' });
  await expect(docsTab).toBeVisible();
  await docsTab.click();
  await page.getByTestId('doc-list-item').first().click();
  await expect(page.locator('.affine-page-viewport')).toBeVisible();
});

test('can open page view more menu', async ({ page }) => {
  await page.click('[data-testid="detail-page-header-more-button"]');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('switch to edgeless mode', async ({ page }) => {
  await page.click('[data-testid="detail-page-header-more-button"]');
  await expect(page.getByRole('dialog')).toBeVisible();

  await page
    .getByRole('menuitem', { name: 'Default to Edgeless mode' })
    .click();
  await expect(page.locator('.affine-edgeless-viewport')).toBeVisible();
});

test('can show doc info', async ({ page }) => {
  await openDocInfoModal(page);
  await expect(page.getByRole('dialog')).toContainText('Created');
  await expect(page.getByRole('dialog')).toContainText('Updated');
});

test('can add text property', async ({ page }) => {
  await openDocInfoModal(page);

  await expect(
    page.getByRole('button', { name: 'Add property' })
  ).toBeVisible();

  await page.getByRole('button', { name: 'Add property' }).click();
  await page.getByRole('menuitem', { name: 'Text' }).click();

  await expect(
    page.getByTestId('mobile-menu-back-button').last()
  ).toBeVisible();
  await page.getByTestId('mobile-menu-back-button').last().click();

  await expect(page.getByTestId('mobile-menu-back-button')).toBeVisible();
});
