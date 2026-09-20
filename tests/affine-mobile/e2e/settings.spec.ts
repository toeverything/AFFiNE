import { test } from '@affine-test/kit/mobile';
import { expect, type Page } from '@playwright/test';

const openSettings = async (page: Page) => {
  await page.getByTestId('settings-button').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.locator('header:has-text("Settings")')).toBeVisible();
};

test('can open settings', async ({ page }) => {
  await openSettings(page);
  await expect(page.getByText('Devices', { exact: true })).toHaveCount(0);
});

test('can change theme', async ({ page }) => {
  await openSettings(page);
  const select = page
    .getByTestId('setting-row')
    .filter({
      hasText: 'Color mode',
    })
    .getByTestId('native-dropdown-select-trigger');

  await select.selectOption('light');
  await select.selectOption('dark');

  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
