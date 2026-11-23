import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  clickPageMoreActions,
  getBlockSuiteEditorTitle,
  getPageByTitle,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('New a page and open it, then favorite it', async ({
  page,
  workspace,
}) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
  await page.getByTestId('all-pages').click();
  const cell = page
    .getByTestId('doc-list-item-title')
    .getByText('this is a new page to favorite');
  await expect(cell).toBeVisible();

  await cell.click();
  await clickPageMoreActions(page);
  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});

test('Export to html, markdown and png', async ({ page }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  {
    await clickPageMoreActions(page);
    await page.getByTestId('export-menu').hover();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-to-markdown').click();
    await downloadPromise;
  }
  await page.waitForTimeout(50);
  {
    await clickPageMoreActions(page);
    await page.getByTestId('export-menu').click();
    const downloadPromise = page.waitForEvent('download');
    await page.getByTestId('export-to-html').click();
    await downloadPromise;
  }
  // await page.waitForTimeout(50);
  // {
  //   await clickPageMoreActions(page);
  //   await page.getByTestId('export-menu').click();
  //   const downloadPromise = page.waitForEvent('download');
  //   await page.getByTestId('export-to-png').click();
  //   await downloadPromise;
  // }
});

test('Cancel favorite', async ({ page, workspace }) => {
  await openHomePage(page);
  await waitForEditorLoad(page);
  await clickNewPageButton(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
  await page.getByTestId('all-pages').click();
  const cell = getPageByTitle(page, 'this is a new page to favorite');
  await expect(cell).toBeVisible();

  await cell.click();
  await clickPageMoreActions(page);

  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();

  const favorites = page.getByTestId('navigation-panel-favorites');

  // expect it in favorite list
  await expect(
    favorites.getByText('this is a new page to favorite')
  ).toBeVisible();

  // cancel favorite

  await page.getByTestId('all-pages').click();

  const doc = await getPageByTitle(page, 'this is a new page to favorite');
  await doc.getByTestId('doc-list-operation-favorite').click();

  // expect it not in favorite list
  await expect(
    favorites.getByTestId('slider-bar-favorites-empty-message')
  ).toBeVisible();
  const currentWorkspace = await workspace.current();

  expect(currentWorkspace.meta.flavour).toContain('local');
});
