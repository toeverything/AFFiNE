import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page';

loadPage();

test.describe('Local first favorite page', () => {
  test('New a page and open it ,then favorite ot', async ({ page }) => {
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
  });

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

  test('Cancel favorite', async ({ page }) => {
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

    // expect it in favorite list
    await page.getByRole('link', { name: 'Favourites' }).click();
    expect(
      page.getByRole('cell', { name: 'this is a new page to favorite' })
    ).not.toBeUndefined();

    // cancel favorite

    await page.getByRole('link', { name: 'All pages' }).click();

    const box = await page
      .getByRole('cell', { name: 'this is a new page to favorite' })
      .boundingBox();
    //hover table record
    await page.mouse.move((box?.x ?? 0) + 10, (box?.y ?? 0) + 10);

    await page.getByTestId('favourited-icon').click();

    // expect it not in favorite list
    await page.getByRole('link', { name: 'Favourites' }).click();
    expect(
      page.getByText(
        'Tips: Click Add to Favourites/Trash and the page will appear here.'
      )
    ).not.toBeUndefined();
  });
});
