import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  clickPageMoreActions,
  createLinkedPage,
  getBlockSuiteEditorTitle,
  newPage,
  waitMarkdownImported,
} from '../libs/page-logic';

test('Show favorite items in sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
  const newPageId = page.url().split('/').reverse()[0];
  await page.getByTestId('all-pages').click();
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

test('Show favorite reference in sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');

  // goes to main content
  await page.keyboard.press('Enter', { delay: 50 });

  await createLinkedPage(page, 'Another page');

  const newPageId = page.url().split('/').reverse()[0];

  await clickPageMoreActions(page);

  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();

  const favItemTestId = 'favorite-list-item-' + newPageId;

  const favoriteListItemInSidebar = page.getByTestId(favItemTestId);
  expect(await favoriteListItemInSidebar.textContent()).toBe(
    'this is a new page to favorite'
  );

  const collapseButton = favoriteListItemInSidebar.locator(
    '[data-testid="fav-collapsed-button"]'
  );

  await expect(collapseButton).toBeVisible();
  await collapseButton.click();
  await expect(
    page.locator('[data-type="favorite-list-item"] >> text=Another page')
  ).toBeVisible();
});

test("Deleted page's reference will not be shown in sidebar", async ({
  page,
}) => {
  await openHomePage(page);
  await waitMarkdownImported(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');

  const newPageId = page.url().split('/').reverse()[0];

  // goes to main content
  await page.keyboard.press('Enter', { delay: 50 });

  await createLinkedPage(page, 'Another page');

  await clickPageMoreActions(page);

  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();

  // goto "Another page"
  await page.locator('.affine-reference-title').click();

  // delete the page
  await clickPageMoreActions(page);

  const deleteBtn = page.getByTestId('editor-option-menu-delete');
  await deleteBtn.click();

  // confirm delete
  await page.locator('button >> text=Delete').click();

  const favItemTestId = 'favorite-list-item-' + newPageId;

  const favoriteListItemInSidebar = page.getByTestId(favItemTestId);
  expect(await favoriteListItemInSidebar.textContent()).toBe(
    'this is a new page to favorite'
  );

  const collapseButton = favoriteListItemInSidebar.locator(
    '[data-testid="fav-collapsed-button"]'
  );

  await expect(collapseButton).not.toBeVisible();
});
