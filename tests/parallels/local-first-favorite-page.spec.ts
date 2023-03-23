import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  clickPageMoreActions,
  getBlockSuiteEditorTitle,
  newPage,
} from '../libs/page-logic';
import { test } from '../libs/playwright';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test.describe('Local first favorite and cancel favorite  page', () => {
  test('New a page and open it ,then favorite it', async ({ page }) => {
    await openHomePage(page);
    await newPage(page);
    await getBlockSuiteEditorTitle(page).click();
    await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
    await page.getByRole('link', { name: 'All pages' }).click();
    const cell = page.getByRole('cell', {
      name: 'this is a new page to favorite',
    });
    expect(cell).not.toBeUndefined();

    await cell.click();
    await clickPageMoreActions(page);
    const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
    await favoriteBtn.click();
    await assertCurrentWorkspaceFlavour('local', page);
  });
  test('Cancel favorite', async ({ page }) => {
    await openHomePage(page);
    await newPage(page);
    await getBlockSuiteEditorTitle(page).click();
    await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
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
    await page.getByRole('link', { name: 'Favorites' }).click();
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

    await page.getByTestId('favorited-icon').click();

    // expect it not in favorite list
    await page.getByRole('link', { name: 'Favorites' }).click();
    expect(
      page.getByText(
        'Tips: Click Add to Favorites/Trash and the page will appear here.'
      )
    ).not.toBeUndefined();
    await assertCurrentWorkspaceFlavour('local', page);
  });
});
