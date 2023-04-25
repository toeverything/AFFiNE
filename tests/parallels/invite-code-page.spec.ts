import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

test('the link has expired', async ({ page }) => {
  await page.goto('http://localhost:8080//invite/abc');
  await page.waitForTimeout(1000);
  expect(page.getByText('The link has expired')).not.toBeUndefined();
});
