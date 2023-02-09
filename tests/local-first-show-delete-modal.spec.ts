import { expect } from '@playwright/test';
import { test } from './libs/playwright.js';
import { loadPage } from './libs/load-page.js';
import { newPage, clickPageMoreActions } from './libs/page-logic.js';
loadPage();

test.describe('Local first delete page', () => {
  test('New a page ,then open it and show delete modal', async ({ page }) => {
    await newPage(page);
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page to delete');
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
      name: 'this is a new page to delete',
    });
    expect(cell).not.toBeUndefined();

    await cell.click();
    await clickPageMoreActions(page);
    const deleteBtn = page.getByTestId('editor-option-menu-delete');
    await deleteBtn.click();
    const confirmTip = page.getByText('Delete page?');
    expect(confirmTip).not.toBeUndefined();
  });

  test('New a page ,then go to all pages and show delete modal', async ({
    page,
  }) => {
    await newPage(page);
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page to delete');
    const newPageId = page.url().split('/').reverse()[0];
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
      name: 'this is a new page to delete',
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
  });
});
