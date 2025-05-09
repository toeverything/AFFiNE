import { expect } from '@playwright/test';

import {
  dragBetweenIndices,
  enterPlaygroundRoom,
  focusRichText,
  getPageSnapshot,
  initEmptyParagraphState,
  initThreeParagraphs,
  inlineCode,
  pressArrowLeft,
  pressArrowUp,
  pressEnter,
  pressForwardDelete,
  pressShiftEnter,
  readClipboardText,
  redoByClick,
  resetHistory,
  setInlineRangeInSelectedRichText,
  SHORT_KEY,
  type,
  undoByClick,
  undoByKeyboard,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertBlockSelections,
  assertRichTextInlineRange,
  assertRichTexts,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test('should multiple line format hotkey work', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  // 0    1   2
  // 1|23 456 78|9
  await dragBetweenIndices(page, [0, 1], [2, 2]);

  // bold
  await page.keyboard.press(`${SHORT_KEY}+b`);
  // italic
  await page.keyboard.press(`${SHORT_KEY}+i`);
  // underline
  await page.keyboard.press(`${SHORT_KEY}+u`);
  // strikethrough
  await page.keyboard.press(`${SHORT_KEY}+Shift+S`);

  await waitNextFrame(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  // bold
  await page.keyboard.press(`${SHORT_KEY}+b`, { delay: 50 });
  // italic
  await page.keyboard.press(`${SHORT_KEY}+i`, { delay: 50 });
  // underline
  await page.keyboard.press(`${SHORT_KEY}+u`, { delay: 50 });
  // strikethrough
  await page.keyboard.press(`${SHORT_KEY}+Shift+s`, { delay: 50 });

  await waitNextFrame(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_finial.json`
  );
});

test('multi line rich-text inline code hotkey', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  // 0    1   2
  // 1|23 456 78|9
  await dragBetweenIndices(page, [0, 1], [2, 2]);
  await inlineCode(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  await undoByClick(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_undo.json`
  );

  await redoByClick(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_redo.json`
  );
});

test('should cut work multiple line', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await resetHistory(page);
  // 0    1   2
  // 1|23 456 78|9
  await dragBetweenIndices(page, [0, 1], [2, 2]);
  // cut
  await page.keyboard.press(`${SHORT_KEY}+x`);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );
  await undoByKeyboard(page);
  const text = await readClipboardText(page);
  expect(text).toBe(`23 456 78`);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_undo.json`
  );
});

test('arrow up and down behavior on multiline text blocks when previous is non-text', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await pressEnter(page);
  await pressArrowUp(page);
  await type(page, '--- ');
  await pressEnter(page);

  await focusRichText(page);
  await type(page, '124');
  await pressShiftEnter(page);
  await type(page, '1234');

  await pressArrowUp(page);
  await waitNextFrame(page, 100);
  await assertRichTextInlineRange(page, 0, 3);

  await pressArrowUp(page);
  await assertBlockSelections(page, ['4']);
});

test('should forwardDelete works when delete multi characters', async ({
  page,
}) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/3122',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page, 0);
  await type(page, 'hello');
  await pressArrowLeft(page, 5);
  await setInlineRangeInSelectedRichText(page, 1, 3);
  await pressForwardDelete(page);
  await assertRichTexts(page, ['ho']);
});

test('should drag multiple block and input text works', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/2982',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await dragBetweenIndices(page, [0, 1], [2, 1]);
  await type(page, 'ab');
  await assertRichTexts(page, ['1ab89']);
  await undoByKeyboard(page);
  await assertRichTexts(page, ['123', '456', '789']);
});
