import { expect } from '@playwright/test';

import { loadPage } from './libs/load-page';
import { getBlockSuiteEditorTitle, newPage } from './libs/page-logic';
import { test } from './libs/playwright';
loadPage();

test.describe('Local first trash page', () => {
  test('New a page , then delete it in all pages, finally find it in trash', async ({
    page,
  }) => {
    await newPage(page);
    await getBlockSuiteEditorTitle(page).click();
    await getBlockSuiteEditorTitle(page).fill('this is a new page to delete');
    const newPageId = page.url().split('/').reverse()[0];
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
      name: 'this is a new page to delete',
    });
    expect(cell).not.toBeUndefined();

    const moreActions = page.getByTestId('more-actions-' + newPageId);

    await moreActions.getByRole('button').first().click();
    const deleteBtn = moreActions.getByRole('button', { name: 'Delete' });
    await deleteBtn.click();
    const confirmTip = page.getByText('Delete page?');
    expect(confirmTip).not.toBeUndefined();

    await page.getByRole('button', { name: 'Delete' }).click();

    await page.getByRole('link', { name: 'Trash' }).click();
    expect(
      page.getByRole('cell', { name: 'this is a new page to delete' })
    ).not.toBeUndefined();
  });
});
