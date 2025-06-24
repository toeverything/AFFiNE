import { expect } from '@playwright/test';

import {
  assertDatabaseColumnOrder,
  dragBetweenCoords,
  enterPlaygroundRoom,
  getBoundingBox,
  initDatabaseDynamicRowWithData,
  initEmptyDatabaseState,
  pressArrowRight,
  pressArrowUp,
  pressArrowUpWithShiftKey,
  pressBackspace,
  pressEnter,
  pressEscape,
  redoByClick,
  selectAllByKeyboard,
  type,
  undoByClick,
  waitNextFrame,
} from '../utils/actions/index.js';
import { test } from '../utils/playwright.js';
import {
  assertDatabaseCellNumber,
  assertDatabaseCellRichTexts,
  assertSelectedStyle,
  changeColumnType,
  clickDatabaseOutside,
  clickSelectOption,
  getDatabaseCell,
  getDatabaseHeaderColumn,
  initDatabaseColumn,
  performColumnAction,
  performSelectColumnTagAction,
  switchColumnType,
} from './actions.js';

test.describe('column operations', () => {
  test('should support rename column', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page, 'abc');

    const { textElement } = await getDatabaseHeaderColumn(page, 1);
    expect(await textElement.innerText()).toBe('abc');
    await textElement.click();
    await waitNextFrame(page, 200);
    await pressArrowRight(page);
    await type(page, '123');
    await pressEnter(page);
    expect(await textElement.innerText()).toBe('abc123');

    await undoByClick(page);
    expect(await textElement.innerText()).toBe('abc');
    await redoByClick(page);
    expect(await textElement.innerText()).toBe('abc123');
  });

  test('should support add new column', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123', true);
    await pressEscape(page);
    const { text: title1 } = await getDatabaseHeaderColumn(page, 1);
    expect(title1).toBe('Column');

    const selected = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'multi-select',
    });
    expect(await selected.innerText()).toBe('123');

    await initDatabaseColumn(page, 'abc');
    const { text: title2 } = await getDatabaseHeaderColumn(page, 2);
    expect(title2).toBe('abc');

    await initDatabaseColumn(page);
    const { text: title3 } = await getDatabaseHeaderColumn(page, 3);
    expect(title3).toBe('Column 2');
  });

  test('should support right insert column', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page, '1');

    await performColumnAction(page, '1', 'Insert right');
    await selectAllByKeyboard(page);
    await type(page, '2');
    await pressEnter(page);
    const columns = page.locator('.affine-database-column');
    expect(await columns.count()).toBe(3);

    await assertDatabaseColumnOrder(page, ['1', '2']);
  });

  test('should support left insert column', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page, '1');

    await performColumnAction(page, '1', 'Insert left');
    await selectAllByKeyboard(page);
    await type(page, '2');
    await pressEnter(page);
    const columns = page.locator('.affine-database-column');
    expect(await columns.count()).toBe(3);

    await assertDatabaseColumnOrder(page, ['2', '1']);
  });

  test('should support delete column', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page, '1');

    const columns = page.locator('.affine-database-column');
    expect(await columns.count()).toBe(2);

    await performColumnAction(page, '1', 'Delete');
    expect(await columns.count()).toBe(1);
  });

  test('should support duplicate column', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page, '1');
    await initDatabaseDynamicRowWithData(page, '123', true);
    await pressEscape(page);
    await performColumnAction(page, '1', 'duplicate');
    await pressEscape(page);
    const cells = page.locator('affine-database-multi-select-cell');
    expect(await cells.count()).toBe(2);

    const secondCell = cells.nth(1);
    const selected = secondCell.locator('.select-selected');
    expect(await selected.innerText()).toBe('123');
  });

  test('should support move column right', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page, '1');
    await initDatabaseDynamicRowWithData(page, '123', true);
    await pressEscape(page);
    await initDatabaseColumn(page, '2');
    await initDatabaseDynamicRowWithData(page, 'abc', false, 1);
    await pressEscape(page);
    await assertDatabaseColumnOrder(page, ['1', '2']);
    await waitNextFrame(page, 350);
    await performColumnAction(page, '1', 'Move right');
    await assertDatabaseColumnOrder(page, ['2', '1']);

    await undoByClick(page);
    const { column } = await getDatabaseHeaderColumn(page, 2);
    await column.click();
    const moveLeft = page.locator('.action', { hasText: 'Move right' });
    expect(await moveLeft.count()).toBe(0);
  });

  test('should support move column left', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page, '1');
    await initDatabaseDynamicRowWithData(page, '123', true);
    await pressEscape(page);
    await initDatabaseColumn(page, '2');
    await initDatabaseDynamicRowWithData(page, 'abc', false, 1);
    await pressEscape(page);
    await assertDatabaseColumnOrder(page, ['1', '2']);

    const { column } = await getDatabaseHeaderColumn(page, 0);
    await column.click();
    const moveLeft = page.locator('.action', { hasText: 'Move left' });
    expect(await moveLeft.count()).toBe(0);
    await waitNextFrame(page, 200);
    await pressEscape(page);
    await pressEscape(page);

    await performColumnAction(page, '2', 'Move left');
    await assertDatabaseColumnOrder(page, ['2', '1']);
  });
});

test.describe('switch column type', () => {
  test('switch to number', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123abc', true);
    await pressEscape(page);
    await changeColumnType(page, 1, 'Number');

    const cell = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'number',
    });
    await assertDatabaseCellNumber(page, {
      text: '',
    });
    await pressEnter(page);
    await type(page, '123abc');
    await pressEscape(page);
    expect((await cell.textContent())?.trim()).toBe('123');
  });

  test('switch to rich-text', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123abc', true);
    await pressEscape(page);
    await switchColumnType(page, 'Text');

    const cell = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'rich-text',
    });
    await cell.isVisible();
    await pressEnter(page);
    await type(page, '123');
    await pressEscape(page);
    await pressEnter(page);
    await type(page, 'abc');
    await pressEscape(page);
    await assertDatabaseCellRichTexts(page, { text: '123abc123abc' });
  });

  test('switch between multi-select and select', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123', true);
    await type(page, 'abc');
    await pressEnter(page);
    await pressEscape(page);
    const cell = getDatabaseCell(page, {
      rowIndex: 0,
      columnIndex: 1,
    });
    const tags = cell.getByTestId('tag-selected');
    expect(await tags.count()).toBe(2);

    await switchColumnType(page, 'Select', 1);
    expect(await tags.count()).toBe(1);
    expect(await tags.innerText()).toBe('123');

    await pressEnter(page);
    await type(page, 'def');
    await pressEnter(page);
    expect(await tags.innerText()).toBe('def');

    await switchColumnType(page, 'Multi-select');
    await pressEnter(page);
    await type(page, '666');
    await pressEnter(page);
    await pressEscape(page);
    expect(await tags.count()).toBe(2);
    expect(await tags.nth(0).innerText()).toBe('def');
    expect(await tags.nth(1).innerText()).toBe('666');

    await switchColumnType(page, 'Select');
    expect(await tags.count()).toBe(1);
    expect(await tags.innerText()).toBe('def');

    await pressEnter(page);
    await type(page, '888');
    await pressEnter(page);
    expect(await tags.innerText()).toBe('888');
  });

  test('switch between number and rich-text', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await switchColumnType(page, 'Number');

    await initDatabaseDynamicRowWithData(page, '123abc', true);
    await assertDatabaseCellNumber(page, {
      text: '123',
    });

    await switchColumnType(page, 'Text');
    await pressEnter(page);
    await type(page, 'abc');
    await pressEscape(page);
    await assertDatabaseCellRichTexts(page, { text: '123abc' });

    await switchColumnType(page, 'Number');
    await assertDatabaseCellNumber(page, {
      text: '123',
    });
  });

  test('switch number to select', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await switchColumnType(page, 'Number');

    await initDatabaseDynamicRowWithData(page, '123', true);
    const cell = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'number',
    });
    expect((await cell.textContent())?.trim()).toBe('123');

    await switchColumnType(page, 'Select');
    await initDatabaseDynamicRowWithData(page, 'abc');
    const selectCell = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'select',
    });
    expect(await selectCell.innerText()).toBe('abc');

    await switchColumnType(page, 'Number');
    await assertDatabaseCellNumber(page, {
      text: '',
    });
  });

  test('switch to checkbox', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '', true);
    await pressEscape(page);
    await changeColumnType(page, 1, 'Checkbox');

    const checkbox = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'checkbox',
    }).locator('.checkbox');
    await expect(checkbox).not.toHaveClass('checked');

    await waitNextFrame(page, 500);
    await checkbox.click();
    await expect(checkbox).toHaveClass(/checked/);

    await undoByClick(page);
    await expect(checkbox).not.toHaveClass('checked');
  });

  test('checkbox to text', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '', true);
    await pressEscape(page);
    await changeColumnType(page, 1, 'Checkbox');

    let checkbox = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'checkbox',
    });
    await expect(checkbox).not.toHaveClass('checked');

    // checked
    await checkbox.click();
    await changeColumnType(page, 1, 'Text');
    await clickDatabaseOutside(page);
    await waitNextFrame(page, 100);
    await assertDatabaseCellRichTexts(page, { text: 'Yes' });
    await clickDatabaseOutside(page);
    await waitNextFrame(page, 100);
    await changeColumnType(page, 1, 'Checkbox');
    checkbox = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'checkbox',
    }).locator('.checkbox');
    await expect(checkbox).toHaveClass(/checked/);

    // not checked
    await checkbox.click();
    await changeColumnType(page, 1, 'Text');
    await clickDatabaseOutside(page);
    await waitNextFrame(page, 100);
    await assertDatabaseCellRichTexts(page, { text: 'No' });
    await clickDatabaseOutside(page);
    await waitNextFrame(page, 100);
    await changeColumnType(page, 1, 'Checkbox');
    checkbox = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'checkbox',
    });
    await expect(checkbox).not.toHaveClass('checked');
  });

  test('switch to progress', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '', true);
    await pressEscape(page);
    await switchColumnType(page, 'Progress');

    const cell = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'progress',
    });
    const progress = cell.getByTestId('progress');
    expect((await progress.textContent())?.trim()).toBe('0');
    await waitNextFrame(page, 500);
    const progressBg = cell.getByTestId('progress-background');
    const {
      x: progressBgX,
      y: progressBgY,
      width: progressBgWidth,
    } = await getBoundingBox(progressBg);
    await page.mouse.move(progressBgX, progressBgY);
    await page.mouse.click(progressBgX, progressBgY);
    const dragHandle = cell.getByTestId('progress-drag-handle');
    const {
      x: dragX,
      y: dragY,
      width,
      height,
    } = await getBoundingBox(dragHandle);
    const dragCenterX = dragX + width / 2;
    const dragCenterY = dragY + height / 2;
    await page.mouse.move(dragCenterX, dragCenterY);

    const endX = dragCenterX + progressBgWidth;
    await dragBetweenCoords(
      page,
      { x: dragCenterX, y: dragCenterY },
      { x: endX, y: dragCenterY }
    );
    expect(await progress.textContent()).toBe('100');
    await pressEscape(page);
    await undoByClick(page);
    expect(await progress.textContent()).toBe('0');
  });

  test('switch to link', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '', true);
    await pressEscape(page);

    await switchColumnType(page, 'Link');

    const linkText = 'http://example.com';
    const cell = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'link',
    });
    await pressEnter(page);
    await type(page, linkText);
    await pressEscape(page);
    const link = cell.getByTestId('property-link-a');
    await expect(link).toHaveAttribute('href', linkText);
    expect(await link.textContent()).toBe(linkText);

    // not link text
    await cell.hover();
    const linkEdit = getDatabaseCell(page, {
      rowIndex: 0,
      columnType: 'link',
    }).getByTestId('edit-link-button');
    await linkEdit.click();
    await waitNextFrame(page);
    await selectAllByKeyboard(page);
    await type(page, 'abc');
    await pressEnter(page);
    await expect(link).toBeHidden();
  });
});

test.describe('select column tag action', () => {
  test('should support select tag renaming', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123', true);
    await type(page, 'abc');
    await pressEnter(page);
    await clickSelectOption(page);
    await waitNextFrame(page);
    await pressArrowRight(page);
    await type(page, '4567abc00');
    await pressEnter(page);
    const options = page.getByTestId('tag-option-list').getByTestId('tag-name');
    expect(await options.nth(0).innerText()).toBe('abc4567abc00');
    expect(await options.nth(1).innerText()).toBe('123');
  });

  test('should select tag renaming support shortcut key', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123', true);
    await clickSelectOption(page);
    await waitNextFrame(page);
    await pressArrowRight(page);
    await type(page, '456');
    // esc
    await pressEscape(page);
    await pressEscape(page);
    const options = page.getByTestId('tag-option-list').getByTestId('tag-name');
    const option1 = options.nth(0);
    expect(await option1.innerText()).toBe('123456');
  });

  test('should support select tag deletion', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123', true);
    await performSelectColumnTagAction(page, 'Delete');
    const options = page.locator('.select-option-name');
    expect(await options.count()).toBe(0);
  });

  test('should support modifying select tag color', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '123', true);
    await performSelectColumnTagAction(page, 'Red');
    await pressEscape(page);
    await assertSelectedStyle(
      page,
      'backgroundColor',
      'var(--affine-v2-chip-label-red)'
    );
  });
});

test.describe('drag-to-fill', () => {
  test('should show when cell in focus and hide on blur', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);
    await initDatabaseDynamicRowWithData(page, '', true);

    await pressEscape(page);

    const dragToFillHandle = page.locator('.drag-to-fill');

    await expect(dragToFillHandle).toBeVisible();

    await pressEscape(page);

    await expect(dragToFillHandle).toBeHidden();
  });

  test('should not show in multi (row or column) selection', async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);

    await initDatabaseDynamicRowWithData(page, '', true);
    await pressEscape(page);

    await initDatabaseDynamicRowWithData(page, '', true);
    await pressEscape(page);

    const dragToFillHandle = page.locator('.drag-to-fill');

    await expect(dragToFillHandle).toBeVisible();

    await pressArrowUpWithShiftKey(page);

    await expect(dragToFillHandle).toBeHidden();
    await pressArrowUp(page);

    await expect(dragToFillHandle).toBeVisible();
  });

  test('should fill columns with data', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyDatabaseState(page);

    await initDatabaseColumn(page);

    await initDatabaseDynamicRowWithData(page, 'thing', true);
    await pressEscape(page);

    await initDatabaseDynamicRowWithData(page, '', true);
    await pressBackspace(page);
    await type(page, 'aaa');
    await pressEnter(page);
    await pressEnter(page);

    await pressEscape(page);
    await pressArrowUp(page);

    const cells = page.locator('affine-database-multi-select-cell');

    expect(await cells.nth(0).innerText()).toBe('thing');
    expect(await cells.nth(1).innerText()).toBe('aaa');

    const dragToFillHandle = page.locator('.drag-to-fill');

    await expect(dragToFillHandle).toBeVisible();

    const bbox = await getBoundingBox(dragToFillHandle);

    if (!bbox) throw new Error('Expected a bounding box');

    await dragBetweenCoords(
      page,
      { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 },
      { x: bbox.x, y: bbox.y + 200 }
    );

    expect(await cells.nth(0).innerText()).toBe('thing');
    expect(await cells.nth(1).innerText()).toBe('thing');
  });
});
