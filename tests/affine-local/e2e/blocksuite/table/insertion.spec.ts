import { waitNextFrame } from '@affine-test/kit/bs/misc';
import { createTable, getCellText } from '@affine-test/kit/bs/table';
import { test } from '@affine-test/kit/playwright';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect } from '@playwright/test';

/**
 * This test suite validates the correct functionality of table insertion operations.
 * It tests Insert Left, Insert Right, Insert Above, and Insert Below operations
 * to verify they correctly insert rows and columns in the expected positions.
 */
test.describe('Table insertion operations', () => {
  test('should correctly insert columns', async ({ page }) => {
    // Setup: Create a new page with a table
    await openHomePage(page);
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    await page.keyboard.press('Enter');

    // Create a simple table with default 2x2 cells
    await createTable(page);
    const table = page.locator('affine-table');
    await expect(table).toBeVisible();

    // Verify initial table structure (2x2)
    const initialCells = table.locator('affine-table-cell');
    expect(await initialCells.count()).toBe(4);

    // Hover over the first cell to make the column options button visible
    await initialCells.nth(0).hover();
    await waitNextFrame(page);

    // Click on the column options button (three dots icon) to open the column options menu
    const columnOptionButton = table
      .locator('[data-testid="drag-column-handle"]')
      .first();
    await expect(columnOptionButton).toBeVisible();
    await columnOptionButton.click();

    // Click on the "Insert Right" option in the menu
    const menu = page.locator('affine-menu');
    await expect(menu).toBeVisible();
    await menu.getByText('Insert Right').click();
    await waitNextFrame(page);

    // Verify: Now we should have 6 cells (3x2 table)
    const cellsAfterRightInsert = table.locator('affine-table-cell');
    expect(await cellsAfterRightInsert.count()).toBe(6);

    // Input text in the newly inserted column to verify its position
    // After inserting right of column 0, our new cell should be at position 1
    await getCellText(page, 0); // Wait for cell to be ready
    const newColumnCell = cellsAfterRightInsert.nth(1);
    await newColumnCell.hover();
    await waitNextFrame(page);
    await newColumnCell.click();
    await page.keyboard.type('New Right');

    // Verify values in row 0: Cell1, New Right, Cell2
    expect(await getCellText(page, 0)).toBe('Cell1');
    expect(await getCellText(page, 1)).toBe('New Right');
    expect(await getCellText(page, 2)).toBe('Cell2');

    // Hover over the first column again to make the column options button visible
    await cellsAfterRightInsert.nth(0).hover();
    await waitNextFrame(page);

    // Click on the column options button to open the column options menu
    await expect(columnOptionButton).toBeVisible();
    await columnOptionButton.click();

    // Click on the "Insert Left" option in the menu
    await expect(menu).toBeVisible();
    await menu.getByText('Insert Left').click();
    await waitNextFrame(page);

    // Verify: Now we should have 8 cells (4x2 table)
    const cellsAfterLeftInsert = table.locator('affine-table-cell');
    expect(await cellsAfterLeftInsert.count()).toBe(8);

    // Input text in the newly inserted column
    await getCellText(page, 0); // Wait for cell to be ready
    const leftColumnCell = cellsAfterLeftInsert.nth(0);
    await leftColumnCell.hover();
    await waitNextFrame(page);
    await leftColumnCell.click();
    await page.keyboard.type('New Left');

    // Verify values in row 0: New Left, Cell1, New Right, Cell2
    expect(await getCellText(page, 0)).toBe('New Left');
    expect(await getCellText(page, 1)).toBe('Cell1');
    expect(await getCellText(page, 2)).toBe('New Right');
    expect(await getCellText(page, 3)).toBe('Cell2');
  });

  test('should correctly insert rows', async ({ page }) => {
    // Setup: Create a new page with a table
    await openHomePage(page);
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    await page.keyboard.press('Enter');

    // Create a simple table with default 2x2 cells
    await createTable(page);
    const table = page.locator('affine-table');
    await expect(table).toBeVisible();

    // Verify initial table structure (2x2)
    const initialCells = table.locator('affine-table-cell');
    expect(await initialCells.count()).toBe(4);

    // Hover over the first cell to make the row options button visible
    await initialCells.nth(0).hover();
    await waitNextFrame(page);

    // Click on the row options button (three dots icon) to open the row options menu
    const rowOptionButton = table
      .locator('[data-testid="drag-row-handle"]')
      .first();
    await expect(rowOptionButton).toBeVisible();
    await rowOptionButton.click();

    // Click on the "Insert Below" option in the menu
    const menu = page.locator('affine-menu');
    await expect(menu).toBeVisible();
    await menu.getByText('Insert Below').click();
    await waitNextFrame(page);

    // Verify: Now we should have 6 cells (2x3 table)
    const cellsAfterBelowInsert = table.locator('affine-table-cell');
    expect(await cellsAfterBelowInsert.count()).toBe(6);

    // Input text in the newly inserted row
    await getCellText(page, 2); // Wait for cell to be ready
    const newRowCell1 = cellsAfterBelowInsert.nth(2);
    await newRowCell1.hover();
    await waitNextFrame(page);
    await newRowCell1.click();
    await page.keyboard.type('New Below 1');

    await getCellText(page, 3); // Wait for cell to be ready
    const newRowCell2 = cellsAfterBelowInsert.nth(3);
    await newRowCell2.hover();
    await waitNextFrame(page);
    await newRowCell2.click();
    await page.keyboard.type('New Below 2');

    // Verify values: First row: Cell1, Cell2; Second row: New Below 1, New Below 2; Third row: Cell3, Cell4
    expect(await getCellText(page, 0)).toBe('Cell1');
    expect(await getCellText(page, 1)).toBe('Cell2');
    expect(await getCellText(page, 2)).toBe('New Below 1');
    expect(await getCellText(page, 3)).toBe('New Below 2');
    expect(await getCellText(page, 4)).toBe('Cell3');
    expect(await getCellText(page, 5)).toBe('Cell4');

    // Hover over the first row again to make the row options button visible
    await cellsAfterBelowInsert.nth(0).hover();
    await waitNextFrame(page);

    // Click on the row options button to open the row options menu
    await expect(rowOptionButton).toBeVisible();
    await rowOptionButton.click();

    // Click on the "Insert Above" option in the menu
    await expect(menu).toBeVisible();
    await menu.getByText('Insert Above').click();
    await waitNextFrame(page);

    // Verify: Now we should have 8 cells (2x4 table)
    const cellsAfterAboveInsert = table.locator('affine-table-cell');
    expect(await cellsAfterAboveInsert.count()).toBe(8);

    // Input text in the newly inserted row
    await getCellText(page, 0); // Wait for cell to be ready
    const aboveRowCell1 = cellsAfterAboveInsert.nth(0);
    await aboveRowCell1.hover();
    await waitNextFrame(page);
    await aboveRowCell1.click();
    await page.keyboard.type('New Above 1');

    await getCellText(page, 1); // Wait for cell to be ready
    const aboveRowCell2 = cellsAfterAboveInsert.nth(1);
    await aboveRowCell2.hover();
    await waitNextFrame(page);
    await aboveRowCell2.click();
    await page.keyboard.type('New Above 2');

    // Verify the first row contains our new values
    expect(await getCellText(page, 0)).toBe('New Above 1');
    expect(await getCellText(page, 1)).toBe('New Above 2');
    expect(await getCellText(page, 2)).toBe('Cell1');
    expect(await getCellText(page, 3)).toBe('Cell2');
  });
});
