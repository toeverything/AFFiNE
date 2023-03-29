import { expect } from '@playwright/test';

import { waitMarkdownImported } from '../../libs/page-logic';
import { test } from '../../libs/playwright';
import {
  clickNewPageButton,
  clickSideBarCurrentWorkspaceBanner,
} from '../../libs/sidebar';
import { getBuiltInUser, loginUser, openHomePage } from '../../libs/utils';

test.describe('affine built in workspace', () => {
  test('collaborative', async ({ page, context }) => {
    await openHomePage(page);
    await waitMarkdownImported(page);
    const [a, b] = await getBuiltInUser();
    await loginUser(page, a);
    await page.reload();
    await page.waitForTimeout(50);
    await clickSideBarCurrentWorkspaceBanner(page);
    await page.getByText('Cloud Workspace').click();
    const page2 = await context.newPage();
    await openHomePage(page2);
    await waitMarkdownImported(page2);
    await loginUser(page2, b);
    await page2.reload();
    await clickSideBarCurrentWorkspaceBanner(page2);
    await page2.getByText('Joined Workspace').click();
    await clickNewPageButton(page);
    const url = page.url();
    await page2.goto(url);
    await page.type('.affine-default-page-block-title-container', 'hello', {
      delay: 50,
    });
    await page.waitForTimeout(100);
    const title = await page
      .locator('.affine-default-page-block-title-container')
      .textContent();
    expect(title.trim()).toBe('hello');
  });
});
