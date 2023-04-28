import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage, webUrl } from '../libs/load-page';
import { waitMarkdownImported } from '../libs/page-logic';
import { clickSideBarAllPageButton } from '../libs/sidebar';

test('goto not found page', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  const currentUrl = page.url();
  const invalidUrl = currentUrl.replace(/\/$/, '') + '/invalid';
  await page.goto(invalidUrl);
  expect(await page.getByTestId('notFound').isVisible()).toBeTruthy();
});

test('goto not found workspace', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await clickSideBarAllPageButton(page);
  const currentUrl = page.url();
  await page.goto(new URL('/workspace/invalid/all', webUrl).toString());
  await clickSideBarAllPageButton(page);
  expect(page.url()).toEqual(currentUrl);
});
