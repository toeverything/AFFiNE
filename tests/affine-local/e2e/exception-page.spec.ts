import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

test('visit 404 page', async ({ page }) => {
  await page.goto('http://localhost:8080/404');
  const notFoundTip = page.getByTestId('not-found');
  await expect(notFoundTip).toBeVisible();
});
