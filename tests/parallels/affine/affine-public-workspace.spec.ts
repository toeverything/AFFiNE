import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../../libs/load-page';
import { waitEditorLoad } from '../../libs/page-logic';
import { clickPublishPanel } from '../../libs/setting';
import {
  clickSideBarAllPageButton,
  clickSideBarSettingButton,
} from '../../libs/sidebar';
import { createFakeUser, loginUser } from '../../libs/utils';
import { createWorkspace } from '../../libs/workspace';

test('enable public workspace', async ({ page, context }) => {
  await openHomePage(page);
  const [a] = await createFakeUser();
  await loginUser(page, a);
  await waitEditorLoad(page);
  const name = `test-${Date.now()}`;
  await createWorkspace({ name }, page);
  await waitEditorLoad(page);
  await clickSideBarSettingButton(page);
  await page.waitForTimeout(50);
  await clickPublishPanel(page);
  await page.getByTestId('publish-enable-affine-cloud-button').click();
  await page.getByTestId('confirm-enable-affine-cloud-button').click();
  await page.getByTestId('publish-to-web-button').waitFor({
    timeout: 10000,
  });
  await page.getByTestId('publish-to-web-button').click();
  await page.getByTestId('share-url').waitFor({
    timeout: 10000,
  });
  const url = await page.getByTestId('share-url').inputValue();
  expect(url.startsWith('http://localhost:8080/public-workspace/')).toBe(true);
  const page2 = await context.newPage();
  await page2.goto(url);
  await page2.waitForSelector('thead', {
    timeout: 10000,
  });
  await page2.getByText('Untitled').click();
});

test('access public workspace page', async ({ page, browser }) => {
  await openHomePage(page);
  const [a] = await createFakeUser();
  await loginUser(page, a);
  await waitEditorLoad(page);
  const name = `test-${Date.now()}`;
  await createWorkspace({ name }, page);
  await waitEditorLoad(page);
  await clickSideBarSettingButton(page);
  await page.waitForTimeout(50);
  await clickPublishPanel(page);
  await page.getByTestId('publish-enable-affine-cloud-button').click();
  await page.getByTestId('confirm-enable-affine-cloud-button').click();
  await page.getByTestId('publish-to-web-button').waitFor({
    timeout: 10000,
  });
  await page.getByTestId('publish-to-web-button').click();
  await page.getByTestId('share-url').waitFor({
    timeout: 10000,
  });
  await clickSideBarAllPageButton(page);
  await page.locator('tr').nth(2).click();
  const url = page.url();
  const context = await browser.newContext();
  const page2 = await context.newPage();
  await page2.goto(url.replace('workspace', 'public-workspace'));
  await page2.waitForSelector('v-line');
});
