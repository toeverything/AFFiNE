import { expect } from '@playwright/test';

import { waitMarkdownImported } from '../../libs/page-logic';
import { test } from '../../libs/playwright';
import { clickNewPageButton } from '../../libs/sidebar';
import { createFakeUser, loginUser, openHomePage } from '../../libs/utils';
import { createWorkspace } from '../../libs/workspace';

test('public single page', async ({ page, browser }) => {
  await openHomePage(page);
  const [a] = await createFakeUser();
  await loginUser(page, a);
  await waitMarkdownImported(page);
  const name = `test-${Date.now()}`;
  await createWorkspace({ name }, page);
  await waitMarkdownImported(page);
  await clickNewPageButton(page);
  const page1Id = page.url().split('/').at(-1);
  await clickNewPageButton(page);
  const page2Id = page.url().split('/').at(-1);
  expect(typeof page2Id).toBe('string');
  expect(page1Id).not.toBe(page2Id);
  const title = 'This is page 2';
  await page.locator('[data-block-is-title="true"]').type(title, {
    delay: 50,
  });
  await page.getByTestId('share-menu-button').click();
  await page.getByTestId('share-menu-enable-affine-cloud-button').click();
  const promise = page.evaluate(
    async () =>
      new Promise(resolve =>
        window.addEventListener('affine-workspace:transform', resolve, {
          once: true,
        })
      )
  );
  await page.getByTestId('confirm-enable-cloud-button').click();
  await promise;
  const newPage2Url = page.url().split('/');
  newPage2Url[newPage2Url.length - 1] = page2Id as string;
  await page.goto(newPage2Url.join('/'));
  await page.waitForSelector('v-line');
  const currentTitle = await page
    .locator('[data-block-is-title="true"]')
    .textContent();
  expect(currentTitle).toBe(title);
  await page.getByTestId('share-menu-button').click();
  await page.getByTestId('affine-share-create-link').click();
  await page.getByTestId('affine-share-copy-link').click();
  const url = await page.evaluate(() => navigator.clipboard.readText());
  expect(url.startsWith('http://localhost:8080/public-workspace/')).toBe(true);
  await page.waitForTimeout(1000);
  const context2 = await browser.newContext();
  const page2 = await context2.newPage();
  await page2.goto(url);
  await page2.waitForSelector('v-line');
  const currentTitle2 = await page2
    .locator('[data-block-is-title="true"]')
    .textContent();
  expect(currentTitle2).toBe(title);
});
