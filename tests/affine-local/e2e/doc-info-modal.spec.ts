import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  clickPageMoreActions,
  getBlockSuiteEditorTitle,
  getPageByTitle,
  getPageOperationButton,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import {
  addCustomProperty,
  closeTagsEditor,
  ensurePagePropertiesVisible,
  expectTagsVisible,
  filterTags,
  removeSelectedTag,
} from '@affine-test/kit/utils/properties';
import { getCurrentDocIdFromUrl } from '@affine-test/kit/utils/url';
import { expect, type Page } from '@playwright/test';

const searchAndCreateTag = async (page: Page, name: string) => {
  await filterTags(page, name);
  await page
    .locator(
      '[data-testid="tags-editor-popup"] [data-testid="tag-selector-item"]:has-text("Create ")'
    )
    .click();
};

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
  await ensurePagePropertiesVisible(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page');
});

test('New a page and open it ,then open info modal in the title bar', async ({
  page,
}) => {
  await page.getByTestId('header-info-button').click();

  const infoModal = page.getByTestId('info-modal');
  await expect(infoModal).toBeVisible();
  const title = page.getByTestId('info-modal-title');
  await expect(title).toHaveText('this is a new page');
});

test('New a page and open it ,then open info modal in the title bar more action button', async ({
  page,
}) => {
  await clickPageMoreActions(page);
  await page.getByTestId('editor-option-menu-info').click();

  const infoModal = page.getByTestId('info-modal');
  await expect(infoModal).toBeVisible();
  const title = page.getByTestId('info-modal-title');
  await expect(title).toHaveText('this is a new page');
});

test('New a page, then open info modal from all doc', async ({ page }) => {
  const newPageId = getCurrentDocIdFromUrl(page);

  await page.getByTestId('all-pages').click();
  const cell = getPageByTitle(page, 'this is a new page');
  expect(cell).not.toBeUndefined();
  await getPageOperationButton(page, newPageId).click();
  await page.getByRole('menuitem', { name: 'View Info' }).click();

  const infoModal = page.getByTestId('info-modal');
  await expect(infoModal).toBeVisible();
  const title = page.getByTestId('info-modal-title');
  await expect(title).toHaveText('this is a new page');
});

test('New a page and add to favourites, then open info modal from sidebar', async ({
  page,
}) => {
  const newPageId = getCurrentDocIdFromUrl(page);

  await clickPageMoreActions(page);
  await page.getByTestId('editor-option-menu-favorite').click();

  await page.getByTestId('all-pages').click();
  const favoriteListItemInSidebar = page.locator(
    `[data-testid="explorer-favorites"] [data-testid="explorer-doc-${newPageId}"]`
  );
  expect(await favoriteListItemInSidebar.textContent()).toBe(
    'this is a new page'
  );
  await favoriteListItemInSidebar.hover();
  await favoriteListItemInSidebar
    .getByTestId('explorer-tree-node-operation-button')
    .click();
  const infoBtn = page.getByText('View Info');
  await infoBtn.click();

  const infoModal = page.getByTestId('info-modal');
  await expect(infoModal).toBeVisible();
  const title = page.getByTestId('info-modal-title');
  await expect(title).toHaveText('this is a new page');
});

test('allow create tag', async ({ page }) => {
  await page.getByTestId('header-info-button').click();

  const infoModal = page.getByTestId('info-modal');
  await expect(infoModal).toBeVisible();
  await infoModal.getByTestId('property-tags-value').click();
  await searchAndCreateTag(page, 'Test1');
  await searchAndCreateTag(page, 'Test2');
  await closeTagsEditor(page);
  await expectTagsVisible(infoModal, ['Test1', 'Test2']);

  await infoModal.getByTestId('property-tags-value').click();
  await removeSelectedTag(page, 'Test1');
  await closeTagsEditor(page);
  await expectTagsVisible(infoModal, ['Test2']);
});

test('add custom property', async ({ page }) => {
  await page.getByTestId('header-info-button').click();

  const infoModal = page.getByTestId('info-modal');
  await expect(infoModal).toBeVisible();
  await addCustomProperty(page, infoModal, 'text');
  await addCustomProperty(page, infoModal, 'number');
  await addCustomProperty(page, infoModal, 'date');
  await addCustomProperty(page, infoModal, 'checkbox');
  await addCustomProperty(page, infoModal, 'createdBy');
  await addCustomProperty(page, infoModal, 'updatedBy');
});
