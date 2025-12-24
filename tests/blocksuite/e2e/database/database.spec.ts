import { expect } from '@playwright/test';

import {
  dragBetweenCoords,
  enterPlaygroundRoom,
  focusDatabaseTitle,
  getBoundingBox,
  initDatabaseDynamicRowWithData,
  initDatabaseRowWithData,
  initEmptyDatabaseState,
  pressArrowLeft,
  pressArrowRight,
  pressBackspace,
  pressEnter,
  pressEscape,
  pressShiftEnter,
  redoByKeyboard,
  selectAllByKeyboard,
  setInlineRangeInInlineEditor,
  switchReadonly,
  type,
  undoByClick,
  undoByKeyboard,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertBlockProps,
  assertInlineEditorDeltas,
  assertRowCount,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';
import { getFormatBar } from '../utils/query.js';
import {
  assertColumnWidth,
  assertDatabaseCellRichTexts,
  assertDatabaseSearching,
  assertDatabaseTitleText,
  blurDatabaseSearch,
  clickColumnType,
  clickDatabaseOutside,
  focusDatabaseHeader,
  focusDatabaseSearch,
  getDatabaseCell,
  getDatabaseHeaderColumn,
  initDatabaseColumn,
  switchColumnType,
} from './actions.js';

test('edit database block title and create new rows', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  const locator = page.locator('affine-database');
  await expect(locator).toBeVisible();
  const dbTitle = 'Database 1';
  await assertBlockProps(page, '2', {
    title: dbTitle,
  });
  await focusDatabaseTitle(page);
  await selectAllByKeyboard(page);
  await pressBackspace(page);

  const expected = 'hello';
  await type(page, expected);
  await assertBlockProps(page, '2', {
    title: 'hello',
  });
  await undoByKeyboard(page);
  await assertBlockProps(page, '2', {
    title: '',
  });
  await initDatabaseRowWithData(page, '');
  await initDatabaseRowWithData(page, '');
  await assertRowCount(page, 2);
  await waitNextFrame(page, 100);
  await pressEscape(page);
  await undoByClick(page);
  await undoByClick(page);
  await assertRowCount(page, 0);
});

test('edit column title', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page, '1');

  // first added column
  const { column } = await getDatabaseHeaderColumn(page, 1);
  expect(await column.innerText()).toBe('1');

  await undoByClick(page);
  expect(await column.innerText()).toBe('Column');
});

test('should modify the value when the input loses focus', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  await switchColumnType(page, 'Number');
  await initDatabaseDynamicRowWithData(page, '1', true);

  await clickDatabaseOutside(page);
  const cell = getDatabaseCell(page, {
    rowIndex: 0,
    columnType: 'number',
  });
  const text = await cell.textContent();
  expect(text?.trim()).toBe('1');
});

test('should rich-text column support soft enter', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  await switchColumnType(page, 'Text');
  await initDatabaseDynamicRowWithData(page, '123', true);

  // const cell = getDatabaseCell(page, {
  //   rowIndex: 0,
  //   columnType: 'rich-text',
  // });
  // await cell.click();
  await pressEnter(page);
  await pressArrowLeft(page);
  await pressEnter(page);
  await assertDatabaseCellRichTexts(page, { text: '123' });

  await pressEnter(page);
  await pressArrowRight(page);
  await pressArrowLeft(page);
  await pressShiftEnter(page);
  await pressEnter(page);
  await assertDatabaseCellRichTexts(page, { text: '12\n3' });
});

test('should the multi-select mode work correctly', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  await initDatabaseDynamicRowWithData(page, '1', true);
  await pressEscape(page);
  await initDatabaseDynamicRowWithData(page, '2');
  await pressEscape(page);
  const tags = getDatabaseCell(page, {
    rowIndex: 0,
    columnType: 'multi-select',
  }).getByTestId('tag-selected');
  expect(await tags.count()).toBe(2);
  expect(await tags.nth(0).innerText()).toBe('1');
  expect(await tags.nth(1).innerText()).toBe('2');
});

test('should database search work', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  await initDatabaseRowWithData(page, 'text1');
  await initDatabaseDynamicRowWithData(page, '123', false);
  await pressEscape(page);
  await initDatabaseRowWithData(page, 'text2');
  await initDatabaseDynamicRowWithData(page, 'a', false);
  await pressEscape(page);
  await initDatabaseRowWithData(page, 'text3');
  await initDatabaseDynamicRowWithData(page, '26', false);
  await pressEscape(page);
  // search for '2'
  await focusDatabaseSearch(page);
  await type(page, '2');
  const rows = page.locator('.affine-database-block-row');
  expect(await rows.count()).toBe(3);

  // search for '23'
  await type(page, '3');
  expect(await rows.count()).toBe(1);

  const cell = page.locator('.select-selected');
  expect(await cell.innerText()).toBe('123');

  // clear search input
  const closeIcon = page.locator('.close-icon');
  await closeIcon.click();
  expect(await rows.count()).toBe(3);
});

test('should database search input displayed correctly', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await focusDatabaseSearch(page);
  await blurDatabaseSearch(page);
  await assertDatabaseSearching(page, false);

  await focusDatabaseSearch(page);
  await type(page, '2');
  await blurDatabaseSearch(page);
  await assertDatabaseSearching(page, true);

  await focusDatabaseSearch(page);
  await pressBackspace(page);
  await blurDatabaseSearch(page);
  await assertDatabaseSearching(page, false);

  await focusDatabaseSearch(page);
  await type(page, '2');
  const closeIcon = page.locator('.close-icon');
  await closeIcon.click();
  await blurDatabaseSearch(page);
  await assertDatabaseSearching(page, false);

  await focusDatabaseSearch(page);
  await type(page, '2');
  await pressEscape(page);
  await blurDatabaseSearch(page);
  await assertDatabaseSearching(page, false);
});

test('should database title and rich-text support undo/redo', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  await switchColumnType(page, 'Text');
  await initDatabaseDynamicRowWithData(page, '123', true);
  await undoByKeyboard(page);
  await assertDatabaseCellRichTexts(page, { text: '' });
  await pressEscape(page);
  await redoByKeyboard(page);
  await assertDatabaseCellRichTexts(page, { text: '123' });

  await focusDatabaseTitle(page);
  await type(page, 'abc');
  await assertDatabaseTitleText(page, 'Database 1abc');
  await undoByKeyboard(page);
  await assertDatabaseTitleText(page, 'Database 1');
  await redoByKeyboard(page);
  await assertDatabaseTitleText(page, 'Database 1abc');
});

test('should support drag to change column width', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  const headerColumns = page.locator('.affine-database-column');
  const titleColumn = headerColumns.nth(0);
  const normalColumn = headerColumns.nth(1);

  const dragDistance = 100;
  const titleColumnWidth = 260;
  const normalColumnWidth = 180;

  await assertColumnWidth(titleColumn, titleColumnWidth - 1);
  const box = await assertColumnWidth(normalColumn, normalColumnWidth - 1);

  await dragBetweenCoords(
    page,
    { x: box.x, y: box.y },
    { x: box.x + dragDistance, y: box.y },
    {
      steps: 50,
      beforeMouseUp: async () => {
        await waitNextFrame(page);
      },
    }
  );

  await assertColumnWidth(titleColumn, titleColumnWidth + dragDistance);
  await assertColumnWidth(normalColumn, normalColumnWidth - 1);

  await undoByClick(page);
  await assertColumnWidth(titleColumn, titleColumnWidth - 1);
  await assertColumnWidth(normalColumn, normalColumnWidth - 1);
});

test('should display the add column button on the right side of database correctly', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  const normalColumn = page.locator('.affine-database-column').nth(1);

  const addColumnBtn = page.locator('.header-add-column-button');

  const box = await getBoundingBox(normalColumn);
  await dragBetweenCoords(
    page,
    { x: box.x, y: box.y },
    { x: box.x + 400, y: box.y },
    {
      steps: 50,
      beforeMouseUp: async () => {
        await waitNextFrame(page);
      },
    }
  );
  await focusDatabaseHeader(page);
  await expect(addColumnBtn).toBeVisible();
});

test('should support drag and drop to move columns', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page, 'column1');
  await initDatabaseColumn(page, 'column2');
  await initDatabaseColumn(page, 'column3');

  const column1 = await focusDatabaseHeader(page, 1);
  const moveIcon = column1.locator('.affine-database-column-move');
  const moveIconBox = await getBoundingBox(moveIcon);
  const x = moveIconBox.x + moveIconBox.width / 2;
  const y = moveIconBox.y + moveIconBox.height / 2;

  await dragBetweenCoords(
    page,
    { x, y },
    { x: x + 100, y },
    {
      steps: 50,
      beforeMouseUp: async () => {
        await waitNextFrame(page);
        const indicator = page.locator('.vertical-indicator').first();
        await expect(indicator).toBeVisible();

        const { box } = await getDatabaseHeaderColumn(page, 2);
        const indicatorBox = await getBoundingBox(indicator);
        expect(box.x + box.width - indicatorBox.x < 10).toBe(true);
      },
    }
  );

  const { text } = await getDatabaseHeaderColumn(page, 2);
  expect(text).toBe('column1');
});

test('should title column support quick renaming', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  await initDatabaseDynamicRowWithData(page, 'a', true);
  await pressEscape(page);
  await focusDatabaseHeader(page, 1);
  const { textElement } = await getDatabaseHeaderColumn(page, 1);
  await textElement.click();
  await waitNextFrame(page);
  await selectAllByKeyboard(page);
  await type(page, '123');
  await pressEnter(page);
  expect(await textElement.innerText()).toBe('123');

  await undoByClick(page);
  expect(await textElement.innerText()).toBe('Column');
  await textElement.click();
  await waitNextFrame(page);
  await selectAllByKeyboard(page);
  await type(page, '123');
  await pressEnter(page);
  expect(await textElement.innerText()).toBe('123');
});

test('should title column support quick changing of column type', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  await initDatabaseDynamicRowWithData(page, 'a', true);
  await pressEscape(page);
  await initDatabaseDynamicRowWithData(page, 'b');
  await pressEscape(page);
  await focusDatabaseHeader(page, 1);
  const { typeIcon } = await getDatabaseHeaderColumn(page, 1);
  await typeIcon.click();
  await waitNextFrame(page);
  await clickColumnType(page, 'Select');
  const cell = getDatabaseCell(page, {
    rowIndex: 0,
    columnType: 'select',
  });
  expect(await cell.count()).toBe(1);
});

test('database format-bar in header and text column', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyDatabaseState(page);

  await initDatabaseColumn(page);
  await switchColumnType(page, 'Text');
  await initDatabaseDynamicRowWithData(page, 'column', true);
  await pressArrowLeft(page);
  await pressEnter(page);
  await type(page, 'header');
  // Title  | Column1
  // ----------------
  // header | column

  const formatBar = getFormatBar(page);
  await setInlineRangeInInlineEditor(page, { index: 1, length: 4 }, 1);
  expect(await formatBar.formatBar.isVisible()).toBe(true);
  // Title    | Column1
  // ----------------
  // h|eade|r | column

  await assertInlineEditorDeltas(
    page,
    [
      {
        insert: 'header',
      },
    ],
    1
  );
  await formatBar.boldBtn.click();
  await assertInlineEditorDeltas(
    page,
    [
      {
        insert: 'h',
      },
      {
        insert: 'eade',
        attributes: {
          bold: true,
        },
      },
      {
        insert: 'r',
      },
    ],
    1
  );

  await pressEscape(page);
  await pressArrowRight(page);
  await pressEnter(page);
  await setInlineRangeInInlineEditor(page, { index: 2, length: 2 }, 2);
  expect(await formatBar.formatBar.isVisible()).toBe(true);
  // Title  | Column1
  // ----------------
  // header | co|lu|mn

  await assertInlineEditorDeltas(
    page,
    [
      {
        insert: 'column',
      },
    ],
    2
  );
  await formatBar.boldBtn.click();
  await assertInlineEditorDeltas(
    page,
    [
      {
        insert: 'co',
      },
      {
        insert: 'lu',
        attributes: {
          bold: true,
        },
      },
      {
        insert: 'mn',
      },
    ],
    2
  );
});

test.describe('readonly mode', () => {
  test('database title should not be edited in readonly mode', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    const locator = page.locator('affine-database');
    await expect(locator).toBeVisible();

    const dbTitle = 'Database 1';
    await assertBlockProps(page, '2', {
      title: dbTitle,
    });

    await focusDatabaseTitle(page);
    await selectAllByKeyboard(page);
    await pressBackspace(page);

    await type(page, 'hello');
    await assertBlockProps(page, '2', {
      title: 'hello',
    });

    await switchReadonly(page);

    await type(page, ' world');
    await assertBlockProps(page, '2', {
      title: 'hello',
    });

    await pressBackspace(page, 'hello world'.length);
    await assertBlockProps(page, '2', {
      title: 'hello',
    });
  });

  test('should rich-text not be edited in readonly mode', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await switchColumnType(page, 'Text');
    await initDatabaseDynamicRowWithData(page, '', true);

    await pressEnter(page);
    await type(page, '123');
    await waitNextFrame(page, 100);
    await pressEnter(page);
    await waitNextFrame(page, 100);
    await assertDatabaseCellRichTexts(page, { text: '123' });

    await switchReadonly(page);
    await waitNextFrame(page);
    await pressEnter(page);
    await pressBackspace(page);
    await type(page, '789');
    await assertDatabaseCellRichTexts(page, { text: '123' });
  });

  test('should hide edit widget after switch to readonly mode', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await switchColumnType(page, 'Text');
    await initDatabaseDynamicRowWithData(page, '', true);

    const database = page.locator('affine-database');
    await expect(database).toBeVisible();

    const databaseMenu = database.getByTestId('database-ops');
    await expect(databaseMenu).toBeVisible();

    const addViewButton = database.getByTestId('database-add-view-button');
    await expect(addViewButton).toBeVisible();

    const titleHeader = page.locator('affine-database-header-column').filter({
      hasText: 'Title',
    });
    await titleHeader.hover();
    const columnDragBar = titleHeader.locator('.control-r');
    await expect(columnDragBar).toBeVisible();

    const filter = database.locator('data-view-header-tools-filter');
    const search = database.locator('data-view-header-tools-search');
    const options = database.locator('data-view-header-tools-view-options');
    const headerAddRow = database.locator('data-view-header-tools-add-row');

    await database.hover();
    await expect(filter).toBeVisible();
    await expect(search).toBeVisible();
    await expect(options).toBeVisible();
    await expect(headerAddRow).toBeVisible();

    const row = database.locator('data-view-table-row');
    const rowOptions = row.locator('.row-op');
    const rowDragBar = row.locator('.data-view-table-view-drag-handler>div');
    await row.hover();
    await expect(rowOptions).toHaveCount(2);
    await expect(rowOptions.nth(0)).toBeVisible();
    await expect(rowOptions.nth(1)).toBeVisible();
    await expect(rowDragBar).toBeVisible();

    const addRow = database.locator('.data-view-table-group-add-row');
    await expect(addRow).toBeVisible();

    // Readonly Mode
    {
      await switchReadonly(page);
      await expect(databaseMenu).toBeHidden();
      await expect(addViewButton).toBeHidden();

      await titleHeader.hover();
      await expect(columnDragBar).toBeHidden();

      await database.hover();
      await expect(filter).toBeHidden();
      await expect(search).toBeVisible(); // Note the search should not be hidden
      await expect(options).toBeHidden();
      await expect(headerAddRow).toBeHidden();

      await row.hover();
      await expect(rowOptions.nth(0)).toBeHidden();
      await expect(rowOptions.nth(1)).toBeHidden();
      await expect(rowDragBar).toBeHidden();

      await expect(addRow).toBeHidden();
    }
  });

  test('should hide focus border after switch to readonly mode', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await switchColumnType(page, 'Text');
    await initDatabaseDynamicRowWithData(page, '', true);

    const database = page.locator('affine-database');
    await expect(database).toBeVisible();

    const cell = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'rich-text',
    });
    await cell.click();

    const focusBorder = database.locator(
      'data-view-table-selection .database-focus'
    );
    await expect(focusBorder).toBeVisible();

    await switchReadonly(page);
    await expect(focusBorder).toBeHidden();
  });

  test('should hide selection after switch to readonly mode', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await switchColumnType(page, 'Text');
    await initDatabaseDynamicRowWithData(page, '', true);

    const database = page.locator('affine-database');
    await expect(database).toBeVisible();

    const startCell = getDatabaseCell(page, {
      rowIndex: 0,
      columnIndex: 0,
    });
    const endCell = getDatabaseCell(page, {
      rowIndex: 0,
      columnIndex: 1,
    });

    const startBox = await getBoundingBox(startCell);
    const endBox = await getBoundingBox(endCell);

    const startX = startBox.x + startBox.width / 2;
    const startY = startBox.y + startBox.height / 2;
    const endX = endBox.x + endBox.width / 2;
    const endY = endBox.y + endBox.height / 2;

    await dragBetweenCoords(
      page,
      { x: startX, y: startY },
      { x: endX, y: endY }
    );

    const selection = database.locator(
      'data-view-table-selection .database-selection'
    );

    await expect(selection).toBeVisible();

    await switchReadonly(page);
    await expect(selection).toBeHidden();
  });
});
