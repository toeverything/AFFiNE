import { test } from '@affine-test/kit/playwright';
import { openPrototypeProviderStatusPage } from '@affine-test/kit/utils/load-page';
import { expect } from '@playwright/test';

test('syncing and synced status should works', async ({ page }) => {
  await openPrototypeProviderStatusPage(page);
  await expect(page.getByTestId('status')).toHaveText('synced');
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('status')).toHaveText('syncing');
  await page.getByTestId('stop-button').click();
  await expect(page.getByTestId('status')).toHaveText('synced');
});
