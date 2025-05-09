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
 * This test suite validates the edge case functionality of table insertion operations.
 * It tests insertion at boundaries of the table, such as:
 * - Insert Left at the first column
 * - Insert Above at the first row
 * - Insert Right at the last column
 * - Insert Below at the last row
 */
test.describe('Table edge case insertion operations', () => {
  test('should correctly insert at edges', async ({ page }) => {
    // Setup: Create a new page with a table
    await openHomePage(page);
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    await page.keyboard.press('Enter');

    // Create a simple table with default 2x2 cells
    await createTable(page);
    const table = page.locator('affine-table');
    await expect(table).toBeVisible();

    // Wait for table rendering to complete
    await waitNextFrame(page);

    // Initialize all cell contents
    const cells = table.locator('affine-table-cell');
    expect(await cells.count()).toBe(4);

    // Clear and set cell contents
    for (let i = 0; i < 4; i++) {
      const cell = cells.nth(i);
      await cell.click({ clickCount: 3 }); // Select all content in the cell
      await page.keyboard.press('Backspace'); // Clear content
      await page.keyboard.type(`Cell${i + 1}`); // Input new content
      await waitNextFrame(page);
    }

    // Verify initial cell contents
    expect(await getCellText(page, 0)).toBe('Cell1');
    expect(await getCellText(page, 1)).toBe('Cell2');

    // Edge case 1: Insert to the left of the first column
    // Hover over the first column to make the column options button visible
    await cells.nth(0).hover();
    await waitNextFrame(page);

    // Click on the column options button to open the column options menu
    const columnOptionButton = table
      .locator('[data-testid="drag-column-handle"]')
      .first();
    await expect(columnOptionButton).toBeVisible();
    await columnOptionButton.click();

    // Click on the "Insert Left" option in the menu
    const menu = page.locator('affine-menu');
    await expect(menu).toBeVisible();
    await menu.getByText('Insert Left').click();
    await waitNextFrame(page);

    // Verify: Now we should have 6 cells (3x2 table)
    const cellsAfterLeftEdgeInsert = table.locator('affine-table-cell');
    expect(await cellsAfterLeftEdgeInsert.count()).toBe(6);

    // Input text to verify insertion position
    const leftEdgeCell = cellsAfterLeftEdgeInsert.nth(0);
    await leftEdgeCell.click({ clickCount: 3 }); // Select all content
    await page.keyboard.press('Backspace'); // Clear content
    await page.keyboard.type('Left Edge');
    await waitNextFrame(page);

    // Verify first row values: Left Edge, Cell1, Cell2
    expect(await getCellText(page, 0)).toBe('Left Edge');

    // Fix: Re-get and verify second column content
    const secondCell = cellsAfterLeftEdgeInsert.nth(1);
    await secondCell.click({ clickCount: 3 }); // Select all content
    await page.keyboard.press('Backspace'); // Clear content
    await page.keyboard.type('Cell1'); // Re-input
    await waitNextFrame(page);

    expect(await getCellText(page, 1)).toBe('Cell1');

    // Fix: Re-get and verify third column content
    const thirdCell = cellsAfterLeftEdgeInsert.nth(2);
    await thirdCell.click({ clickCount: 3 }); // Select all content
    await page.keyboard.press('Backspace'); // Clear content
    await page.keyboard.type('Cell2'); // Re-input
    await waitNextFrame(page);

    expect(await getCellText(page, 2)).toBe('Cell2');

    // Edge case 2: Insert above the first row
    // Hover over the first row to make the row options button visible
    await cellsAfterLeftEdgeInsert.nth(0).hover();
    await waitNextFrame(page);

    // Click on the row options button to open the row options menu
    const rowOptionButton = table
      .locator('[data-testid="drag-row-handle"]')
      .first();
    await expect(rowOptionButton).toBeVisible();
    await rowOptionButton.click();

    // Click on the "Insert Above" option in the menu
    await expect(menu).toBeVisible();
    await menu.getByText('Insert Above').click();
    await waitNextFrame(page);

    // Verify: Now we should have 9 cells (3x3 table)
    const cellsAfterAboveEdgeInsert = table.locator('affine-table-cell');
    expect(await cellsAfterAboveEdgeInsert.count()).toBe(9);

    // Input text to verify insertion position
    const aboveEdgeCell = cellsAfterAboveEdgeInsert.nth(0);
    await aboveEdgeCell.click({ clickCount: 3 }); // Select all content
    await page.keyboard.press('Backspace'); // Clear content
    await page.keyboard.type('Above Edge');
    await waitNextFrame(page);

    // Verify first row first column value
    expect(await getCellText(page, 0)).toBe('Above Edge');

    // Verify second row first column value (previously the first row first column)
    expect(await getCellText(page, 3)).toBe('Left Edge');

    // Edge case 3: Insert to the right of the last column
    // Hover over the last column to make the column options button visible
    const lastColumnCell = cellsAfterAboveEdgeInsert.nth(2);
    await lastColumnCell.hover();
    await waitNextFrame(page);

    // Click on the last column's options button
    const lastColumnOptionButton = table
      .locator('[data-testid="drag-column-handle"]')
      .nth(2);
    await expect(lastColumnOptionButton).toBeVisible();
    await lastColumnOptionButton.click();

    // Click on the "Insert Right" option in the menu
    await expect(menu).toBeVisible();
    await menu.getByText('Insert Right').click();
    await waitNextFrame(page);

    // Verify: Now we should have 12 cells (4x3 table)
    const cellsAfterRightEdgeInsert = table.locator('affine-table-cell');
    expect(await cellsAfterRightEdgeInsert.count()).toBe(12);

    // Input text to verify insertion position
    const rightEdgeCell = cellsAfterRightEdgeInsert.nth(3);
    await rightEdgeCell.click({ clickCount: 3 }); // Select all content
    await page.keyboard.press('Backspace'); // Clear content
    await page.keyboard.type('Right Edge');
    await waitNextFrame(page);

    // Verify first row last column value
    expect(await getCellText(page, 3)).toBe('Right Edge');

    // Edge case 4: Insert below the last row
    // Find the first cell of the last row
    const lastRowCell = cellsAfterRightEdgeInsert.nth(8); // Row 3, Column 1
    await lastRowCell.hover();
    await waitNextFrame(page);

    // Click on the last row's options button
    const lastRowOptionButton = table
      .locator('[data-testid="drag-row-handle"]')
      .nth(2);
    await expect(lastRowOptionButton).toBeVisible();
    await lastRowOptionButton.click();

    // Click on the "Insert Below" option in the menu
    await expect(menu).toBeVisible();
    await menu.getByText('Insert Below').click();
    await waitNextFrame(page);

    // Verify: Now we should have 16 cells (4x4 table)
    const cellsAfterBelowEdgeInsert = table.locator('affine-table-cell');
    expect(await cellsAfterBelowEdgeInsert.count()).toBe(16);

    // Input text to verify insertion position
    const belowEdgeCell = cellsAfterBelowEdgeInsert.nth(12); // Row 4, Column 1
    await belowEdgeCell.click({ clickCount: 3 }); // Select all content
    await page.keyboard.press('Backspace'); // Clear content
    await page.keyboard.type('Below Edge');
    await waitNextFrame(page);

    // Verify last row first column value
    expect(await getCellText(page, 12)).toBe('Below Edge');
  });
});
