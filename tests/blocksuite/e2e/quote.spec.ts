import {
  enterPlaygroundRoom,
  focusRichText,
  initEmptyParagraphState,
  pressArrowDown,
  pressArrowRight,
  pressArrowUp,
  pressEnter,
  type,
} from './utils/actions/index.js';
import {
  assertRichTextInlineRange,
  assertTextContain,
} from './utils/asserts.js';
import { test } from './utils/playwright.js';

test('prohibit creating divider within quote', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/995',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '>');
  await page.keyboard.press('Space', { delay: 50 });
  await focusRichText(page);
  await type(page, '123');
  await pressEnter(page);
  await type(page, '---');
  await page.keyboard.press('Space', { delay: 50 });
  await assertTextContain(page, '---');
});

test('quote arrow up/down', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/2834',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'aaaaa');
  await pressEnter(page);
  await type(page, 'aaaaa');
  await pressEnter(page);
  await type(page, 'aaa');
  await pressEnter(page);
  await type(page, '> aaaaaaaaa');
  await pressEnter(page);
  await type(page, 'aaa');
  await pressEnter(page);
  await type(page, 'aaaaaaaaa');
  await pressEnter(page);
  await pressEnter(page);
  await type(page, 'aaaaa');
  await pressEnter(page);
  await type(page, 'aaaaa');
  await pressEnter(page);
  await type(page, 'aaa');

  await assertRichTextInlineRange(page, 6, 3, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 5, 3, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 4, 3, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 3, 15, 0);
  await pressArrowRight(page, 8);
  await assertRichTextInlineRange(page, 3, 23, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 3, 13, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 3, 9, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 2, 3, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 1, 5, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 0, 5, 0);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 0, 0, 0);
  await pressArrowRight(page, 4);
  await assertRichTextInlineRange(page, 0, 4, 0);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 1, 4, 0);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 2, 3, 0);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 3, 2, 0);
  await pressArrowRight(page, 8);
  await assertRichTextInlineRange(page, 3, 10, 0);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 3, 14, 0);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 4, 2, 0);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 5, 2, 0);
  await pressArrowDown(page);
  await assertRichTextInlineRange(page, 6, 2, 0);
});
