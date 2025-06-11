import { expect } from '@playwright/test';

import {
  activeEmbed,
  activeNoteInEdgeless,
  addNoteByClick,
  click,
  copyByKeyboard,
  dragBetweenCoords,
  dragBetweenIndices,
  enterPlaygroundRoom,
  fillLine,
  focusRichText,
  focusTitle,
  getCursorBlockIdAndHeight,
  getEditorHostLocator,
  getIndexCoordinate,
  getInlineSelectionIndex,
  getInlineSelectionText,
  getPageSnapshot,
  getRichTextBoundingBox,
  getSelectedText,
  getSelectedTextByInlineEditor,
  initEmptyEdgelessState,
  initEmptyParagraphState,
  initImageState,
  initThreeLists,
  initThreeParagraphs,
  pasteByKeyboard,
  pressArrowDown,
  pressArrowLeft,
  pressArrowRight,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  pressEscape,
  pressForwardDelete,
  pressShiftEnter,
  pressShiftTab,
  pressTab,
  redoByKeyboard,
  resetHistory,
  scrollToTop,
  selectAllByKeyboard,
  setInlineRangeInInlineEditor,
  setSelection,
  SHORT_KEY,
  switchEditorMode,
  type,
  undoByKeyboard,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertBlockCount,
  assertBlockSelections,
  assertClipItems,
  assertDivider,
  assertNativeSelectionRangeCount,
  assertRichTextInlineRange,
  assertRichTexts,
  assertTextSelection,
  assertTitle,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test('native range delete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await dragBetweenIndices(page, [0, 0], [2, 3]);
  await pressBackspace(page);
  await assertBlockCount(page, 'paragraph', 1);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await undoByKeyboard(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await redoByKeyboard(page);
  await assertRichTexts(page, ['']);
});

test('native range delete with indent', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await type(page, '123');
  await pressEnter(page);
  await type(page, '456');
  await pressEnter(page);
  await type(page, '789');
  await pressEnter(page);
  await type(page, 'abc');
  await pressEnter(page);
  await type(page, 'def');
  await pressEnter(page);
  await type(page, 'ghi');
  await resetHistory(page);

  await focusRichText(page, 1);
  await pressTab(page);
  await focusRichText(page, 2);
  await pressTab(page, 2);
  await focusRichText(page, 4);
  await pressTab(page);
  await focusRichText(page, 5);
  await pressTab(page, 2);

  // 123
  //   456
  //     789
  // abc
  //   def
  //     ghi

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  await dragBetweenIndices(page, [0, 2], [4, 1]);

  // 12|3
  //   456
  //     789
  // abc
  //   d|ef
  //     ghi

  await pressBackspace(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_after_backspace.json`
  );

  await waitNextFrame(page);
  await undoByKeyboard(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_after_undo.json`
  );

  await redoByKeyboard(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_after_redo.json`
  );
});

test('native range delete by forwardDelete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const box123 = await getRichTextBoundingBox(page, '2');
  const inside123 = { x: box123.left + 1, y: box123.top + 1 };

  const box789 = await getRichTextBoundingBox(page, '4');
  const inside789 = { x: box789.right - 1, y: box789.bottom - 1 };

  // from top to bottom
  await dragBetweenCoords(page, inside123, inside789, { steps: 50 });
  await pressForwardDelete(page);
  await assertBlockCount(page, 'paragraph', 1);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await undoByKeyboard(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await redoByKeyboard(page);
  await assertRichTexts(page, ['']);
});

test('native range input', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const box123 = await getRichTextBoundingBox(page, '2');
  const inside123 = { x: box123.left + 1, y: box123.top + 1 };

  const box789 = await getRichTextBoundingBox(page, '4');
  const inside789 = { x: box789.right - 1, y: box789.bottom - 1 };

  // from top to bottom
  await dragBetweenCoords(page, inside123, inside789, { steps: 50 });
  await pressForwardDelete(page);
  await page.keyboard.press('a');
  await assertBlockCount(page, 'paragraph', 1);
  await assertRichTexts(page, ['a']);
});

test('native range selection backwards', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const box123 = await getRichTextBoundingBox(page, '2');
  const above123 = { x: box123.left + 1, y: box123.top + 1 };

  const box789 = await getRichTextBoundingBox(page, '4');
  const bottomRight789 = { x: box789.right - 1, y: box789.bottom - 1 };

  // from bottom to top
  await dragBetweenCoords(page, bottomRight789, above123, { steps: 10 });
  await pressBackspace(page);
  await assertBlockCount(page, 'paragraph', 1);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await undoByKeyboard(page);
  // FIXME
  // await assertRichTexts(page, ['123', '456', '789']);

  await redoByKeyboard(page);
  await assertRichTexts(page, ['']);
});

test('native range selection backwards by forwardDelete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const box123 = await getRichTextBoundingBox(page, '2');
  const above123 = { x: box123.left, y: box123.top - 2 };

  const box789 = await getRichTextBoundingBox(page, '4');
  const bottomRight789 = { x: box789.right - 1, y: box789.bottom - 1 };

  // from bottom to top
  await dragBetweenCoords(page, bottomRight789, above123, { steps: 10 });
  await pressForwardDelete(page);
  await assertBlockCount(page, 'paragraph', 1);
  await assertRichTexts(page, ['']);

  await waitNextFrame(page);
  await undoByKeyboard(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await redoByKeyboard(page);
  await assertRichTexts(page, ['']);
});

test('cursor move up and down', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'arrow down test 1');
  await pressEnter(page);
  await type(page, 'arrow down test 2');

  await pressArrowUp(page);
  const textOne = await getInlineSelectionText(page);
  expect(textOne).toBe('arrow down test 1');

  await pressArrowDown(page);
  const textTwo = await getInlineSelectionText(page);
  expect(textTwo).toBe('arrow down test 2');
});

test('cursor move to up and down with children block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'arrow down test 1');
  await pressEnter(page);
  await type(page, 'arrow down test 2');
  await page.keyboard.press('Tab');
  for (let i = 0; i <= 17; i++) {
    await page.keyboard.press('ArrowRight');
  }
  await pressEnter(page);
  await type(page, 'arrow down test 3');
  await pressShiftTab(page);
  for (let i = 0; i < 2; i++) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('ArrowUp');
  const indexOne = await getInlineSelectionIndex(page);
  const textOne = await getInlineSelectionText(page);
  expect(textOne).toBe('arrow down test 2');
  expect(indexOne).toBe(13);
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press('ArrowLeft');
  }
  await page.keyboard.press('ArrowUp');
  const indexTwo = await getInlineSelectionIndex(page);
  const textTwo = await getInlineSelectionText(page);
  expect(textTwo).toBe('arrow down test 1');
  expect(indexTwo).toBeGreaterThanOrEqual(12);
  expect(indexTwo).toBeLessThanOrEqual(17);
  await page.keyboard.press('ArrowDown');
  const textThree = await getInlineSelectionText(page);
  expect(textThree).toBe('arrow down test 2');
});

test('cursor move left and right', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'arrow down test 1');
  await pressEnter(page);
  await type(page, 'arrow down test 2');
  const index1 = await getInlineSelectionIndex(page);
  expect(index1).toBe(17);
  await pressArrowLeft(page, 17);
  const index2 = await getInlineSelectionIndex(page);
  expect(index2).toBe(0);
  await pressArrowLeft(page);
  const index3 = await getInlineSelectionIndex(page);
  expect(index3).toBe(17);
});

test('cursor move up at edge of the second line', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await pressEnter(page);
  const [id, height] = await getCursorBlockIdAndHeight(page);
  if (id && height) {
    await fillLine(page, true);
    await pressArrowLeft(page);
    const [currentId] = await getCursorBlockIdAndHeight(page);
    expect(currentId).toBe(id);
  }
});

test('cursor move down at edge of the last line', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await pressEnter(page);
  const [id] = await getCursorBlockIdAndHeight(page);
  await page.keyboard.press('ArrowUp');
  const [, height] = await getCursorBlockIdAndHeight(page);
  if (id && height) {
    await fillLine(page, true);
    await pressArrowLeft(page);
    await pressArrowDown(page);
    const [currentId] = await getCursorBlockIdAndHeight(page);
    expect(currentId).toBe(id);
  }
});

test('cursor move up and down through note', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await addNoteByClick(page);
  await focusRichText(page, 0);
  let currentId: string | null;
  const [id] = await getCursorBlockIdAndHeight(page);
  await pressArrowDown(page);
  currentId = (await getCursorBlockIdAndHeight(page))[0];
  expect(id).not.toBe(currentId);
  await pressArrowUp(page);
  currentId = (await getCursorBlockIdAndHeight(page))[0];
  expect(id).toBe(currentId);
});

test('double click choose words', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello block suite');
  await assertRichTexts(page, ['hello block suite']);

  const hello = await getRichTextBoundingBox(page, '2');
  const helloPosition = { x: hello.x + 2, y: hello.y + 8 };

  await page.mouse.dblclick(helloPosition.x, helloPosition.y);
  const text = await page.evaluate(() => {
    let text = '';
    const selection = window.getSelection();
    if (selection) {
      text = selection.toString();
    }
    return text;
  });
  expect(text).toBe('hello');
});

test('select all text with dragging and delete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await dragBetweenIndices(page, [0, 0], [2, 3], { x: 1, y: 1 }, undefined, {
    steps: 20,
  });
  await pressBackspace(page);
  await type(page, 'abc');
  const textOne = await getInlineSelectionText(page);
  expect(textOne).toBe('abc');
});

test('select all text with dragging and delete by forwardDelete', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await dragBetweenIndices(page, [0, 0], [2, 3], undefined, undefined, {
    steps: 20,
  });
  await pressForwardDelete(page);
  await type(page, 'abc');
  const textOne = await getInlineSelectionText(page);
  expect(textOne).toBe('abc');
});

test('select all text with keyboard delete', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await focusRichText(page);
  await selectAllByKeyboard(page);
  await pressBackspace(page);
  const text1 = await getInlineSelectionText(page);
  expect(text1).toBe('');
  await type(page, 'abc');
  const text2 = await getInlineSelectionText(page);
  expect(text2).toBe('abc');

  await selectAllByKeyboard(page);
  await selectAllByKeyboard(page);
  await pressBackspace(page);
  await assertRichTexts(page, ['456', '789']);
});

test('select text leaving a few words in the last line and delete', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await dragBetweenIndices(page, [0, 0], [2, 1], undefined, undefined, {
    steps: 20,
  });
  await page.keyboard.press('Backspace');
  await waitNextFrame(page);
  await type(page, 'abc');
  const textOne = await getInlineSelectionText(page);
  expect(textOne).toBe('abc89');
});

test('select text leaving a few words in the last line and delete by forwardDelete', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await dragBetweenIndices(page, [0, 0], [2, 1], undefined, undefined, {
    steps: 20,
  });
  await pressForwardDelete(page);
  await waitNextFrame(page);
  await type(page, 'abc');
  const textOne = await getInlineSelectionText(page);
  expect(textOne).toBe('abc89');
});

test('select text in the same line with dragging leftward and move outside the affine-note', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const noteLeft = await page.evaluate(() => {
    const note = document.querySelector('affine-note');
    if (!note) {
      throw new Error();
    }
    return note.getBoundingClientRect().left;
  });

  // `456`
  const blockRect = await page.evaluate(() => {
    const block = document.querySelector('[data-block-id="3"]');
    if (!block) {
      throw new Error();
    }
    return block.getBoundingClientRect();
  });

  await dragBetweenIndices(
    page,
    [1, 3],
    [1, 0],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    {
      steps: 20,
      async beforeMouseUp() {
        await page.mouse.move(
          noteLeft - 1,
          blockRect.top + blockRect.height / 2
        );
      },
    }
  );
  await pressBackspace(page);
  await type(page, 'abc');
  await assertRichTexts(page, ['123', 'abc', '789']);
});

test('select text in the same line with dragging leftward and move outside the affine-note by forwardDelete', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const noteLeft = await page.evaluate(() => {
    const note = document.querySelector('affine-note');
    if (!note) {
      throw new Error();
    }
    return note.getBoundingClientRect().left;
  });

  // `456`
  const blockRect = await page.evaluate(() => {
    const block = document.querySelector('[data-block-id="3"]');
    if (!block) {
      throw new Error();
    }
    return block.getBoundingClientRect();
  });

  await dragBetweenIndices(
    page,
    [1, 3],
    [1, 0],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    {
      steps: 20,
      async beforeMouseUp() {
        await page.mouse.move(
          noteLeft - 1,
          blockRect.top + blockRect.height / 2
        );
      },
    }
  );
  await pressForwardDelete(page);
  await type(page, 'abc');
  await assertRichTexts(page, ['123', 'abc', '789']);
});

test('select text in the same line with dragging rightward and move outside the affine-note', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const noteRight = await page.evaluate(() => {
    const note = document.querySelector('affine-note');
    if (!note) {
      throw new Error();
    }
    return note.getBoundingClientRect().right;
  });

  // `456`
  const blockRect = await page.evaluate(() => {
    const block = document.querySelector('[data-block-id="3"]');
    if (!block) {
      throw new Error();
    }
    return block.getBoundingClientRect();
  });

  await dragBetweenIndices(
    page,
    [1, 0],
    [1, 3],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    {
      steps: 20,
      async beforeMouseUp() {
        await page.mouse.move(
          noteRight + 1,
          blockRect.top + blockRect.height / 2
        );
      },
    }
  );
  await pressBackspace(page);
  await type(page, 'abc');
  const textOne = await getInlineSelectionText(page);
  expect(textOne).toBe('abc');
});

test('select text in the same line with dragging rightward and move outside the affine-note by forwardDelete', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const noteRight = await page.evaluate(() => {
    const note = document.querySelector('affine-note');
    if (!note) {
      throw new Error();
    }
    return note.getBoundingClientRect().right;
  });

  // `456`
  const blockRect = await page.evaluate(() => {
    const block = document.querySelector('[data-block-id="3"]');
    if (!block) {
      throw new Error();
    }
    return block.getBoundingClientRect();
  });

  await dragBetweenIndices(
    page,
    [1, 0],
    [1, 3],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    {
      steps: 20,
      async beforeMouseUp() {
        await page.mouse.move(
          noteRight + 1,
          blockRect.top + blockRect.height / 2
        );
      },
    }
  );
  await pressForwardDelete(page);
  await type(page, 'abc');
  const textOne = await getInlineSelectionText(page);
  expect(textOne).toBe('abc');
});

test('select text in the same line with dragging rightward and press enter create block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  // blur the editor
  await page.mouse.click(20, 20);

  const box123 = await getRichTextBoundingBox(page, '2');
  const above123 = { x: box123.left + 100, y: box123.top };

  const box789 = await getRichTextBoundingBox(page, '4');
  const below789 = { x: box789.right + 30, y: box789.bottom + 50 };

  await dragBetweenCoords(page, below789, above123, { steps: 50 });
  await page.waitForTimeout(300);

  await pressEnter(page);
  await pressEnter(page);
  await type(page, 'abc');
  await assertRichTexts(page, ['123', '456', '789', 'abc']);
});

test('drag to select tagged text, and copy', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await page.keyboard.insertText('123456789');
  await assertRichTexts(page, ['123456789']);

  await dragBetweenIndices(page, [0, 1], [0, 3], undefined, undefined, {
    steps: 20,
  });
  await page.keyboard.press(`${SHORT_KEY}+B`);
  await dragBetweenIndices(page, [0, 0], [0, 5], undefined, undefined, {
    steps: 20,
  });
  await page.keyboard.press(`${SHORT_KEY}+C`);
  const textOne = await getSelectedTextByInlineEditor(page);
  expect(textOne).toBe('12345');
});

test('drag to select tagged text, and input character', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await page.keyboard.insertText('123456789');
  await assertRichTexts(page, ['123456789']);

  await dragBetweenIndices(page, [0, 1], [0, 3], undefined, undefined, {
    steps: 20,
  });
  await page.keyboard.press(`${SHORT_KEY}+B`);
  await dragBetweenIndices(page, [0, 0], [0, 5], undefined, undefined, {
    steps: 20,
  });
  await type(page, '1');
  const textOne = await getInlineSelectionText(page);
  expect(textOne).toBe('16789');
});

test('Change title when first content is divider', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/1004',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '--- ');
  await assertDivider(page, 1);
  await focusTitle(page);
  await type(page, 'title');
  await assertTitle(page, 'title');
});

test('ArrowUp and ArrowDown to select divider and copy', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '--- ');
  await assertDivider(page, 1);
  await pressEscape(page);
  await pressArrowUp(page);
  await copyByKeyboard(page);
  await pressArrowDown(page);
  await pressEnter(page);
  await pasteByKeyboard(page);
  await assertDivider(page, 2);
});

test('Delete the blank line between two dividers', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '--- ');
  await waitNextFrame(page);
  await assertDivider(page, 1);

  await pressEnter(page);
  await type(page, '--- ');
  await waitNextFrame(page);
  await assertDivider(page, 2);
  await assertRichTexts(page, ['', '']);

  await pressArrowUp(page);
  await assertBlockSelections(page, ['5']);
  await pressArrowUp(page);
  await assertBlockSelections(page, []);
  await assertRichTextInlineRange(page, 0, 0);
  await pressBackspace(page);
  await assertRichTexts(page, ['']);
  await assertBlockSelections(page, ['3']);
  await assertDivider(page, 2);
});

test('Delete the second divider between two dividers by forwardDelete', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '--- ');
  await assertDivider(page, 1);

  await pressEnter(page);
  await type(page, '--- ');
  await assertDivider(page, 2);
  await pressEscape(page);
  await pressArrowUp(page);
  await pressForwardDelete(page);
  await assertDivider(page, 1);
  await assertRichTexts(page, ['', '']);
});

test('should delete line with content after divider not lose content', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '--- ');
  await type(page, '123');
  await assertDivider(page, 1);
  // Jump to line start
  await page.keyboard.press(`${SHORT_KEY}+ArrowLeft`, { delay: 50 });
  await waitNextFrame(page);
  await pressBackspace(page, 2);
  await assertDivider(page, 0);
  await assertRichTexts(page, ['123']);
});

test('should forwardDelete divider works properly', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '123');
  await pressEnter(page);
  await type(page, '--- ');
  await assertDivider(page, 1);
  // Jump to first line start
  await pressEscape(page);
  await pressArrowUp(page);
  await page.keyboard.press(`${SHORT_KEY}+ArrowRight`, { delay: 50 });
  await pressForwardDelete(page);
  await assertDivider(page, 0);
  await assertRichTexts(page, ['123', '']);
});

test('the cursor should move to closest editor block when clicking outside container', async ({
  page,
}) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/pull/570',
  });
  // This test only works in playwright or touch device!
  test.fail();
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const text2 = page.locator('[data-block-id="3"] .inline-editor');
  const rect = await text2.boundingBox();
  if (!rect) {
    throw new Error('rect is not found');
  }

  // The behavior of mouse click is similar to touch in mobile device
  // await page.mouse.click(rect.x - 50, rect.y + 5);
  await page.mouse.move(rect.x - 50, rect.y + 5);
  await page.mouse.down();
  await page.mouse.up();

  await pressArrowLeft(page, 4);
  await pressBackspace(page);
  await waitNextFrame(page);
  await assertRichTexts(page, ['123456', '789']);

  await undoByKeyboard(page);
  await waitNextFrame(page);

  // await page.mouse.click(rect.x + rect.width + 50, rect.y + 5);
  await page.mouse.move(rect.x + rect.width + 50, rect.y + 5);
  await page.mouse.down();
  await page.mouse.up();
  await waitNextFrame(page);

  await pressArrowLeft(page);
  await pressBackspace(page);
  await waitNextFrame(page);
  await assertRichTexts(page, ['123', '46', '789']);
});

test('should not crash when mouse over the left side of the list block prefix', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeLists(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await dragBetweenIndices(page, [1, 2], [1, 0]);
  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '45');

  // `456`
  const prefixIconRect = await page.evaluate(() => {
    const block = document.querySelector('[data-block-id="4"]');
    if (!block) {
      throw new Error();
    }
    const prefixIcon = block.querySelector('.affine-list-block__prefix ');
    if (!prefixIcon) {
      throw new Error();
    }
    return prefixIcon.getBoundingClientRect();
  });

  await dragBetweenIndices(
    page,
    [1, 2],
    [1, 0],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    {
      beforeMouseUp: async () => {
        await page.mouse.move(prefixIconRect.left - 1, prefixIconRect.top);
      },
    }
  );

  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '45');
});

test('should set the last block to end the range after when leaving the affine-note', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await dragBetweenIndices(page, [0, 2], [2, 1]);
  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '34567');
  // blur
  await page.mouse.click(0, 0);

  await dragBetweenIndices(
    page,
    [0, 2],
    [2, 1],
    { x: 0, y: 0 },
    { x: 0, y: 30 } // drag below the bottom of the last block
  );
  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '3456789');
});

test('should set the first block to start the range before when leaving the affine-note-block-container', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await dragBetweenIndices(page, [2, 1], [0, 2]);
  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '34567');
  // blur
  await page.mouse.click(0, 0);

  await dragBetweenIndices(
    page,
    [2, 1],
    [0, 2],
    { x: 0, y: 0 },
    { x: 0, y: -30 } // drag above the top of the first block
  );
  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '1234567');
});

test('should select texts on cross-note dragging', async ({ page }) => {
  await enterPlaygroundRoom(page);
  const { rootId } = await initEmptyParagraphState(page);
  await initThreeParagraphs(page);

  await initEmptyParagraphState(page, rootId);

  // focus last block in first note
  await setInlineRangeInInlineEditor(
    page,
    {
      index: 3,
      length: 0,
    },
    3
  );
  // goto next note
  await pressArrowDown(page);
  await waitNextFrame(page);
  await type(page, 'ABC');

  await assertRichTexts(page, ['123', '456', '789', 'ABC']);

  // blur
  await page.mouse.click(0, 0);

  await dragBetweenIndices(
    page,
    [0, 2],
    [3, 1],
    { x: 0, y: 0 },
    { x: 0, y: 30 } // drag below the bottom of the last block
  );

  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '3456789ABC');
});

test('should select full text of the first block when leaving the affine-note-block-container in edgeless mode', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  const ids = await initEmptyEdgelessState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await switchEditorMode(page);
  await activeNoteInEdgeless(page, ids.noteId);
  await dragBetweenIndices(page, [2, 1], [0, 2], undefined, undefined, {
    click: true,
  });
  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '34567');

  const containerRect = await page.evaluate(() => {
    const container = document.querySelector('.affine-note-block-container');
    if (!container) {
      throw new Error();
    }
    return container.getBoundingClientRect();
  });

  await dragBetweenIndices(
    page,
    [2, 1],
    [0, 2],
    { x: 0, y: 0 },
    { x: 0, y: 0 }, // drag above the top of the first block
    {
      beforeMouseUp: async () => {
        await page.mouse.move(containerRect.left, containerRect.top - 30);
      },
    }
  );
});

test('should add a new line when clicking the bottom of the last non-text block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await pressEnter(page);
  await waitNextFrame(page);

  // code block
  await type(page, '```');
  await pressEnter(page);

  const locator = page.locator('affine-code');
  await expect(locator).toBeVisible();

  await type(page, 'ABC');
  await waitNextFrame(page);
  await assertRichTexts(page, ['123', '456', '789', 'ABC']);
});

test('should select texts on dragging around the page', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const coord = await getIndexCoordinate(page, [1, 2]);

  // blur
  await page.mouse.click(0, 0);
  await page.mouse.move(coord.x, coord.y);
  await page.mouse.down();
  // 123
  // 45|6
  // 789|
  await page.mouse.move(coord.x + 26, coord.y + 90, { steps: 20 });
  await page.mouse.up();
  await page.keyboard.press('Backspace');
  await waitNextFrame(page);
  await assertRichTexts(page, ['123', '45']);

  await waitNextFrame(page);
  await undoByKeyboard(page);

  // blur
  await page.mouse.click(0, 0);
  await page.mouse.move(coord.x, coord.y);
  await page.mouse.down();
  await page.mouse.move(coord.x + 26, coord.y + 90, { steps: 20 });
  await page.mouse.up();
  await page.keyboard.press('Backspace');
  await waitNextFrame(page);
  await assertRichTexts(page, ['123', '45']);
});

test('indent native multi-selection block', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await pressEnter(page);
  await type(page, '012');
  await assertRichTexts(page, ['123', '456', '789', '012']);

  const from = {
    blockId: '3',
    index: 1,
    length: 2,
  };
  const to = {
    blockId: '5',
    index: 0,
    length: 1,
  };

  await setSelection(page, 3, 1, 5, 1);
  await assertTextSelection(page, from, to);
  await waitNextFrame(page);
  await pressTab(page);
  // should restore selection
  await assertTextSelection(page, from, to);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_after_tab.json`
  );

  await setSelection(page, 3, 1, 5, 1);
  await assertTextSelection(page, from, to);
  await waitNextFrame(page);
  await pressShiftTab(page);
  // should restore selection
  await assertTextSelection(page, from, to);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_after_shift_tab.json`
  );
});

test('should clear native selection before block selection', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await dragBetweenIndices(
    page,
    [1, 3],
    [1, 0],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    { steps: 20 }
  );

  const text0 = await getInlineSelectionText(page);

  // `123`
  const first = await page.evaluate(() => {
    const first = document.querySelector('[data-block-id="2"]');
    if (!first) {
      throw new Error();
    }
    return first.getBoundingClientRect();
  });

  await dragBetweenCoords(
    page,
    {
      x: first.right + 10,
      y: first.top + 1,
    },
    {
      x: first.right - 10,
      y: first.top + 2,
    }
  );

  await waitNextFrame(page);
  const textCount = await page.evaluate(() => {
    return window.getSelection()?.rangeCount || 0;
  });

  expect(text0).toBe('456');
  expect(textCount).toBe(0);
  const rects = page.locator('affine-block-selection').locator('visible=true');
  await expect(rects).toHaveCount(1);
});

// ↑
test('should keep native range selection when scrolling backward with the scroll wheel', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  for (let i = 0; i < 10; i++) {
    await pressEnter(page);
  }

  await type(page, '987');
  await pressEnter(page);
  await type(page, '654');
  await pressEnter(page);
  await type(page, '321');

  const data = Array.from({ length: 9 }, () => '');
  data.unshift('123', '456', '789');
  data.push('987', '654', '321');
  await assertRichTexts(page, data);

  const blockHeight = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const distance = viewport.scrollHeight - viewport.clientHeight;
    viewport.scrollTo(0, distance);
    const container = viewport.querySelector(
      'affine-note .affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    const first = container.firstElementChild;
    if (!first) {
      throw new Error();
    }
    const second = first.nextElementSibling;
    if (!second) {
      throw new Error();
    }
    return (
      second.getBoundingClientRect().top - first.getBoundingClientRect().top
    );
  });
  await page.waitForTimeout(250);

  await page.mouse.move(0, 0);

  await dragBetweenIndices(
    page,
    [14, 3],
    [14, 0],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    {
      // dont release mouse
      beforeMouseUp: async () => {
        await page.mouse.wheel(0, -blockHeight * 4);
        await page.waitForTimeout(250);
      },
    }
  );

  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '987654321');
});

// ↓
test('should keep native range selection when scrolling forward with the scroll wheel', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  for (let i = 0; i < 10; i++) {
    await pressEnter(page);
  }

  await type(page, '987');
  await pressEnter(page);
  await type(page, '654');
  await pressEnter(page);
  await type(page, '321');

  const data = Array.from({ length: 9 }, () => '');
  data.unshift('123', '456', '789');
  data.push('987', '654', '321');
  await assertRichTexts(page, data);

  const blockHeight = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error();
    }
    const container = viewport.querySelector(
      'affine-note .affine-block-children-container'
    );
    if (!container) {
      throw new Error();
    }
    const first = container.firstElementChild;
    if (!first) {
      throw new Error();
    }
    const second = first.nextElementSibling;
    if (!second) {
      throw new Error();
    }
    return (
      second.getBoundingClientRect().top - first.getBoundingClientRect().top
    );
  });
  await page.waitForTimeout(250);

  await page.evaluate(() => {
    document.querySelector('.affine-page-viewport')?.scrollTo(0, 0);
  });
  await page.mouse.move(0, 0);

  await dragBetweenIndices(
    page,
    [0, 0],
    [0, 3],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    {
      // dont release mouse
      beforeMouseUp: async () => {
        await page.mouse.wheel(0, blockHeight * 3);
        await page.waitForTimeout(250);
      },
    }
  );

  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '123456789');
});

test('should not show toolbar of image on native selection', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initImageState(page);
  await activeEmbed(page);

  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');

  await expect(toolbar).toBeVisible();

  await pressEscape(page);
  await pressEnter(page);
  await type(page, '123');

  await page.mouse.click(0, 0);

  await dragBetweenIndices(
    page,
    [0, 1],
    [0, 0],
    { x: 0, y: 0 },
    { x: -40, y: 0 }
  );

  await waitNextFrame(page);

  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '123');

  await page.mouse.click(0, 0);

  await dragBetweenIndices(
    page,
    [0, 1],
    [0, 0],
    { x: 0, y: 0 },
    { x: -40, y: -100 }
  );

  await waitNextFrame(page);

  await copyByKeyboard(page);
  assertClipItems(page, 'text/plain', '123');

  await expect(toolbar).toBeHidden();
});

test('should select with shift-click', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await focusRichText(page);

  await page.click('[data-block-id="4"] [data-v-text]', {
    modifiers: ['Shift'],
  });
  expect(await getSelectedText(page)).toContain('4567');
});

test('should collapse to end when press arrow-right on multi-line selection', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);
  await dragBetweenIndices(page, [0, 0], [1, 2]);
  expect(await getSelectedText(page)).toBe('12345');
  await pressArrowRight(page);
  await pressBackspace(page);
  await assertRichTexts(page, ['123', '46', '789']);
});

test('should collapse to start when press arrow-left on multi-line selection', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await dragBetweenIndices(page, [0, 1], [1, 2]);
  expect(await getSelectedText(page)).toBe('2345');
  await pressArrowLeft(page);
  await pressBackspace(page);
  await assertRichTexts(page, ['23', '456', '789']);
});

test('should select when clicking on blank area in edgeless mode', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  const ids = await initEmptyEdgelessState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  await switchEditorMode(page);
  await activeNoteInEdgeless(page, ids.noteId);

  const r1 = await page.locator('[data-block-id="3"]').boundingBox();
  const r2 = await page.locator('[data-block-id="4"]').boundingBox();
  const r3 = await page.locator('[data-block-id="5"]').boundingBox();
  if (!r1 || !r2 || !r3) {
    throw new Error();
  }

  await click(page, { x: r3.x + 40, y: r3.y + 5 });
  await waitNextFrame(page);

  expect(await getInlineSelectionText(page)).toBe('789');
});

test('press ArrowLeft in the start of first paragraph should not focus on title', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page, 0);
  await type(page, '123');
  await pressArrowLeft(page, 5);

  await type(page, 'title');
  await assertTitle(page, '');
});

test('should not scroll page when mouse is click down', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/5034',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  for (let i = 0; i < 10; i++) {
    await pressEnter(page);
  }
  for (let i = 0; i < 20; i++) {
    await type(page, String(i));
    await pressShiftEnter(page);
  }
  await assertRichTexts(page, [
    ...' '.repeat(9).split(' '), // 10 empty paragraph
    '0\n1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n16\n17\n18\n19\n',
  ]);

  await scrollToTop(page);
  await focusRichText(page, 0);

  const editorHost = getEditorHostLocator(page);
  const longText = editorHost.locator('rich-text').nth(10);
  const rect = await longText.boundingBox();
  if (!rect) throw new Error();
  await page.mouse.move(rect.x + rect.width / 2, rect.y + rect.height / 2);
  await assertRichTextInlineRange(page, 0, 0);

  await page.mouse.down();
  await assertRichTextInlineRange(page, 10, 22);
  // simulate user click down and wait for 500ms
  await waitNextFrame(page, 500);
  await page.mouse.up();
  await assertRichTextInlineRange(page, 10, 22);
});

test('scroll vertically when inputting long text in a block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  for (let i = 0; i < 40; i++) {
    await type(page, String(i));
    await pressShiftEnter(page);
  }

  const viewportScrollTop = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error('viewport not found');
    }
    return viewport.scrollTop;
  });

  expect(viewportScrollTop).toBeGreaterThan(100);
});

test('scroll vertically when adding multiple blocks', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  for (let i = 0; i < 40; i++) {
    await type(page, String(i));
    await pressEnter(page);
  }

  const viewportScrollTop = await page.evaluate(() => {
    const viewport = document.querySelector('.affine-page-viewport');
    if (!viewport) {
      throw new Error('viewport not found');
    }
    return viewport.scrollTop;
  });

  expect(viewportScrollTop).toBeGreaterThan(400);
});

test('click to select divided', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/4547',
  });

  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await type(page, '--- ');
  await assertDivider(page, 1);

  await page.click('affine-divider');
  const selectedBlocks = page
    .locator('affine-block-selection')
    .locator('visible=true');
  await expect(selectedBlocks).toHaveCount(1);

  await pressForwardDelete(page);
  await assertDivider(page, 0);
});

test('auto-scroll when creating a new paragraph-block by pressing enter', async ({
  page,
}) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/4547',
  });

  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);

  const getScrollTop = async () => {
    return page.evaluate(() => {
      const viewport = document.querySelector('.affine-page-viewport');
      if (!viewport) {
        throw new Error();
      }
      return viewport.scrollTop;
    });
  };

  await pressEnter(page, 30);
  const oldScrollTop = await getScrollTop();

  await pressEnter(page, 30);
  const newScrollTop = await getScrollTop();

  expect(newScrollTop).toBeGreaterThan(oldScrollTop);
});

test('Use arrow up and down to select two types of block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '123');
  await pressEnter(page);
  await type(page, '--- --- ');
  await type(page, '123');
  await pressEnter(page);
  await type(page, '--- 123');
  // 123
  // ---
  // ---
  // 123
  // ---
  // 123

  await assertDivider(page, 3);
  await assertRichTexts(page, ['123', '123', '123']);

  // from bottom to top
  await assertNativeSelectionRangeCount(page, 1);
  await assertRichTextInlineRange(page, 2, 3);
  await pressArrowUp(page);
  await assertNativeSelectionRangeCount(page, 0);
  await assertBlockSelections(page, ['7']);
  await pressArrowUp(page);
  await assertNativeSelectionRangeCount(page, 1);
  await assertRichTextInlineRange(page, 1, 3);
  await pressArrowUp(page);
  await assertNativeSelectionRangeCount(page, 0);
  await assertBlockSelections(page, ['5']);
  await pressArrowUp(page);
  await assertNativeSelectionRangeCount(page, 0);
  await assertBlockSelections(page, ['4']);
  await pressArrowUp(page);
  await assertNativeSelectionRangeCount(page, 1);
  await assertRichTextInlineRange(page, 0, 3);

  // from top to bottom
  await pressArrowDown(page);
  await assertNativeSelectionRangeCount(page, 0);
  await assertBlockSelections(page, ['4']);
  await pressArrowDown(page);
  await assertNativeSelectionRangeCount(page, 0);
  await assertBlockSelections(page, ['5']);
  await pressArrowDown(page);
  await assertNativeSelectionRangeCount(page, 1);
  await assertRichTextInlineRange(page, 1, 0);
  await pressArrowDown(page);
  await assertNativeSelectionRangeCount(page, 0);
  await assertBlockSelections(page, ['7']);
  await pressArrowDown(page);
  await assertNativeSelectionRangeCount(page, 1);
  await assertRichTextInlineRange(page, 2, 0);
});

test.describe('should scroll text to view when drag to select at top or bottom edge', () => {
  test('from top to bottom', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    for (let i = 0; i < 50; i++) {
      await type(page, `${i}`);
      await pressEnter(page);
    }

    const startCoord = await getIndexCoordinate(page, [49, 2]);
    const endCoord = await getIndexCoordinate(page, [0, 0]);

    // simulate actual drag to select from bottom to top
    await page.mouse.move(startCoord.x, startCoord.y);
    await page.mouse.down();
    await page.mouse.move(endCoord.x, 0); // move to top edge
    await page.waitForTimeout(5000);
    await page.mouse.up();

    const firstParagraph = page.locator('[data-block-id="2"]');
    await expect(firstParagraph).toBeInViewport();
  });

  // playwright doesn't auto scroll when drag selection to bottom edge
  test.skip('from bottom to top', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);
    for (let i = 0; i < 50; i++) {
      await type(page, `${i}`);
      await pressEnter(page);
    }

    const firstParagraph = page.locator('[data-block-id="2"]');
    await firstParagraph.scrollIntoViewIfNeeded();

    const startCoord = await getIndexCoordinate(page, [0, 0]);
    const endCoord = await getIndexCoordinate(page, [49, 2]);

    const viewportHeight = await page.evaluate(
      () => document.documentElement.clientHeight
    );

    // simulate actual drag to select from top to bottom
    await page.mouse.move(startCoord.x, startCoord.y);
    await page.mouse.down();
    await page.mouse.move(endCoord.x, viewportHeight - 10); // move to bottom edge
    await page.waitForTimeout(5000);
    await page.mouse.up();

    const lastParagraph = page.locator('[data-block-id="51"]');
    await expect(lastParagraph).toBeInViewport();
  });
});

test('abnormal cursor jumping', async ({ page }) => {
  // https://github.com/toeverything/blocksuite/pull/8552

  await enterPlaygroundRoom(page);
  await initImageState(page);

  await pressEnter(page);
  await page.locator('affine-image block-zero-width .block-zero-width').click();
  await pressArrowUp(page);
  await pressTab(page);
  await pressArrowDown(page);
  await pressTab(page);
  await pressEnter(page, 12);

  const image = page.locator('affine-image');
  const rect = await image.boundingBox();
  // make sure the image is out of view
  expect(rect?.y).toBeLessThan(0);

  await setSelection(page, 4, 0, 4, 0);
  await type(page, 'aaaaaaaaaaaaaa');
  await page.locator('[data-block-id="4"]').dblclick({
    position: {
      x: 50,
      y: 5,
    },
  });
  const newRect = await image.boundingBox();
  expect(rect).toEqual(newRect);
});

test('unexpected scroll when clicking padding area', async ({ page }) => {
  // https://github.com/toeverything/blocksuite/pull/8678

  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await pressEnter(page, 30);
  await pressArrowUp(page, 5);
  await type(page, '1. aaa\nbbb');
  await pressTab(page);

  const list = page.locator('[data-block-id="34"]');
  const listRect = await list.boundingBox();
  if (!listRect) {
    throw new Error('listRect is not found');
  }
  await page.mouse.click(listRect.x - 30, listRect.y + 5);
  const newListRect = await list.boundingBox();
  // not scroll
  expect(listRect).toEqual(newListRect);

  await pressArrowUp(page, 4);
  await type(page, '/tableview\n');
  const database = page.locator('affine-database');
  const databaseRect = await database.boundingBox();
  if (!databaseRect) {
    throw new Error('databaseRect is not found');
  }
  await page.mouse.click(
    databaseRect.x + databaseRect.width + 10,
    databaseRect.y + 100
  );
  const newDatabaseRect = await database.boundingBox();
  // not scroll
  expect(databaseRect).toEqual(newDatabaseRect);
});
