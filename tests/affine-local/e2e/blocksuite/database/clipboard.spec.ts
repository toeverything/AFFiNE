import { test } from '@affine-test/kit/playwright';

import {
  addColumn,
  addRows,
  initDatabaseByOneStep,
  pasteString,
  selectCell,
  verifyCellContents,
} from './utils';

test.describe('Database Clipboard Operations', () => {
  test('paste tab-separated data from Excel into database', async ({
    page,
  }) => {
    // Open the home page and wait for the editor to load
    await initDatabaseByOneStep(page);
    await addColumn(page, 'multi-select');
    // Create a database block with two rows
    await addRows(page, 2);

    // Select the first cell and paste data
    await selectCell(page, 0, false);
    const mockExcelData = 'Cell 1A\tCell 1B\nCell 2A\tCell 2B';
    await pasteString(page, mockExcelData);

    // Verify cell contents
    await verifyCellContents(page, [
      'Cell 1A',
      'Cell 1B',
      'Cell 2A',
      'Cell 2B',
    ]);
  });

  test('handle empty cells when pasting tab-separated data', async ({
    page,
  }) => {
    // Open the home page and wait for the editor to load
    await initDatabaseByOneStep(page);
    await addColumn(page, 'multi-select');
    // Create a database block with two rows
    await addRows(page, 2);

    // Select the first cell and paste data with empty cells
    await selectCell(page, 0, false);
    const mockExcelData = 'Cell 1A\t\nCell 2A\tCell 2B';
    await pasteString(page, mockExcelData);

    // Verify cell contents including empty cells
    await verifyCellContents(page, ['Cell 1A', '', 'Cell 2A', 'Cell 2B']);
  });

  test('handle pasting data larger than selected area', async ({ page }) => {
    // Open the home page and wait for the editor to load
    await initDatabaseByOneStep(page);
    await addColumn(page, 'multi-select');
    // Create a database block with one row
    await addRows(page, 1);

    // Select the first cell and paste data larger than table
    await selectCell(page, 0, false);
    const mockExcelData = 'Cell 1A\tCell 1B\nCell 2A\tCell 2B';
    await pasteString(page, mockExcelData);

    // Verify only the cells that exist are filled
    await verifyCellContents(page, ['Cell 1A', 'Cell 1B']);
  });
});
