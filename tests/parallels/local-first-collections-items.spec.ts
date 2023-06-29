import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  closeDownloadTip,
  getBlockSuiteEditorTitle,
  newPage,
  waitEditorLoad,
} from '../libs/page-logic';

test('Show collections items in sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('test page');
  await page.getByTestId('all-pages').click();
  const cell = page.getByRole('cell', {
    name: 'test page',
  });
  await expect(cell).toBeVisible();
  await closeDownloadTip(page);
  await page.getByTestId('create-first-filter').click();
  await page
    .getByTestId('variable-select')
    .locator('button', { hasText: 'Created' })
    .click();
  await page.getByTestId('save-as-collection').click();
  const title = page.getByTestId('input-collection-title');
  await title.isVisible();
  await title.fill('test collection');
  await page.getByTestId('save-collection').click();
  await page.getByTestId('collection-bar-pin-to-collections').click();
  const collections = page.getByTestId('collections');
  const items = collections.getByTestId('collection-item');
  expect(await items.count()).toBe(1);
  const first = items.first();
  expect(await first.textContent()).toBe('test collection');
  await first.getByTestId('fav-collapsed-button').click();
  const collectionPage = collections.getByTestId('collection-page').nth(1);
  expect(await collectionPage.textContent()).toBe('test page');
  await collectionPage.getByTestId('collection-page-options').click();
  const deletePage = page
    .getByTestId('collection-page-option')
    .getByText('Delete');
  await deletePage.click();
  expect(await collections.getByTestId('collection-page').count()).toBe(1);
  await first.getByTestId('collection-options').click();
  const deleteCollection = page
    .getByTestId('collection-option')
    .getByText('Delete');
  await deleteCollection.click();
  expect(await items.count()).toBe(0);
});
