import {
  clickDeleteButtonInTableMenu,
  createTable,
  getCellText,
  inputToCell,
} from '@affine-test/kit/bs/table';
import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

test('should table collab work', async ({ page: pageA, context }) => {
  await openHomePage(pageA);
  await clickNewPageButton(pageA);
  await waitForEditorLoad(pageA);
  await pageA.keyboard.press('Enter');

  /**
   * | Cell1 | Cell2 |
   * | Cell3 | Cell4 |
   */
  await createTable(pageA);
  const cellsInA = pageA.locator('affine-table-cell');
  const cellCountInA = await cellsInA.count();
  expect(cellCountInA).toBe(4);

  const currentUrl = pageA.url();

  const pageB = await context.newPage();
  await pageB.goto(currentUrl);
  await waitForEditorLoad(pageB);
  await pageB.keyboard.press('Enter');

  const tableInB = pageB.locator('affine-table');
  await expect(tableInB).toBeVisible();
  const cellsInB = tableInB.locator('affine-table-cell');
  expect(await cellsInB.count()).toBe(cellCountInA);

  expect(await getCellText(pageB, 0)).toBe('Cell1');
  expect(await getCellText(pageB, 3)).toBe('Cell4');

  await cellsInB.last().hover();
  const addColumnButton = tableInB.locator('data-testid=add-column-button');
  expect(await addColumnButton.isVisible()).toBe(true);
  await addColumnButton.click();

  expect(await cellsInA.count()).toBe(6);
  expect(await cellsInB.count()).toBe(6);

  // new created cells should be synced to both page
  /**
   * | Cell1 | Cell2 | Cell5 |
   * | Cell3 | Cell4 | Cell6 |
   */
  await inputToCell(pageA, 2, 'Cell5');
  await inputToCell(pageA, 5, 'Cell6');
  expect(await getCellText(pageB, 2)).toBe('Cell5');
  expect(await getCellText(pageB, 5)).toBe('Cell6');

  await cellsInB.last().hover();
  const addRowButton = tableInB.locator('data-testid=add-row-button');
  expect(await addRowButton.isVisible()).toBe(true);
  await addRowButton.click();

  expect(await cellsInA.count()).toBe(9);
  expect(await cellsInB.count()).toBe(9);

  // new created cells should be synced to both page
  /**
   * | Cell1 | Cell2 | Cell5 |
   * | Cell3 | Cell4 | Cell6 |
   * | Cell7 | Cell8 | Cell9 |
   */
  await inputToCell(pageA, 6, 'Cell7');
  await inputToCell(pageA, 7, 'Cell8');
  await inputToCell(pageA, 8, 'Cell9');
  expect(await getCellText(pageB, 6)).toBe('Cell7');
  expect(await getCellText(pageB, 7)).toBe('Cell8');
  expect(await getCellText(pageB, 8)).toBe('Cell9');

  // delete a column
  await cellsInA.nth(1).hover();
  const dragColumnHandle = cellsInA
    .nth(1)
    .locator('data-testid=drag-column-handle');
  expect(await dragColumnHandle.isVisible()).toBe(true);
  await dragColumnHandle.click();

  await clickDeleteButtonInTableMenu(pageA);
  /**
   * | Cell1 | Cell5 |
   * | Cell3 | Cell6 |
   * | Cell7 | Cell9 |
   */
  expect(await cellsInA.count()).toBe(6);
  expect(await cellsInB.count()).toBe(6);

  expect(await getCellText(pageB, 0)).toBe('Cell1');
  expect(await getCellText(pageB, 1)).toBe('Cell5');
  expect(await getCellText(pageB, 2)).toBe('Cell3');
  expect(await getCellText(pageB, 3)).toBe('Cell6');
  expect(await getCellText(pageB, 4)).toBe('Cell7');
  expect(await getCellText(pageB, 5)).toBe('Cell9');

  // delete a row
  await cellsInB.nth(0).hover();
  const dragRowHandle = cellsInB.nth(0).locator('data-testid=drag-row-handle');
  expect(await dragRowHandle.isVisible()).toBe(true);
  await dragRowHandle.click();

  await clickDeleteButtonInTableMenu(pageB);
  /**
   * | Cell3 | Cell6 |
   * | Cell7 | Cell9 |
   */
  expect(await cellsInA.count()).toBe(4);
  expect(await cellsInB.count()).toBe(4);

  expect(await getCellText(pageB, 0)).toBe('Cell3');
  expect(await getCellText(pageB, 1)).toBe('Cell6');
  expect(await getCellText(pageB, 2)).toBe('Cell7');
  expect(await getCellText(pageB, 3)).toBe('Cell9');
});
