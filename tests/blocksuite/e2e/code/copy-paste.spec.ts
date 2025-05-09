import { expect } from '@playwright/test';

import {
  copyByKeyboard,
  pasteByKeyboard,
  pressArrowLeft,
  pressEnter,
  pressEnterWithShortkey,
  selectAllByKeyboard,
  type,
} from '../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  getInlineSelectionText,
  getPageSnapshot,
  initEmptyCodeBlockState,
  setSelection,
} from '../utils/actions/misc.js';
import { assertRichTextInlineRange } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';
import { getCodeBlock } from './utils.js';

test('keyboard selection and copy paste', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'use');
  await page.keyboard.down('Shift');
  await pressArrowLeft(page, 'use'.length);
  await page.keyboard.up('Shift');
  await copyByKeyboard(page);
  await pressArrowLeft(page, 1);
  await pasteByKeyboard(page);

  const content = await getInlineSelectionText(page);
  expect(content).toBe('useuse');

  await assertRichTextInlineRange(page, 0, 3, 0);
});

test('paste with more than one continuous breakline should remain in code block, ', async ({
  page,
}) => {
  await page.setContent(`<div contenteditable>use super::*;
use fern::{
    colors::{Color, ColoredLevelConfig},
    Dispatch,
};
<br><br>
#[inline]</div>`);
  await page.focus('div');
  await selectAllByKeyboard(page);
  await copyByKeyboard(page);

  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);
  await pasteByKeyboard(page);

  const locator = page.locator('affine-paragraph');
  await expect(locator).toBeHidden();
});

test('drag copy paste', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'use');

  await setSelection(page, 2, 0, 2, 3);
  await copyByKeyboard(page);
  await pressArrowLeft(page);
  await pasteByKeyboard(page);

  const content = await getInlineSelectionText(page);
  expect(content).toBe('useuse');

  await assertRichTextInlineRange(page, 0, 3, 0);
});

test.skip('use keyboard copy inside code block copy', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'use');
  await page.keyboard.down('Shift');
  // eslint-disable-next-line @typescript-eslint/prefer-for-of
  for (let i = 0; i < 'use'.length; i++) {
    await page.keyboard.press('ArrowLeft');
  }
  await page.keyboard.up('Shift');
  await copyByKeyboard(page);
  await page.keyboard.press('ArrowRight');
  await pressEnter(page);
  await pressEnter(page);
  await pasteByKeyboard(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_pasted.json`
  );
});

test('code block has content, click code block copy menu, copy whole code block', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page, { language: 'javascript' });
  await focusRichText(page);
  await page.keyboard.type('use');
  await pressEnterWithShortkey(page);

  const codeBlockController = getCodeBlock(page);
  await codeBlockController.codeBlock.hover();

  await expect(codeBlockController.copyButton).toBeVisible();
  await codeBlockController.copyButton.click();

  await focusRichText(page, 1);
  await pasteByKeyboard(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_pasted.json`
  );
});

test('code block is empty, click code block copy menu, copy the empty code block', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page, { language: 'javascript' });
  await focusRichText(page);

  await pressEnterWithShortkey(page);

  const codeBlockController = getCodeBlock(page);
  await codeBlockController.codeBlock.hover();
  await expect(codeBlockController.copyButton).toBeVisible();
  await codeBlockController.copyButton.click();

  await focusRichText(page, 1);
  await pasteByKeyboard(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_pasted.json`
  );
});
