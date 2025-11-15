import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  getPageByTitle,
  getPageItem,
  getPageOperationButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { getCurrentDocIdFromUrl } from '@affine-test/kit/utils/url';
import { expect } from '@playwright/test';

test('page delete -> refresh page -> it should be disappear', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page delete');
  const newPageId = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();
  const cell = await getPageByTitle(page, 'this is a new page delete');
  await expect(cell).toBeVisible();
  await getPageOperationButton(page, newPageId).click();
  const deleteBtn = page.getByTestId('doc-list-operation-trash');
  await deleteBtn.click();
  const confirmTip = page.getByRole('dialog', { name: 'Delete doc?' });
  await expect(confirmTip).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('trash-page').click();
  await page.getByTestId('delete-page-button').click();
  await page.getByText('Delete permanently?').dblclick();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Deleted docs will appear here.')).toBeVisible();
  await page.getByTestId('all-pages').click();

  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});

test('page delete -> create new page -> refresh page -> new page should be appear -> old page should be disappear', async ({
  page,
  workspace,
}) => {
  test.slow();
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page delete');
  const newPageDeleteId = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();
  const cellDelete = await getPageByTitle(page, 'this is a new page delete');
  await expect(cellDelete).toBeVisible();
  await getPageOperationButton(page, newPageDeleteId).click();
  const deleteBtn = page.getByTestId('doc-list-operation-trash');
  await deleteBtn.click();
  const confirmTip = page.getByRole('dialog', { name: 'Delete doc?' });
  await expect(confirmTip).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('trash-page').click();
  await page.getByTestId('delete-page-button').click();
  await page.getByText('Delete permanently?').dblclick();
  await page.getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Deleted docs will appear here')).toBeVisible();
  await page.getByTestId('all-pages').click();

  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page1');
  await page.waitForTimeout(1000);
  const newPageId1 = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page2');
  await page.waitForTimeout(1000);
  const newPageId2 = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();
  await getPageItem(page, newPageId1).click();
  await page.getByTestId('all-pages').click();
  await getPageItem(page, newPageId2).click();
  await page.getByTestId('all-pages').click();

  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});

test('delete multiple pages -> create multiple pages -> refresh', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  // create 1st page
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page1');
  const newPageId1 = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();
  // create 2nd page
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page2');
  const newPageId2 = getCurrentDocIdFromUrl(page);
  await page.getByTestId('all-pages').click();

  // 1st cell to be deleted
  const cellDelete1 = await getPageByTitle(page, 'this is a new page1');
  await expect(cellDelete1).toBeVisible();
  await getPageOperationButton(page, newPageId1).click();
  const deleteBtn1 = page.getByTestId('doc-list-operation-trash');
  await deleteBtn1.click();
  const confirmTip1 = page.getByRole('dialog', { name: 'Delete doc?' });
  await expect(confirmTip1).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('trash-page').click();
  await page.getByTestId('delete-page-button').click();
  await page.getByText('Delete permanently?').dblclick();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('all-pages').click();

  // 2nd cell to be deleted
  const cellDelete2 = await getPageByTitle(page, 'this is a new page2');
  await expect(cellDelete2).toBeVisible();
  await getPageOperationButton(page, newPageId2).click();
  const deleteBtn2 = page.getByTestId('doc-list-operation-trash');
  await deleteBtn2.click();
  const confirmTip2 = page.getByRole('dialog', { name: 'Delete doc?' });
  await expect(confirmTip2).toBeVisible();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('trash-page').click();
  await page.getByTestId('delete-page-button').click();
  await page.getByText('Delete permanently?').dblclick();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('all-pages').click();

  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});
