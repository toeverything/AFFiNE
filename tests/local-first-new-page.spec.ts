import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('local first new page', () => {
  test('click btn new page', async ({ page }) => {
    const originPageId = page.url().split('/').reverse()[0];
    await page.getByText('New Page').click();
    const newPageId = page.url().split('/').reverse()[0];
    expect(newPageId).not.toBe(originPageId);
  });

  test('click btn bew page and find it in all pages', async ({ page }) => {
    await page.getByText('New Page').click();
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page');
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', { name: 'this is a new page' });
    expect(cell).not.toBeUndefined();
  });

  test('click btn bew page and open in tab', async ({ page }) => {
    await page.getByText('New Page').click();
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page');
    const newPageUrl = page.url();
    const newPageId = page.url().split('/').reverse()[0];

    await page.getByRole('link', { name: 'All pages' }).click();

    await page
      .getByTestId('more-actions-' + newPageId)
      .getByRole('button')
      .first()
      .click();
    const [newTabPage] = await Promise.all([
      page.waitForEvent('popup'),
      page.getByRole('button', { name: 'Open in new tab' }).click(),
    ]);

    expect(newTabPage.url()).toBe(newPageUrl);
  });
});
