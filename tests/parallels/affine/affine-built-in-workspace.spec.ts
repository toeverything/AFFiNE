import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../../libs/load-page';
import { waitMarkdownImported } from '../../libs/page-logic';
import {
  clickNewPageButton,
  clickSideBarCurrentWorkspaceBanner,
} from '../../libs/sidebar';
import { getBuiltInUser, loginUser } from '../../libs/utils';

test('collaborative', async ({ page, browser }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  const [a, b] = await getBuiltInUser();
  await loginUser(page, a);
  await page.reload();
  await page.waitForTimeout(50);
  await clickSideBarCurrentWorkspaceBanner(page);
  await page.getByText('Cloud Workspace').click();
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await openHomePage(page2);
  await loginUser(page2, b);
  await page2.reload();
  await clickSideBarCurrentWorkspaceBanner(page2);
  await page2.getByText('Joined Workspace').click();
  await clickNewPageButton(page);
  const url = page.url();
  await page2.goto(url);
  await page.focus('.affine-default-page-block-title');
  await page.type('.affine-default-page-block-title', 'hello', {
    delay: 100,
  });
  await page.waitForTimeout(100);
  const title = (await page
    .locator('.affine-default-page-block-title')
    .textContent()) as string;
  expect(title.trim()).toBe('hello');
});
