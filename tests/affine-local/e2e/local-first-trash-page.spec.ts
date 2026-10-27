import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  getPageByTitle,
  getPageOperationButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { getCurrentDocIdFromUrl } from '@affine-test/kit/utils/url';
import { expect, type Page } from '@playwright/test';

const movePageToTrash = async (page: Page, docId: string) => {
  await getPageOperationButton(page, docId).click();
  await page.getByTestId('doc-list-operation-trash').click();
  await expect(page.getByRole('dialog', { name: 'Delete doc?' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
};

const createAndTrashPage = async (page: Page, title: string) => {
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill(title);
  const docId = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();
  await movePageToTrash(page, docId);
};

test('New a page , then delete it in all pages, finally find it in trash', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to delete');
  const newPageId = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();
  const cell = await getPageByTitle(page, 'this is a new page to delete');
  await expect(cell).toBeVisible();

  await movePageToTrash(page, newPageId);

  await page.getByTestId('trash-page').click();
  await expect(page.getByText('this is a new page to delete')).toBeVisible();
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});

test('select all trashed pages from the Trash title', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await createAndTrashPage(page, 'trash select all 1');
  await createAndTrashPage(page, 'trash select all 2');
  await page.getByTestId('trash-page').click();

  const selectAllButton = page.getByTestId('trash-select-all');
  await expect(selectAllButton).not.toBeVisible();

  await page
    .locator('[data-testid="doc-list-item"]')
    .first()
    .click({ modifiers: ['Shift'] });

  await expect(selectAllButton).toHaveText('Select all');
  await selectAllButton.click();
  await expect(page.getByTestId('floating-toolbar')).toHaveText(
    '2 doc(s) selected'
  );
  await expect(selectAllButton).toHaveText('Clear selection');

  await selectAllButton.click();
  await expect(page.getByTestId('floating-toolbar')).toHaveText(
    '0 doc(s) selected'
  );
  await expect(selectAllButton).toHaveText('Select all');
});
