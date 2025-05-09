import { expect } from '@playwright/test';

import { dragBetweenCoords } from '../utils/actions/drag.js';
import {
  copyByKeyboard,
  pasteByKeyboard,
  pressArrowDown,
  pressArrowUp,
  pressEnter,
  pressEscape,
  type,
} from '../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  getBoundingBox,
  initDatabaseDynamicRowWithData,
  initDatabaseRowWithData,
  initEmptyDatabaseState,
  initEmptyDatabaseWithParagraphState,
  waitNextFrame,
} from '../utils/actions/misc.js';
import { assertRichTexts } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';
import {
  assertDatabaseTitleColumnText,
  getDatabaseCell,
  getElementStyle,
  initDatabaseColumn,
  switchColumnType,
} from './actions.js';

test.describe('copy&paste when editing', () => {
  test.skip('should support copy&paste of the title column', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseWithParagraphState(page);

    await initDatabaseColumn(page);
    await initDatabaseRowWithData(page, 'abc123');
    await pressEscape(page);

    await pressEnter(page);
    await page.keyboard.down('Shift');
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('ArrowLeft');
    }
    await page.keyboard.up('Shift');
    await copyByKeyboard(page);

    const bgValue = await getElementStyle(page, '.database-focus', 'boxShadow');
    expect(bgValue).not.toBe('unset');

    await focusRichText(page, 1);
    await pasteByKeyboard(page);
    await assertRichTexts(page, ['Database 1', 'c123']);
  });
});

test.describe('copy&paste when selecting', () => {
  test.skip('should support copy&paste of a single cell', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseRowWithData(page, 'abc123');
    await initDatabaseRowWithData(page, '');
    await pressEscape(page);
    await waitNextFrame(page, 100);
    await pressArrowUp(page);

    await copyByKeyboard(page);
    await pressArrowDown(page);
    await pasteByKeyboard(page, false);
    await waitNextFrame(page);
    await assertDatabaseTitleColumnText(page, 'abc123', 1);
  });

  test.skip('should support copy&paste of multi cells', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseRowWithData(page, 'text1');
    await initDatabaseDynamicRowWithData(page, '123', false);
    await pressEscape(page);
    await initDatabaseRowWithData(page, 'text2');
    await initDatabaseDynamicRowWithData(page, 'a', false);
    await pressEscape(page);

    await initDatabaseRowWithData(page, '');
    await initDatabaseRowWithData(page, '');

    const startCell = getDatabaseCell(page, {
      rowIndex: 0,
      columnIndex: 0,
    });
    const startCellBox = await getBoundingBox(startCell);
    const endCell = getDatabaseCell(page, { rowIndex: 1, columnIndex: 1 });
    const endCellBox = await getBoundingBox(endCell);
    const startX = startCellBox.x + startCellBox.width / 2;
    const startY = startCellBox.y + startCellBox.height / 2;
    const endX = endCellBox.x + endCellBox.width / 2;
    const endY = endCellBox.y + endCellBox.height / 2;
    await dragBetweenCoords(
      page,
      { x: startX, y: startY },
      { x: endX, y: endY },
      {
        steps: 50,
      }
    );
    await copyByKeyboard(page);

    await pressArrowDown(page);
    await pressArrowDown(page);
    await waitNextFrame(page);
    await pasteByKeyboard(page, false);

    await assertDatabaseTitleColumnText(page, 'text1', 2);
    await assertDatabaseTitleColumnText(page, 'text2', 3);
    const selectCell21 = getDatabaseCell(page, {
      rowIndex: 2,
      columnIndex: 1,
    });
    const selectCell31 = getDatabaseCell(page, {
      rowIndex: 3,
      columnIndex: 1,
    });
    expect(await selectCell21.innerText()).toBe('123');
    expect(await selectCell31.innerText()).toBe('a');
  });

  test.skip('should support copy&paste of a single row', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseRowWithData(page, 'text1');
    await pressEscape(page);
    await waitNextFrame(page, 100);
    await initDatabaseDynamicRowWithData(page, 'abc', false);
    await pressEscape(page);
    await waitNextFrame(page, 100);
    await initDatabaseColumn(page);
    await switchColumnType(page, 'Number', 2);
    const numberCell = getDatabaseCell(page, {
      rowIndex: 0,
      columnIndex: 2,
    });
    await numberCell.click();
    await waitNextFrame(page);
    await type(page, '123');
    await pressEscape(page);
    await pressEscape(page);
    await copyByKeyboard(page);

    await initDatabaseRowWithData(page, '');
    await pressEscape(page);
    await pasteByKeyboard(page, false);
    await waitNextFrame(page);

    await assertDatabaseTitleColumnText(page, 'text1', 1);
    const selectCell = getDatabaseCell(page, {
      rowIndex: 1,
      columnIndex: 1,
    });
    expect(await selectCell.innerText()).toBe('abc');
    const selectNumberCell = getDatabaseCell(page, {
      rowIndex: 1,
      columnIndex: 2,
    });
    expect(await selectNumberCell.innerText()).toBe('123');
  });
});
