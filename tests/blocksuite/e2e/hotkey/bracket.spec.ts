import { expect } from '@playwright/test';

import {
  dragBetweenIndices,
  enterPlaygroundRoom,
  focusRichText,
  getPageSnapshot,
  initEmptyCodeBlockState,
  initEmptyParagraphState,
  initThreeParagraphs,
  resetHistory,
  type,
  undoByClick,
} from '../utils/actions/index.js';
import { assertRichTexts } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test('should bracket complete works', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '([{');
  // type without selection should not trigger bracket complete
  await assertRichTexts(page, ['([{']);

  await dragBetweenIndices(page, [0, 1], [0, 2]);
  await type(page, '(');
  await assertRichTexts(page, ['(([){']);

  await type(page, ')');
  // Should not trigger bracket complete when type right bracket
  await assertRichTexts(page, ['(()){']);
});

test('bracket complete should not work when selecting mutiple lines', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);

  // 1(23 45)6 789
  await dragBetweenIndices(page, [0, 1], [1, 2]);
  await type(page, '(');
  await assertRichTexts(page, ['1(6', '789']);
});

test('should bracket complete with backtick works', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'hello world');

  await dragBetweenIndices(page, [0, 2], [0, 5]);
  await resetHistory(page);
  await type(page, '`');
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );

  await undoByClick(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_undo.json`
  );
});

test('auto delete bracket right', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);
  await type(page, '(');
  await assertRichTexts(page, ['()']);
  await type(page, '(');
  await assertRichTexts(page, ['(())']);
  await page.keyboard.press('Backspace');
  await assertRichTexts(page, ['()']);
  await page.keyboard.press('Backspace');
  await assertRichTexts(page, ['']);
});

test('skip redundant right bracket', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);
  await type(page, '(');
  await assertRichTexts(page, ['()']);
  await type(page, ')');
  await assertRichTexts(page, ['()']);
  await type(page, ')');
  await assertRichTexts(page, ['())']);
});
