import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  getBlockSuiteEditorTitle,
  newPage,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('click btn bew page and open in tab', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page');
  const newPageUrl = page.url();
  const newPageId = page.url().split('/').reverse()[0];

  await page.getByTestId('all-pages').click();

  await page
    .getByTestId('more-actions-' + newPageId)
    .getByRole('button')
    .first()
    .click();
  const [newTabPage] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: 'Open in new tab' }).click(),
  ]);

  expect(newTabPage.url()).toBe(newPageUrl);
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});
