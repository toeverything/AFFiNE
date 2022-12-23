import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Local first favorite page', () => {
  test('New a page ,then open it and show favorite', async ({ page }) => {
    await page.getByText('New Page').click();
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page to favorite');

    await page.getByRole('link', { name: 'All pages' }).click();

    const cell = await page.getByRole('cell', {
      name: 'this is a new page to favorite',
    });

    expect(cell).not.toBeUndefined();

    await cell.click();

    await page
      .getByTestId('editor-header-items')
      .getByRole('button')
      .nth(2)
      .click();

    const favoriteBtn = page.getByTestId('editor-option-menu-favorite');

    await favoriteBtn.click();
  });
});
