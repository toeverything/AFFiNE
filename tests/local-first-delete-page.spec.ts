import { expect } from '@playwright/test';
import { test } from './libs/playwright.js';
import { loadPage } from './libs/load-page.js';
import { newPage } from './libs/page-logic.js';

loadPage();

test.describe('Local first delete page', () => {
  test('New a page , then delete it in all pages, permanently delete it', async ({
    page,
  }) => {
    await newPage(page);
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page to restore');
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
    const deleteBtn = page.getByRole('button', { name: 'Delete' });
    await deleteBtn.click();
    const confirmTip = page.getByText('Delete page?');
    expect(confirmTip).not.toBeUndefined();

    await page.getByRole('button', { name: 'Delete' }).click();

    await page.getByRole('link', { name: 'Trash' }).click();
    // permanently delete it
    await page
      .getByTestId('more-actions-' + newPageId)
      .getByRole('button')
      .nth(1)
      .click();
    await page.getByText('Delete permanently?').dblclick();

    // show empty tip
    expect(
      page.getByText(
        'Tips: Click Add to Favorites/Trash and the page will appear here.'
      )
    ).not.toBeUndefined();
  });
});
