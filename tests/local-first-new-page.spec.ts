import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Local first new page', () => {
  test('Click btn new page', async ({ page }) => {
    const originPageUrl = page.url();
    await page.getByText('New Page').click();
    const newPageUrl = page.url();
    expect(newPageUrl).not.toBe(originPageUrl);
    expect(newPageUrl.length).toBe(originPageUrl.length);
  });

  test('Click btn bew page and find it in all pages', async ({ page }) => {
    await page.getByText('New Page').click();
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page');
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', { name: 'this is a new page' });
    expect(cell).not.toBeUndefined();
  });
});
