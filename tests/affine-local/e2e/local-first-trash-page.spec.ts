import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  getBlockSuiteEditorTitle,
  newPage,
  waitEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { assertCurrentWorkspaceFlavour } from '@affine-test/kit/utils/workspace';
import { expect } from '@playwright/test';

test('New a page , then delete it in all pages, finally find it in trash', async ({
  page,
}) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to delete');
  const newPageId = page.url().split('/').reverse()[0];
  await page.getByTestId('all-pages').click();
  const cell = page.getByRole('cell', {
    name: 'this is a new page to delete',
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
  expect(
    page.getByRole('cell', { name: 'this is a new page to delete' })
  ).not.toBeUndefined();
  await assertCurrentWorkspaceFlavour('local', page);
});
