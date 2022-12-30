import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe.skip('Local first favorite items ui', () => {
  test('Show favorite items in sidebar', async ({ page }) => {
    await page.getByText('New Page').click();
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page to favorite');
    const newPageId = page.url().split('/').reverse()[0];
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
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
    const favoriteListItemInSidebar = page.getByTestId(
      'favorite-list-item-' + newPageId
    );
    expect(await favoriteListItemInSidebar.textContent()).toBe(
      'this is a new page to favorite'
    );
  });

  test('Show favorite items in favorite list', async ({ page }) => {
    await page.getByText('New Page').click();
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page to favorite');
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
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

    await page.getByRole('link', { name: 'Favourites' }).click();
    expect(
      page.getByRole('cell', { name: 'this is a new page to favorite' })
    ).not.toBeUndefined();
  });
});
