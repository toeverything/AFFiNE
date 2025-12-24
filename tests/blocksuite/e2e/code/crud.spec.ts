import { expect } from '@playwright/test';

import { updateBlockType } from '../utils/actions/block.js';
import { dragBetweenIndices } from '../utils/actions/drag.js';
import {
  createCodeBlock,
  pressArrowLeft,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  pressEscape,
  pressShiftTab,
  pressTab,
  redoByKeyboard,
  type,
  undoByKeyboard,
} from '../utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  focusRichTextEnd,
  getPageSnapshot,
  initEmptyCodeBlockState,
  initEmptyParagraphState,
  setSelection,
  waitNextFrame,
} from '../utils/actions/misc.js';
import {
  assertBlockCount,
  assertRichTexts,
  assertTitle,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';
import { getFormatBar } from '../utils/query.js';
import { getCodeBlock } from './utils.js';

test('use debug menu can create code block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await updateBlockType(page, 'affine:code');

  const locator = page.locator('affine-code');
  await expect(locator).toBeVisible();
});

test('use markdown syntax can create code block', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaa');
  await pressEnter(page);
  await type(page, 'bbb');
  await pressTab(page);
  await pressEnter(page);
  await type(page, 'ccc');
  await pressTab(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  await setSelection(page, 2, 0, 2, 0);
  // |aaa
  //   bbb
  //     ccc

  await type(page, '``` ');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_markdown_syntax.json`
  );
});

test('use markdown syntax with trailing characters can create code block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await type(page, '```JavaScript');
  await type(page, ' ');

  const locator = page.locator('affine-code');
  await expect(locator).toBeVisible();
});

test('support ```[lang] to add code block with language', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/1314',
  });

  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await type(page, '```ts');
  await type(page, ' ');

  const codeBlockController = getCodeBlock(page);
  const codeLocator = codeBlockController.codeBlock;
  await expect(codeLocator).toBeVisible();

  const codeRect = await codeLocator.boundingBox();
  if (!codeRect) {
    throw new Error('Failed to get bounding box of code block.');
  }
  const position = {
    x: codeRect.x + codeRect.width / 2,
    y: codeRect.y + codeRect.height / 2,
  };
  await page.mouse.move(position.x, position.y);

  const languageButton = codeBlockController.languageButton;
  await expect(languageButton).toBeVisible();
  await expect(languageButton).toHaveText('TypeScript');
});

test('use more than three backticks can not create code block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await type(page, '`````');
  await type(page, ' ');

  const codeBlockLocator = page.locator('affine-code');
  await expect(codeBlockLocator).toBeHidden();
  const inlineCodelocator = page.getByText('```');
  await expect(inlineCodelocator).toBeVisible();
  expect(await inlineCodelocator.count()).toEqual(1);
});

test('use shortcut can create code block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await createCodeBlock(page);

  const locator = page.locator('affine-code');
  await expect(locator).toBeVisible();
});

test('change code language can work', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  const codeBlockController = getCodeBlock(page);
  await codeBlockController.codeBlock.hover();
  await codeBlockController.clickLanguageButton();
  const locator = codeBlockController.langList;
  await expect(locator).toBeVisible();

  await type(page, 'rust');
  await page.click(
    '.affine-filterable-list > .items-container > icon-button:nth-child(1)'
  );
  await expect(locator).toBeHidden();

  await codeBlockController.codeBlock.hover();
  await expect(codeBlockController.languageButton).toHaveText('Rust');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );
  await undoByKeyboard(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_2.json`
  );

  // Can switch to another language
  await codeBlockController.clickLanguageButton();
  await type(page, 'ty');
  await pressEnter(page);
  await expect(locator).toBeHidden();
  await expect(codeBlockController.languageButton).toHaveText('TypeScript');
});

test('duplicate code block', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page, { language: 'javascript' });

  const codeBlockController = getCodeBlock(page);
  await codeBlockController.codeBlock.hover();

  // change language
  await codeBlockController.clickLanguageButton();
  const langLocator = codeBlockController.langList;
  await expect(langLocator).toBeVisible();
  await type(page, 'rust');
  await page.click(
    '.affine-filterable-list > .items-container > icon-button:nth-child(1)'
  );

  // add text
  await focusRichTextEnd(page);
  await type(page, 'let a: u8 = 7');
  await pressEscape(page);
  await waitNextFrame(page, 100);

  // add a caption
  await codeBlockController.codeBlock.hover();
  await codeBlockController.captionButton.click();
  await type(page, 'BlockSuite');
  await pressEnter(page);
  await pressBackspace(page); // remove paragraph
  await waitNextFrame(page, 100);

  // turn on wrap
  await codeBlockController.codeBlock.hover();
  await (await codeBlockController.openMore()).wrapButton.click();

  await page.mouse.click(300, 300);

  // duplicate
  await codeBlockController.codeBlock.hover();
  await (await codeBlockController.openMore()).duplicateButton.click();

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_final.json`
  );
});

test('delete code block in more menu', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page, { language: 'javascript' });

  const codeBlockController = getCodeBlock(page);
  await codeBlockController.codeBlock.hover();
  const moreMenu = await codeBlockController.openMore();

  await expect(moreMenu.menu).toBeVisible();
  await moreMenu.deleteButton.click();

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_final.json`
  );
});

test('undo and redo works in code block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'const a = 10;');
  await assertRichTexts(page, ['const a = 10;']);
  await undoByKeyboard(page);
  await assertRichTexts(page, ['']);

  await redoByKeyboard(page);
  await assertRichTexts(page, ['const a = 10;']);
});

test('toggle code block wrap can work', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);

  const codeBlockController = getCodeBlock(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );

  await codeBlockController.codeBlock.hover();
  await (await codeBlockController.openMore()).wrapButton.click();

  await page.mouse.click(300, 300);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_2.json`
  );

  await codeBlockController.codeBlock.hover();
  await (await codeBlockController.openMore()).cancelWrapButton.click();

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_3.json`
  );
});

test('add caption works', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);

  const codeBlockController = getCodeBlock(page);
  await codeBlockController.codeBlock.hover();
  await codeBlockController.captionButton.click();
  await type(page, 'BlockSuite');
  await pressEnter(page);
  await waitNextFrame(page, 100);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test('undo code block wrap can work', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  const codeBlockController = getCodeBlock(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );

  await codeBlockController.codeBlock.hover();
  await (await codeBlockController.openMore()).wrapButton.click();
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_2.json`
  );

  await focusRichText(page);
  await undoByKeyboard(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_3.json`
  );
});

test('toggle code block line number can work', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  const lineNumber = page.locator('affine-code .line-number');

  await expect(lineNumber).toBeVisible();

  const codeBlockController = getCodeBlock(page);

  await codeBlockController.codeBlock.hover();
  await (await codeBlockController.openMore()).cancelLineNumberButton.click();

  await page.mouse.click(300, 300);

  await expect(lineNumber).toBeHidden();

  await undoByKeyboard(page);
  await expect(lineNumber).toBeVisible();

  await redoByKeyboard(page);
  await expect(lineNumber).toBeHidden();

  await codeBlockController.codeBlock.hover();
  await (await codeBlockController.openMore()).lineNumberButton.click();

  await expect(lineNumber).toBeVisible();
});

test('code block toolbar widget can appear and disappear during mousemove', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  const position = await page.locator('affine-code').boundingBox();
  if (!position) throw new Error('Failed to get affine code position');
  await page.mouse.move(position.x, position.y);

  const locator = page.locator('.code-toolbar-container');
  const toolbarPosition = await locator.boundingBox();
  if (!toolbarPosition) throw new Error('Failed to get option position');
  await page.mouse.move(toolbarPosition.x, toolbarPosition.y);
  await expect(locator).toBeVisible();
  await page.mouse.move(position.x - 10, position.y - 10);
  await expect(locator).toBeHidden();
});

test('should tab works in code block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'const a = 10;');
  await assertRichTexts(page, ['const a = 10;']);
  await page.keyboard.press('Tab', { delay: 50 });
  await assertRichTexts(page, ['  const a = 10;']);
  await page.keyboard.press(`Shift+Tab`, { delay: 50 });
  await assertRichTexts(page, ['const a = 10;']);

  await page.keyboard.press('Enter', { delay: 50 });
  await type(page, 'const b = "NothingToSay');
  await page.keyboard.press('ArrowUp', { delay: 50 });
  await page.keyboard.press('Enter', { delay: 50 });
  await page.keyboard.press('Tab', { delay: 50 });
  await assertRichTexts(page, ['const a = 10;\n  \nconst b = "NothingToSay"']);
});

test('should open more menu and do not close after selecting', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  const codeBlockController = getCodeBlock(page);
  await codeBlockController.codeBlock.hover();
  await expect(codeBlockController.codeToolbar).toBeVisible();
  const moreMenu = await codeBlockController.openMore();

  await expect(moreMenu.menu).toBeVisible();
  await moreMenu.wrapButton.click();
  await expect(moreMenu.menu).toBeVisible();
});

test('should code block lang input supports alias', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  const codeBlockController = getCodeBlock(page);
  const codeBlock = codeBlockController.codeBlock;
  await codeBlock.hover();
  await codeBlockController.clickLanguageButton();
  await expect(codeBlockController.langList).toBeVisible();
  await type(page, '文言');
  await pressEnter(page);
  await expect(codeBlockController.languageButton).toHaveText('Wenyan');
});

test('multi-line indent', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'aaa');
  await pressEnter(page);

  await type(page, 'bbb');
  await pressEnter(page);

  await type(page, 'ccc');

  await page.keyboard.down('Shift');
  await pressArrowUp(page, 2);
  await page.keyboard.up('Shift');

  await pressTab(page);

  await assertRichTexts(page, ['  aaa\n  bbb\n  ccc']);

  await pressShiftTab(page);

  await assertRichTexts(page, ['aaa\nbbb\nccc']);

  await pressShiftTab(page);

  await assertRichTexts(page, ['aaa\nbbb\nccc']);
});

test('should bracket complete works in code block', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/1800',
  });
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);
  await focusRichText(page);

  await type(page, 'const a = "');
  await assertRichTexts(page, ['const a = ""']);

  await type(page, 'str');
  await assertRichTexts(page, ['const a = "str"']);
  await type(page, '(');
  await assertRichTexts(page, ['const a = "str()"']);
  await type(page, ']');
  await assertRichTexts(page, ['const a = "str(])"']);
});

test('auto scroll horizontally when typing', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page);
  await type(page, '``` ');

  for (let i = 0; i < 100; i++) {
    await type(page, String(i));
  }

  const richTextScrollLeft1 = await page.evaluate(() => {
    const richText = document.querySelector('affine-code rich-text');
    if (!richText) {
      throw new Error('Failed to get rich text');
    }

    return richText.scrollLeft;
  });
  expect(richTextScrollLeft1).toBeGreaterThan(200);

  await pressArrowLeft(page, 5);
  await type(page, 'aa');

  const richTextScrollLeft2 = await page.evaluate(() => {
    const richText = document.querySelector('affine-code rich-text');
    if (!richText) {
      throw new Error('Failed to get rich text');
    }

    return richText.scrollLeft;
  });

  expect(richTextScrollLeft2).toEqual(richTextScrollLeft1);
});

test('code hotkey should not effect in global', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await pressEnter(page);
  await type(page, '``` ');

  await assertTitle(page, '');
  await assertBlockCount(page, 'paragraph', 1);
  await assertBlockCount(page, 'code', 1);

  await pressArrowUp(page);
  await pressBackspace(page);
  await type(page, 'aaa');

  await assertTitle(page, 'aaa');
  await assertBlockCount(page, 'paragraph', 0);
  await assertBlockCount(page, 'code', 1);
});

test('language selection list should not close when hovering out of code block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page, { language: 'javascript' });

  const codeBlockController = getCodeBlock(page);
  await codeBlockController.codeBlock.hover();

  await codeBlockController.clickLanguageButton();
  const langLocator = codeBlockController.langList;
  await expect(langLocator).toBeVisible();

  const bBox = await codeBlockController.codeBlock.boundingBox();
  if (!bBox) throw new Error('Expected bounding box');

  const { x, y, width, height } = bBox;

  // hovering inside the code block should keep the list open
  await page.mouse.move(x + width / 2, y + height / 2);
  await expect(langLocator).toBeVisible();

  // hovering out should not close the list
  await page.mouse.move(x - 10, y - 10);
  await waitNextFrame(page);
  await expect(langLocator).toBeVisible();
});

test('language selection list should not change when hovering over its elements', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyCodeBlockState(page);

  const codeBlockController = getCodeBlock(page);
  await codeBlockController.codeBlock.hover();
  await codeBlockController.clickLanguageButton();
  await waitNextFrame(page, 100);

  const langListLocator = codeBlockController.langList;
  const langItemsLocator = langListLocator.locator('icon-button');

  // checking first 4 language list items
  for (let i = 0; i < 3; i++) {
    const item = langItemsLocator.nth(i); // current item in language list
    const nextItem = langItemsLocator.nth(i + 1); // next item in language list

    await item.hover();

    const initialItemText = await item.textContent();
    const initialNextItemText = await nextItem.textContent();

    await nextItem.hover();

    const currentItemText = await item.textContent();
    const currentNextItemText = await nextItem.textContent();

    // text content should remain unchanged after next item receives focus
    expect(initialItemText).toBe(currentItemText);
    expect(initialNextItemText).toBe(currentNextItemText);
  }
});

test('format text in code block', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, '```ts ');
  await waitNextFrame(page, 100);
  await type(page, 'const aaa = 1000;');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  const line = page.locator('affine-code rich-text v-line > div');
  expect(await line.innerText()).toBe('const aaa = 1000;');

  const { boldBtn, linkBtn } = getFormatBar(page);

  await dragBetweenIndices(page, [0, 1], [0, 2]);
  await boldBtn.click();
  expect(await line.innerText()).toBe('const aaa = 1000;');
  await dragBetweenIndices(page, [0, 4], [0, 7]);
  await boldBtn.click();
  expect(await line.innerText()).toBe('const aaa = 1000;');
  await dragBetweenIndices(page, [0, 8], [0, 16]);
  await boldBtn.click();
  expect(await line.innerText()).toBe('const aaa = 1000;');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_format.json`
  );

  await dragBetweenIndices(page, [0, 4], [0, 10]);
  await linkBtn.click();
  await type(page, 'https://www.baidu.com');
  await pressEnter(page);

  const linkLocator = page.locator('[data-block-id="3"] affine-link a');
  expect(await linkLocator.count()).toBe(3);
  await expect(linkLocator.nth(0)).toHaveAttribute(
    'href',
    'https://www.baidu.com'
  );
  await expect(linkLocator.nth(1)).toHaveAttribute(
    'href',
    'https://www.baidu.com'
  );
  await expect(linkLocator.nth(2)).toHaveAttribute(
    'href',
    'https://www.baidu.com'
  );

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_link.json`
  );
});
