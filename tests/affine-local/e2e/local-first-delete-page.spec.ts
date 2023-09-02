import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  getBlockSuiteEditorTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
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
  const newPageId = page.url().split('/').reverse()[0];
  await page.getByTestId('all-pages').click();
  const cell = page.getByRole('cell', {
    name: 'this is a new page delete',
  });
  expect(cell).not.toBeUndefined();
  await page
    .getByTestId('more-actions-' + newPageId)
    .getByRole('button')
    .first()
    .click();
  const deleteBtn = page.getByTestId('move-to-trash');
  await deleteBtn.click();
  const confirmTip = page.getByText('Delete page?');
  expect(confirmTip).not.toBeUndefined();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('trash-page').click();
  await page
    .getByTestId('more-actions-' + newPageId)
    .getByRole('button')
    .nth(1)
    .click();
  await page.getByText('Delete permanently?').dblclick();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.reload();
  expect(page.getByText("There's no page here yet")).not.toBeUndefined();
  await page.getByTestId('all-pages').click();
  await page.reload();

  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});

test('page delete -> create new page -> refresh page -> new page should be appear -> old page should be disappear', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page delete');
  const newPageDeleteId = page.url().split('/').reverse()[0];
  await page.getByTestId('all-pages').click();
  const cellDelete = page.getByRole('cell', {
    name: 'this is a new page delete',
  });
  expect(cellDelete).not.toBeUndefined();
  await page
    .getByTestId('more-actions-' + newPageDeleteId)
    .getByRole('button')
    .first()
    .click();
  const deleteBtn = page.getByTestId('move-to-trash');
  await deleteBtn.click();
  const confirmTip = page.getByText('Delete page?');
  expect(confirmTip).not.toBeUndefined();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('trash-page').click();
  await page
    .getByTestId('more-actions-' + newPageDeleteId)
    .getByRole('button')
    .nth(1)
    .click();
  await page.getByText('Delete permanently?').dblclick();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.reload();
  expect(page.getByText("There's no page here yet")).not.toBeUndefined();
  await page.getByTestId('all-pages').click();

  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page1');
  const newPageId1 = page.url().split('/').reverse()[0];
  await page.getByTestId('all-pages').click();
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page2');
  const newPageId2 = page.url().split('/').reverse()[0];
  await page.getByTestId('all-pages').click();
  await page.reload();
  await page.getByTestId(`page-list-item-${newPageId1}`).click();
  await page.getByTestId('all-pages').click();
  await page.getByTestId(`page-list-item-${newPageId2}`).click();
  await page.getByTestId('all-pages').click();

  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
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
  const newPageId1 = page.url().split('/').reverse()[0];
  await page.getByTestId('all-pages').click();
  // create 2nd page
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page2');
  const newPageId2 = page.url().split('/').reverse()[0];
  await page.getByTestId('all-pages').click();

  // 1st cell to be deleted
  const cellDelete1 = page.getByRole('cell', {
    name: 'this is a new page1',
  });
  expect(cellDelete1).not.toBeUndefined();
  await page
    .getByTestId('more-actions-' + newPageId1)
    .getByRole('button')
    .first()
    .click();
  const deleteBtn1 = page.getByTestId('move-to-trash');
  await deleteBtn1.click();
  const confirmTip1 = page.getByText('Delete page?');
  expect(confirmTip1).not.toBeUndefined();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('trash-page').click();
  await page
    .getByTestId('more-actions-' + newPageId1)
    .getByRole('button')
    .nth(1)
    .click();
  await page.getByText('Delete permanently?').dblclick();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('all-pages').click();

  // 2nd cell to be deleted
  const cellDelete2 = page.getByRole('cell', {
    name: 'this is a new page2',
  });
  expect(cellDelete2).not.toBeUndefined();
  await page
    .getByTestId('more-actions-' + newPageId2)
    .getByRole('button')
    .first()
    .click();
  const deleteBtn2 = page.getByTestId('move-to-trash');
  await deleteBtn2.click();
  const confirmTip2 = page.getByText('Delete page?');
  expect(confirmTip2).not.toBeUndefined();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('trash-page').click();
  await page
    .getByTestId('more-actions-' + newPageId2)
    .getByRole('button')
    .nth(1)
    .click();
  await page.getByText('Delete permanently?').dblclick();
  await page.getByRole('button', { name: 'Delete' }).click();
  await page.getByTestId('all-pages').click();

  await page.reload();

  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.flavour).toContain('local');
});
