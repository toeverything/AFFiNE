import { test } from '@affine-test/kit/playwright';
import { clickPageModeButton } from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  clickPageMoreActions,
  createLinkedPage,
  getBlockSuiteEditorTitle,
  getPageByTitle,
  waitForEditorLoad,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { getCurrentDocIdFromUrl } from '@affine-test/kit/utils/url';
import { expect } from '@playwright/test';

test('Show favorite items in sidebar', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
  const newPageId = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();
  const cell = getPageByTitle(page, 'this is a new page to favorite');
  await expect(cell).toBeVisible();
  await cell.click();
  await clickPageMoreActions(page);

  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();
  const favoriteListItemInSidebar = page.getByTestId(
    'explorer-doc-' + newPageId
  );
  expect(await favoriteListItemInSidebar.textContent()).toBe(
    'this is a new page to favorite'
  );
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});

test('Show favorite reference in sidebar', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');

  // goes to main content
  await page.keyboard.press('Enter', { delay: 50 });

  await createLinkedPage(page, 'Another page');

  const newPageId = getCurrentDocIdFromUrl(page);

  await clickPageMoreActions(page);

  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();

  const favItemTestId = 'explorer-doc-' + newPageId;

  const favoriteListItemInSidebar = page.getByTestId(favItemTestId);
  expect(await favoriteListItemInSidebar.textContent()).toBe(
    'this is a new page to favorite'
  );

  const collapseButton = favoriteListItemInSidebar.getByTestId(
    'explorer-collapsed-button'
  );

  await expect(collapseButton).toBeVisible();
  await collapseButton.click();
  await expect(
    favoriteListItemInSidebar.locator(
      '[data-testid^="explorer-doc-"]:has-text("Another page")'
    )
  ).toBeVisible();
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});

test("Deleted page's reference will not be shown in sidebar", async ({
  page,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');

  const newPageId = getCurrentDocIdFromUrl(page);

  // goes to main content
  await page.keyboard.press('Enter', { delay: 50 });

  await createLinkedPage(page, 'Another page');

  await clickPageMoreActions(page);

  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();

  // goto "Another page"
  await page.locator('.affine-reference-title').click();

  await expect(
    page.locator('.doc-title-container:has-text("Another page")')
  ).toBeVisible();

  const anotherPageId = getCurrentDocIdFromUrl(page);

  const favItemTestId = 'explorer-doc-' + newPageId;

  await expect(page.getByTestId(favItemTestId)).toHaveText(
    'this is a new page to favorite'
  );

  await page
    .getByTestId(favItemTestId)
    .getByTestId('explorer-collapsed-button')
    .click();

  const favItemAnotherPageTestId = 'explorer-doc-' + anotherPageId;

  await expect(
    page.getByTestId(favItemTestId).getByTestId(favItemAnotherPageTestId)
  ).toBeVisible();

  // delete the page
  await clickPageMoreActions(page);

  const deleteBtn = page.getByTestId('editor-option-menu-delete');
  await deleteBtn.click();

  // confirm delete
  await page.locator('button >> text=Delete').click();

  await expect(
    page.getByTestId(favItemTestId).getByTestId(favItemAnotherPageTestId)
  ).toBeHidden();
});

test('Add new favorite page via sidebar', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);

  await page.getByTestId('explorer-bar-add-favorite-button').first().click();
  await clickPageModeButton(page);
  await waitForEmptyEditor(page);

  // enter random page title
  await getBlockSuiteEditorTitle(page).fill('this is a new fav page');
  // check if the page title is shown in the favorite list
  const favItem = page
    .getByTestId('explorer-favorites')
    .locator('[draggable] >> text=this is a new fav page');
  await expect(favItem).toBeVisible();
});
