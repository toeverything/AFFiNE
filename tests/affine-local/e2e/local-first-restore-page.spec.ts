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
import { expect } from '@playwright/test';

test('New a page , then delete it in all pages, restore it', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to restore');
  const newPageId = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();
  const cell = await getPageByTitle(page, 'this is a new page to restore');
  await expect(cell).toBeVisible();

  await getPageOperationButton(page, newPageId).click();
  const deleteBtn = page.getByTestId('doc-list-operation-trash');
  await deleteBtn.click();
  const confirmTip = page.getByRole('dialog', { name: 'Delete doc?' });
  await expect(confirmTip).toBeVisible();

  await page.getByRole('button', { name: 'Delete' }).click();

  await page.getByTestId('trash-page').click();
  await page.waitForTimeout(50);
  const trashPage = page.url();
  // restore it
  await page.getByTestId('restore-page-button').click();

  // stay in trash page
  expect(page.url()).toBe(trashPage);
  await page.getByTestId('all-pages').click();

  const restoreCell = await getPageByTitle(
    page,
    'this is a new page to restore'
  );
  await expect(restoreCell).toBeVisible();
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});
