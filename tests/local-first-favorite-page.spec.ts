import { test, expect } from '@playwright/test';
import { loadPage } from './libs/load-page.js';
import { newPage, clickPageMoreActions } from './libs/page-logic.js';
loadPage();

test.skip('Local first favorite and cancel favorite  page', () => {
  test('New a page and open it ,then favorite it', async ({ page }) => {
    await newPage(page);
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page to favorite');
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
      name: 'this is a new page to favorite',
    });
    expect(cell).not.toBeUndefined();

    await cell.click();
    await clickPageMoreActions(page);
    const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
    await favoriteBtn.click();
  });
  test('Cancel favorite', async ({ page }) => {
    await newPage(page);
    await page.getByPlaceholder('Title').click();
    await page.getByPlaceholder('Title').fill('this is a new page to favorite');
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
      name: 'this is a new page to favorite',
    });
    expect(cell).not.toBeUndefined();

    await cell.click();
    await clickPageMoreActions(page);

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
