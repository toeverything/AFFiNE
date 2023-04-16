import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  clickPageMoreActions,
  getBlockSuiteEditorTitle,
  newPage,
  waitMarkdownImported,
} from '../libs/page-logic';
import { test } from '../libs/playwright';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test('Show favorite items in sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
  const newPageId = page.url().split('/').reverse()[0];
  await page.getByRole('link', { name: 'All pages' }).click();
  const cell = page.getByRole('cell', {
    name: 'this is a new page to favorite',
  });
  await expect(cell).toBeVisible();
  await cell.click();
  await clickPageMoreActions(page);

  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();
  const favoriteListItemInSidebar = page.getByTestId(
    'favorite-list-item-' + newPageId
  );
  expect(await favoriteListItemInSidebar.textContent()).toBe(
    'this is a new page to favorite'
  );
});

test('Show favorite items in favorite list', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
  await page.getByRole('link', { name: 'All pages' }).click();
  const cell = page.getByRole('cell', {
    name: 'this is a new page to favorite',
  });
  expect(cell).not.toBeUndefined();
  await cell.click();
  await clickPageMoreActions(page);

  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();

  await page.getByRole('link', { name: 'Favorites' }).click();
  expect(
    page.getByRole('cell', { name: 'this is a new page to favorite' })
  ).not.toBeUndefined();

  await page.getByRole('cell').getByRole('button').nth(0).click();
  expect(
    await page
      .getByText('Click Add to Favorites and the page will appear here.')
      .isVisible()
  ).toBe(true);
  await assertCurrentWorkspaceFlavour('local', page);
});
