import { expect } from '@playwright/test';

import {
  dragBetweenIndices,
  enterPlaygroundRoom,
  focusRichText,
  getPageSnapshot,
  initEmptyParagraphState,
  initThreeParagraphs,
  inlineCode,
  MODIFIER_KEY,
  pressArrowDown,
  pressArrowLeft,
  pressArrowRight,
  pressArrowUp,
  pressEnter,
  pressForwardDelete,
  pressShiftTab,
  pressTab,
  readClipboardText,
  redoByClick,
  redoByKeyboard,
  resetHistory,
  setInlineRangeInSelectedRichText,
  SHIFT_KEY,
  SHORT_KEY,
  strikethrough,
  type,
  undoByClick,
  undoByKeyboard,
  updateBlockType,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertBlockChildrenIds,
  assertRichTextInlineRange,
  assertRichTextModelType,
  assertRichTexts,
  assertTextFormat,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test('rich-text hotkey scope on single press', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await pressEnter(page);
  await type(page, 'world');
  await assertRichTexts(page, ['hello', 'world']);

  await dragBetweenIndices(page, [0, 0], [1, 5]);
  await page.keyboard.press('Backspace');
  await assertRichTexts(page, ['']);
});

test('single line rich-text inline code hotkey', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await dragBetweenIndices(page, [0, 0], [0, 5]);
  await inlineCode(page);
  await assertTextFormat(page, 0, 5, { code: true });

  // undo
  await undoByKeyboard(page);
  await assertTextFormat(page, 0, 5, {});
  // redo
  await redoByKeyboard(page);
  await waitNextFrame(page);
  await assertTextFormat(page, 0, 5, { code: true });

  // the format should be removed after trigger the hotkey again
  await inlineCode(page);
  await assertTextFormat(page, 0, 5, {});
});

test('type character jump out code node', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'Hello');
  await setInlineRangeInSelectedRichText(page, 0, 5);
  await inlineCode(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );
  await focusRichText(page);
  await page.keyboard.press(`${SHORT_KEY}+ArrowRight`);
  await type(page, 'block suite');
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_2.json`
  );
});

test('single line rich-text strikethrough hotkey', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await dragBetweenIndices(page, [0, 0], [0, 5]);
  await strikethrough(page);
  await assertTextFormat(page, 0, 5, { strike: true });

  await undoByClick(page);
  await assertTextFormat(page, 0, 5, {});

  await redoByClick(page);
  await assertTextFormat(page, 0, 5, { strike: true });

  await waitNextFrame(page);
  // the format should be removed after trigger the hotkey again
  await strikethrough(page);
  await assertTextFormat(page, 0, 5, {});
});

test('use formatted cursor with hotkey', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaa');
  // format italic
  await page.keyboard.press(`${SHORT_KEY}+i`, { delay: 50 });
  await type(page, 'bbb');
  // format bold
  await page.keyboard.press(`${SHORT_KEY}+b`, { delay: 50 });
  await type(page, 'ccc');
  // unformat italic
  await page.keyboard.press(`${SHORT_KEY}+i`, { delay: 50 });
  await type(page, 'ddd');
  // unformat bold
  await page.keyboard.press(`${SHORT_KEY}+b`, { delay: 50 });
  await type(page, 'eee');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  // format bold
  await page.keyboard.press(`${SHORT_KEY}+b`, { delay: 50 });
  await type(page, 'fff');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_bold.json`
  );

  await pressArrowLeft(page);
  await pressArrowRight(page);
  await type(page, 'ggg');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_bold_ggg.json`
  );

  await setInlineRangeInSelectedRichText(page, 3, 0);
  await waitNextFrame(page);
  await type(page, 'hhh');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_bold_hhh.json`
  );
});

test('use formatted cursor with hotkey at empty line', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  // format bold
  await page.keyboard.press(`${SHORT_KEY}+b`, { delay: 50 });
  await type(page, 'aaa');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_bold.json`
  );
});

test('should single line format hotkey work', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await dragBetweenIndices(page, [0, 1], [0, 4]);

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

test('should hotkey work in paragraph', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page, 0);
  await type(page, 'hello');

  // XXX wait for group to be updated
  await page.waitForTimeout(10);
  await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+1`);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );
  await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+6`);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_press_6.json`
  );
  await page.waitForTimeout(50);
  await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+8`);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_press_8.json`
  );
  await page.waitForTimeout(50);
  await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+9`);
  await waitNextFrame(page, 200);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_press_9.json`
  );
  await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+0`);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_press_0.json`
  );
  await page.waitForTimeout(50);
  await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+d`);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_press_d.json`
  );
});

test('format list to h1', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page, 0);
  await updateBlockType(page, 'affine:list', 'bulleted');
  await type(page, 'aa');
  await focusRichText(page, 0);
  await updateBlockType(page, 'affine:paragraph', 'h1');
  await assertRichTextModelType(page, 'h1');
  await undoByClick(page);
  await assertRichTextModelType(page, 'bulleted');
  await redoByClick(page);
  await assertRichTextModelType(page, 'h1');
});

test('should cut work single line', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await resetHistory(page);
  await dragBetweenIndices(page, [0, 1], [0, 4]);
  // cut
  await page.keyboard.press(`${SHORT_KEY}+x`);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );
  await undoByKeyboard(page);
  const text = await readClipboardText(page);
  expect(text).toBe('ell');
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_undo.json`
  );
});

test('should ctrl+enter create new block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await type(page, '123');
  await pressArrowLeft(page, 2);
  await pressEnter(page);
  await waitNextFrame(page);
  await assertRichTexts(page, ['1', '23']);
  await page.keyboard.press(`${SHORT_KEY}+Enter`);
  await assertRichTexts(page, ['1', '23', '']);
});

test('should left/right key navigator works', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await focusRichText(page, 0);
  await assertRichTextInlineRange(page, 0, 3);
  await page.keyboard.press(`${SHORT_KEY}+ArrowLeft`, { delay: 50 });
  await assertRichTextInlineRange(page, 0, 0);
  await pressArrowLeft(page);
  await assertRichTextInlineRange(page, 0, 0);
  await page.keyboard.press(`${SHORT_KEY}+ArrowRight`, { delay: 50 });
  await assertRichTextInlineRange(page, 0, 3);
  await pressArrowRight(page);
  await assertRichTextInlineRange(page, 1, 0);
  await pressArrowLeft(page);
  await assertRichTextInlineRange(page, 0, 3);
  await pressArrowRight(page, 4);
  await assertRichTextInlineRange(page, 1, 3);
  await pressArrowRight(page);
  await assertRichTextInlineRange(page, 2, 0);
  await pressArrowLeft(page);
  await assertRichTextInlineRange(page, 1, 3);
});

test('should up/down key navigator works', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await focusRichText(page, 0);
  await assertRichTextInlineRange(page, 0, 3);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 1, 3);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 2, 3);
  await page.keyboard.press(`${SHORT_KEY}+ArrowLeft`, { delay: 50 });
  await assertRichTextInlineRange(page, 2, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 1, 0);
  await pressArrowRight(page);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 0, 1);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 1, 1);
});

test('should support ctrl/cmd+shift+l convert to linked doc', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);

  await dragBetweenIndices(
    page,
    [2, 3],
    [0, 0],
    { x: 20, y: 20 },
    { x: 0, y: 0 }
  );

  await waitNextFrame(page);
  await page.keyboard.press(`${SHORT_KEY}+${SHIFT_KEY}+l`);

  const linkedDocCard = page.locator('affine-embed-linked-doc-block');
  await expect(linkedDocCard).toBeVisible();

  const title = page.locator('.affine-embed-linked-doc-content-title-text');
  expect(await title.innerText()).toBe('Untitled');

  const noteContent = page.locator('.affine-embed-linked-doc-content-note');
  expect(await noteContent.innerText()).toBe('123');
});

test('should forwardDelete works when delete single character', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page, 0);
  await type(page, 'hello');
  await pressArrowLeft(page, 5);
  await pressForwardDelete(page);
  await assertRichTexts(page, ['ello']);
});

test.describe('keyboard operation to move block up or down', () => {
  test('common paragraph', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, 'hello');
    await pressEnter(page);
    await type(page, 'world');
    await pressEnter(page);
    await type(page, 'foo');
    await pressEnter(page);
    await type(page, 'bar');
    await assertRichTexts(page, ['hello', 'world', 'foo', 'bar']);
    await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+ArrowUp`);
    await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+ArrowUp`);
    await assertRichTexts(page, ['hello', 'bar', 'world', 'foo']);
    await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+ArrowDown`);
    await assertRichTexts(page, ['hello', 'world', 'bar', 'foo']);
  });

  test('with indent', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, 'hello');
    await pressEnter(page);
    await pressTab(page);
    await waitNextFrame(page);
    await type(page, 'world');
    await pressEnter(page);
    await pressShiftTab(page);
    await waitNextFrame(page);
    await type(page, 'foo');
    await assertRichTexts(page, ['hello', 'world', 'foo']);
    await assertBlockChildrenIds(page, '2', ['3']);
    await pressArrowUp(page, 2);
    await waitNextFrame(page);
    await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+ArrowDown`);
    await waitNextFrame(page);
    await assertRichTexts(page, ['foo', 'hello', 'world']);
    await assertBlockChildrenIds(page, '1', ['4', '2']);
    await assertBlockChildrenIds(page, '2', ['3']);
  });

  test('keep cursor', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    await type(page, 'hello');
    await pressEnter(page);
    await type(page, 'world');
    await pressEnter(page);
    await type(page, 'foo');
    await assertRichTexts(page, ['hello', 'world', 'foo']);
    await assertRichTextInlineRange(page, 2, 3);
    await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+ArrowUp`);
    await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+ArrowUp`);
    await assertRichTextInlineRange(page, 0, 3);
    await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+ArrowDown`);
    await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+ArrowDown`);
    await assertRichTextInlineRange(page, 2, 3);
  });
});

test('Enter key should as expected after setting heading by shortkey', async ({
  page,
}, testInfo) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/4987',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await page.keyboard.press(`${SHORT_KEY}+${MODIFIER_KEY}+1`);
  await pressEnter(page);
  await type(page, 'world');
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});
