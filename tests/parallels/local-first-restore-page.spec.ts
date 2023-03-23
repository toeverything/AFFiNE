import { expect } from '@playwright/test';

import { loadPage } from './libs/load-page';
import { getBlockSuiteEditorTitle, newPage } from './libs/page-logic';
import { test } from './libs/playwright';
import { assertCurrentWorkspaceFlavour } from './libs/workspace';
loadPage();

test.describe('Local first delete page', () => {
  test('New a page , then delete it in all pages, restore it', async ({
    page,
  }) => {
    await newPage(page);
    await getBlockSuiteEditorTitle(page).click();
    await getBlockSuiteEditorTitle(page).fill('this is a new page to restore');
    const newPageId = page.url().split('/').reverse()[0];
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
      name: 'this is a new page to restore',
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

    await page.getByRole('link', { name: 'Trash' }).click();
    const trashPage = await page.url();
    // restore it
    await page
      .getByTestId('more-actions-' + newPageId)
      .getByRole('button')
      .first()
      .click();

    // stay in trash page
    expect(page.url()).toBe(trashPage);
    await page.getByRole('link', { name: 'All pages' }).click();
    const restoreCell = page.getByRole('cell', {
      name: 'this is a new page to restore',
    });
    expect(restoreCell).not.toBeUndefined();
    await assertCurrentWorkspaceFlavour('local', page);
  });
});
