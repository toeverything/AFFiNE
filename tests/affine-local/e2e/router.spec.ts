import { test } from '@affine-test/kit/playwright';
import { coreUrl, openHomePage } from '@affine-test/kit/utils/load-page';
import { waitEditorLoad } from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('goto not found page', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  const currentUrl = page.url();
  const invalidUrl = currentUrl.replace('hello-world', 'invalid');
  await page.goto(invalidUrl);
  await expect(page.getByTestId('notFound')).toBeVisible();
});

test('goto not found workspace', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  // if doesn't wait for timeout, data won't be saved into indexedDB
  await page.waitForTimeout(1000);
  await page.goto(new URL('/workspace/invalid/all', coreUrl).toString());
  await page.waitForTimeout(1000);
  expect(page.url()).toBe(new URL('/404', coreUrl).toString());
});
