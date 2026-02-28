import { expect } from '@playwright/test';

import { dragBetweenCoords } from '../utils/actions/drag.js';
import { shiftClick } from '../utils/actions/edgeless.js';
import {
  pressArrowDown,
  pressArrowDownWithShiftKey,
  pressArrowLeft,
  pressArrowRight,
  pressArrowUp,
  pressArrowUpWithShiftKey,
  pressBackspace,
  pressEnter,
  pressEscape,
  type,
} from '../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  getBoundingBox,
  initDatabaseDynamicRowWithData,
  initDatabaseRowWithData,
  initEmptyDatabaseState,
  initKanbanViewState,
  waitNextFrame,
} from '../utils/actions/misc.js';
import { test } from '../utils/playwright.js';
import {
  assertCellsSelection,
  assertDatabaseTitleColumnText,
  assertKanbanCardHeaderText,
  assertKanbanCardSelected,
  assertKanbanCellSelected,
  assertRowsSelection,
  clickKanbanCardHeader,
  focusKanbanCardHeader,
  getDatabaseCell,
  getKanbanCard,
  initDatabaseColumn,
  switchColumnType,
} from './actions.js';

test.describe('focus', () => {
  test('should support move focus by arrow key', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123', true);
    await pressEscape(page);
    await waitNextFrame(page, 100);
    await pressEscape(page);
    await assertRowsSelection(page, [0, 0]);
  });

  test('should support multi row selection', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '', true);
    await pressEscape(page);
    await switchColumnType(page, 'Number');
    await initDatabaseDynamicRowWithData(page, '123', true);

    const selectColumn = getDatabaseCell(page, {
      rowIndex: 1,
      columnIndex: 1,
    });

    const endBox = await getBoundingBox(selectColumn);
    const endX = endBox.x + endBox.width / 2;

    await dragBetweenCoords(
      page,
      { x: endX, y: endBox.y },
      { x: endX, y: endBox.y + endBox.height }
    );
    await pressEscape(page);
    await assertRowsSelection(page, [0, 1]);
  });

  test('should support row selection with dynamic height', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123123', true);
    await type(page, '456456');
    await pressEnter(page);
    await type(page, 'abcabc');
    await pressEnter(page);
    await type(page, 'defdef');
    await pressEnter(page);
    await pressEscape(page);

    await pressEscape(page);
    await assertRowsSelection(page, [0, 0]);
  });
});

test.describe('row-level selection', () => {
  test('should support title selection', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseRowWithData(page, 'title');
    await waitNextFrame(page, 100);
    await assertCellsSelection(page, {
      start: [0, 0],
    });

    await pressEscape(page);
    await assertRowsSelection(page, [0, 0]);
  });

  test('should support pressing esc to trigger row selection', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123', true);
    await waitNextFrame(page, 100);
    await pressEscape(page);
    await assertRowsSelection(page, [0, 0]);
  });

  test('should support multi row selection', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await switchColumnType(page, 'Number');
    await initDatabaseDynamicRowWithData(page, 'asd', true);
    await initDatabaseDynamicRowWithData(page, '123', true);

    const selectColumn = getDatabaseCell(page, {
      rowIndex: 1,
      columnIndex: 1,
    });

    const endBox = await getBoundingBox(selectColumn);
    const endX = endBox.x + endBox.width / 2;

    await dragBetweenCoords(
      page,
      { x: endX, y: endBox.y },
      { x: endX, y: endBox.y + endBox.height }
    );
    await pressEscape(page);
    await assertRowsSelection(page, [0, 1]);
  });

  test('should support row selection with dynamic height', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123123', true);
    await type(page, '456456');
    await pressEnter(page);
    await type(page, 'abcabc');
    await pressEnter(page);
    await type(page, 'defdef');
    await pressEnter(page);
    await pressEscape(page);

    await pressEscape(page);
    await assertRowsSelection(page, [0, 0]);
  });

  test('move row selection with (up | down)', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);

    // add two rows
    await initDatabaseDynamicRowWithData(page, '123123', true);
    await pressEscape(page);

    await initDatabaseDynamicRowWithData(page, '123123', true);
    await pressEscape(page);

    await pressEscape(page); // switch to row selection

    await assertRowsSelection(page, [1, 1]);

    await pressArrowUp(page);
    await assertRowsSelection(page, [0, 0]);

    // should not allow under selection
    await pressArrowUp(page);
    await assertRowsSelection(page, [0, 0]);

    await pressArrowDown(page);
    await assertRowsSelection(page, [1, 1]);

    // should not allow over selection
    await pressArrowDown(page);
    await assertRowsSelection(page, [1, 1]);
  });

  test('increment decrement row selection with shift+(up | down)', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);

    // add two rows
    await initDatabaseDynamicRowWithData(page, '123123', true);
    await pressEscape(page);

    await initDatabaseDynamicRowWithData(page, '123123', true);
    await pressEscape(page);

    await pressEscape(page); // switch to row selection

    await pressArrowUpWithShiftKey(page);
    await assertRowsSelection(page, [0, 1]);

    await pressArrowDownWithShiftKey(page);
    await assertRowsSelection(page, [1, 1]); // should decrement back

    await pressArrowUp(page); // go to first row

    await pressArrowDownWithShiftKey(page);
    await assertRowsSelection(page, [0, 1]);

    await pressArrowUpWithShiftKey(page);
    await assertRowsSelection(page, [0, 0]);
  });
});

test.describe('cell-level selection', () => {
  test('should support multi cell selection', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '', true);
    await pressEscape(page);
    await switchColumnType(page, 'Number');
    await initDatabaseDynamicRowWithData(page, '123', true);

    const startCell = getDatabaseCell(page, {
      rowIndex: 0,
      columnIndex: 0,
    });
    const endCell = getDatabaseCell(page, {
      rowIndex: 1,
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

    await assertCellsSelection(page, {
      start: [0, 0],
      end: [1, 1],
    });
  });

  test("should support backspace key to delete cell's content", async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseRowWithData(page, 'row1');
    await initDatabaseDynamicRowWithData(page, 'abc', false);
    await pressEscape(page);
    await initDatabaseRowWithData(page, 'row2');
    await initDatabaseDynamicRowWithData(page, '123', false);
    await pressEscape(page);

    const startCell = getDatabaseCell(page, {
      rowIndex: 0,
      columnIndex: 0,
    });
    const endCell = getDatabaseCell(page, {
      rowIndex: 1,
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

    await pressBackspace(page);
    await assertDatabaseTitleColumnText(page, '', 0);
    await assertDatabaseTitleColumnText(page, '', 1);
    const selectCell1 = getDatabaseCell(page, {
      rowIndex: 0,
      columnIndex: 1,
    });
    expect(await selectCell1.innerText()).toBe('');
    const selectCell2 = getDatabaseCell(page, {
      rowIndex: 1,
      columnIndex: 1,
    });
    expect(await selectCell2.innerText()).toBe('');
  });
});

test.describe('kanban view selection', () => {
  test("should support move cell's focus by arrow key(up&down) within a card", async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initKanbanViewState(page, {
      rows: ['row1'],
      columns: [
        {
          type: 'number',
          value: [1],
        },
        {
          type: 'rich-text',
          value: ['text'],
        },
      ],
    });

    await focusKanbanCardHeader(page);
    await assertKanbanCellSelected(page, {
      // group by `number` column, `Ungroups` is hidden because it's empty (hideEmpty: true by default)
      // so the first visible group is the one with value "1" at groupIndex: 0
      groupIndex: 0,
      cardIndex: 0,
      cellIndex: 0,
    });

    await pressArrowDown(page, 3);
    await assertKanbanCellSelected(page, {
      groupIndex: 0,
      cardIndex: 0,
      cellIndex: 0,
    });

    await pressArrowUp(page);
    await assertKanbanCellSelected(page, {
      groupIndex: 0,
      cardIndex: 0,
      cellIndex: 2,
    });
  });

  test("should support move cell's focus by arrow key(up&down) within multi cards", async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initKanbanViewState(page, {
      rows: ['row1', 'row2'],
      columns: [
        {
          type: 'number',
          // Both rows have value 1 to put them in the same group
          value: [1, 1],
        },
        {
          type: 'rich-text',
          value: ['text'],
        },
      ],
    });

    await focusKanbanCardHeader(page);
    await pressArrowUp(page);
    await assertKanbanCellSelected(page, {
      // `Ungroups` is hidden because it's empty (hideEmpty: true by default)
      // so the first visible group is "1" at groupIndex: 0
      groupIndex: 0,
      cardIndex: 1,
      cellIndex: 2,
    });

    await pressArrowDown(page);
    await assertKanbanCellSelected(page, {
      groupIndex: 0,
      cardIndex: 0,
      cellIndex: 0,
    });
  });

  test("should support move cell's focus by arrow key(left&right)", async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initKanbanViewState(page, {
      rows: ['row1', 'row2', 'row3'],
      columns: [
        {
          type: 'number',
          value: [undefined, 1, 10],
        },
      ],
    });

    await focusKanbanCardHeader(page);

    await pressArrowRight(page, 3);
    await assertKanbanCellSelected(page, {
      groupIndex: 0,
      cardIndex: 0,
      cellIndex: 0,
    });

    await pressArrowLeft(page);
    await assertKanbanCellSelected(page, {
      groupIndex: 2,
      cardIndex: 0,
      cellIndex: 0,
    });
  });

  test("should support move card's focus by arrow key(up&down)", async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initKanbanViewState(page, {
      rows: ['row1', 'row2', 'row3'],
      columns: [
        {
          type: 'number',
          value: [undefined, undefined, undefined],
        },
      ],
    });

    await focusKanbanCardHeader(page);
    await pressEscape(page);
    await pressEscape(page);
    await assertKanbanCardSelected(page, {
      groupIndex: 0,
      cardIndex: 0,
    });

    await pressArrowDown(page, 3);
    await assertKanbanCardSelected(page, {
      groupIndex: 0,
      cardIndex: 0,
    });

    await pressArrowUp(page);
    await assertKanbanCardSelected(page, {
      groupIndex: 0,
      cardIndex: 2,
    });
  });

  test("should support move card's focus by arrow key(left&right)", async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initKanbanViewState(page, {
      rows: ['row1', 'row2', 'row3'],
      columns: [
        {
          type: 'number',
          value: [undefined, 1, 10],
        },
      ],
    });

    await focusKanbanCardHeader(page);
    await pressEscape(page);
    await pressEscape(page);

    await pressArrowRight(page, 3);
    await assertKanbanCardSelected(page, {
      groupIndex: 0,
      cardIndex: 0,
    });

    await pressArrowLeft(page);
    await assertKanbanCardSelected(page, {
      groupIndex: 2,
      cardIndex: 0,
    });
  });

  test('should support multi card selection', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initKanbanViewState(page, {
      rows: ['row1', 'row2'],
      columns: [
        {
          type: 'number',
          value: [undefined, 1],
        },
      ],
    });

    await focusKanbanCardHeader(page);
    await pressEscape(page);
    await pressEscape(page);

    const card = getKanbanCard(page, {
      groupIndex: 1,
      cardIndex: 0,
    });
    const box = await getBoundingBox(card);
    await shiftClick(page, {
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });

    await assertKanbanCardSelected(page, {
      groupIndex: 0,
      cardIndex: 0,
    });
    await assertKanbanCardSelected(page, {
      groupIndex: 1,
      cardIndex: 0,
    });
  });

  test("should support move cursor in card's title by arrow key(left&right)", async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initKanbanViewState(page, {
      rows: ['row1'],
      columns: [
        {
          type: 'rich-text',
          value: ['text'],
        },
      ],
    });

    await clickKanbanCardHeader(page);
    await type(page, 'abc');
    await pressArrowLeft(page, 2);
    await pressArrowRight(page);
    await pressBackspace(page);
    await pressEscape(page);

    await assertKanbanCardHeaderText(page, 'row1ac');
  });
});
