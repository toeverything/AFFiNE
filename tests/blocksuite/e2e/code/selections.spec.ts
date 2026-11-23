import { expect } from '@playwright/test';

import { dragBetweenCoords } from '../utils/actions/drag.js';
import {
  pressArrowLeft,
  pressBackspace,
  pressEnter,
  pressEnterWithShortkey,
  redoByKeyboard,
  type,
  undoByKeyboard,
} from '../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  getInlineSelectionIndex,
  getInlineSelectionText,
  initEmptyCodeBlockState,
} from '../utils/actions/misc.js';
import {
  assertBlockCount,
  assertBlockSelections,
  assertRichTextInlineRange,
  assertRichTexts,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';
import { getCodeBlock } from './utils.js';

test('click outside should close language list', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  const codeBlock = getCodeBlock(page);
  await codeBlock.clickLanguageButton();
  const locator = codeBlock.langList;
  await expect(locator).toBeVisible();

  const rect = await page.locator('affine-filterable-list').boundingBox();
  if (!rect) throw new Error('Failed to get bounding box of code block.');
  await page.mouse.click(rect.x - 10, rect.y - 10);

  await expect(locator).toBeHidden();
});

test('split code by enter', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'hello');

  // he|llo
  await pressArrowLeft(page, 3);

  await pressEnter(page);
  await assertRichTexts(page, ['he\nllo']);

  await undoByKeyboard(page);
  await assertRichTexts(page, ['hello']);

  await redoByKeyboard(page);
  await assertRichTexts(page, ['he\nllo']);
});

test('split code with selection by enter', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'hello');

  // select 'll'
  await pressArrowLeft(page, 1);
  await page.keyboard.down('Shift');
  await pressArrowLeft(page, 2);
  await page.keyboard.up('Shift');

  await pressEnter(page);
  await assertRichTexts(page, ['he\no']);

  await undoByKeyboard(page);
  await assertRichTexts(page, ['hello']);

  await redoByKeyboard(page);
  await assertRichTexts(page, ['he\no']);
});

test('drag select code block can delete it with backspace', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  const codeBlock = page.locator('affine-code');
  const bbox = await codeBlock.boundingBox();
  if (!bbox) {
    throw new Error("Failed to get code block's bounding box");
  }
  const position = {
    startX: bbox.x - 10,
    startY: bbox.y - 10,
    endX: bbox.x + bbox.width,
    endY: bbox.y + bbox.height / 2,
  };
  await dragBetweenCoords(
    page,
    { x: position.startX, y: position.startY },
    { x: position.endX, y: position.endY },
    { steps: 20 }
  );
  await page.waitForTimeout(10);
  await page.keyboard.press('Backspace');
  const locator = page.locator('affine-code');
  await expect(locator).toBeHidden();
});

test('drag select code block can delete it with delete key', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  const codeBlock = page.locator('affine-code');
  const bbox = await codeBlock.boundingBox();
  if (!bbox) {
    throw new Error("Failed to get code block's bounding box");
  }
  const position = {
    startX: bbox.x - 10,
    startY: bbox.y - 10,
    endX: bbox.x + bbox.width,
    endY: bbox.y + bbox.height / 2,
  };
  await dragBetweenCoords(
    page,
    { x: position.startX, y: position.startY },
    { x: position.endX, y: position.endY },
    { steps: 20 }
  );
  await page.waitForTimeout(10);
  await page.keyboard.press('Delete');
  const locator = page.locator('affine-code');
  await expect(locator).toBeHidden();
});

test('press short key and enter at end of code block can jump out', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await pressEnterWithShortkey(page);

  const locator = page.locator('affine-paragraph');
  await expect(locator).toBeVisible();
});

test('press short key and enter at end of code block with content can jump out', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'const a = 10;');
  await pressEnterWithShortkey(page);

  const locator = page.locator('affine-paragraph');
  await expect(locator).toBeVisible();
});

test('press backspace inside should select code block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);
  const codeBlock = page.locator('affine-code');
  const selectedRects = page
    .locator('affine-block-selection')
    .locator('visible=true');
  await page.keyboard.press('Backspace');
  await expect(selectedRects).toHaveCount(1);
  await expect(codeBlock).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(selectedRects).toHaveCount(0);
  await expect(codeBlock).toBeHidden();
});

test('press backspace after code block can select code block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);
  const code = 'const a = 1;';
  await type(page, code);

  await assertRichTextInlineRange(page, 0, 12);
  await pressEnterWithShortkey(page);
  await assertRichTextInlineRange(page, 1, 0);
  await assertBlockCount(page, 'paragraph', 1);
  await pressBackspace(page);
  await assertBlockSelections(page, ['2']);
  await assertBlockCount(page, 'paragraph', 0);
});

test('press ArrowUp after code block can enter code block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);
  const code = 'const a = 1;';
  await type(page, code);

  await pressEnterWithShortkey(page);
  await page.keyboard.press('ArrowUp');

  const index = await getInlineSelectionIndex(page);
  expect(index).toBe(0);

  const text = await getInlineSelectionText(page);
  expect(text).toBe(code);
});
