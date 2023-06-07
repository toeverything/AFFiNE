import { test } from '@affine-test/kit/playwright';
import { expect } from '@playwright/test';

import { openHomePage } from '../libs/load-page';
import {
  clickPageMoreActions,
  getBlockSuiteEditorTitle,
  newPage,
  waitEditorLoad,
} from '../libs/page-logic';
import { waitForLogMessage } from '../libs/utils';
import { assertCurrentWorkspaceFlavour } from '../libs/workspace';

test('New a page and open it ,then favorite it', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
  await page.getByTestId('all-pages').click();
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

test('Export to html, markdown and png', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  {
    await clickPageMoreActions(page);
    await page.getByTestId('export-menu').click();
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

test.skip('Export to pdf', async ({ page }) => {
  const CheckedMessage = '[test] beforeprint event emitted';
  page.addInitScript(() => {
    window.addEventListener('beforeprint', () => {
      console.log(CheckedMessage);
    });
  });
  await openHomePage(page);
  await waitEditorLoad(page);
  {
    await clickPageMoreActions(page);
    await page.getByTestId('export-menu').click();
    await page.getByTestId('export-to-pdf').click();
    expect(waitForLogMessage(page, CheckedMessage)).toBeTruthy();
  }
});

test('Cancel favorite', async ({ page }) => {
  await openHomePage(page);
  await waitEditorLoad(page);
  await newPage(page);
  await getBlockSuiteEditorTitle(page).click();
  await getBlockSuiteEditorTitle(page).fill('this is a new page to favorite');
  await page.getByTestId('all-pages').click();
  const cell = page.getByRole('cell', {
    name: 'this is a new page to favorite',
  });
  expect(cell).not.toBeUndefined();

  await cell.click();
  await clickPageMoreActions(page);

  const favoriteBtn = page.getByTestId('editor-option-menu-favorite');
  await favoriteBtn.click();

  // expect it in favorite list
  expect(
    page.getByRole('cell', { name: 'this is a new page to favorite' })
  ).not.toBeUndefined();

  // cancel favorite

  await page.getByTestId('all-pages').click();

  const box = await page
    .getByRole('cell', { name: 'this is a new page to favorite' })
    .boundingBox();
  //hover table record
  await page.mouse.move((box?.x ?? 0) + 10, (box?.y ?? 0) + 10);

  await page.getByTestId('favorited-icon').click();

  // expect it not in favorite list
  expect(
    page.getByText(
      'Tips: Click Add to Favorites/Trash and the page will appear here.'
    )
  ).not.toBeUndefined();
  await assertCurrentWorkspaceFlavour('local', page);
});
