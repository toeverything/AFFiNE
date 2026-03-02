import { expect, type Locator } from '@playwright/test';

import {
  dragBetweenIndices,
  enterPlaygroundRoom,
  enterPlaygroundWithList,
  focusRichText,
  getPageSnapshot,
  initEmptyEdgelessState,
  initEmptyParagraphState,
  initThreeLists,
  pressArrowLeft,
  pressArrowUp,
  pressBackspace,
  pressBackspaceWithShortKey,
  pressEnter,
  pressShiftEnter,
  pressShiftTab,
  pressSpace,
  pressTab,
  redoByClick,
  switchEditorMode,
  switchReadonly,
  type,
  undoByClick,
  undoByKeyboard,
  updateBlockType,
  waitNextFrame,
} from './utils/actions/index.js';
import {
  assertBlockChildrenFlavours,
  assertBlockChildrenIds,
  assertBlockCount,
  assertBlockType,
  assertListPrefix,
  assertRichTextInlineRange,
  assertRichTexts,
  assertTextContent,
} from './utils/asserts.js';
import { test } from './utils/playwright.js';
import { getFormatBar } from './utils/query.js';

async function isToggleIconVisible(toggleIcon: Locator) {
  const connected = await toggleIcon.isVisible();
  if (!connected) return false;
  const element = await toggleIcon.elementHandle();
  if (!element) return false;
  const opacity = await element.evaluate(node => {
    // https://stackoverflow.com/questions/11365296/how-do-i-get-the-opacity-of-an-element-using-javascript
    return window.getComputedStyle(node).getPropertyValue('opacity');
  });
  if (!opacity || typeof opacity !== 'string') {
    throw new Error('opacity is not a string');
  }
  const isVisible = opacity !== '0';
  return isVisible;
}

test('add new bulleted list', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page, 0);
  await updateBlockType(page, 'affine:list', 'bulleted');
  await focusRichText(page, 0);
  await type(page, 'aa');
  await pressEnter(page);
  await type(page, 'aa');
  await pressEnter(page);

  await assertRichTexts(page, ['aa', 'aa', '']);
  await assertBlockCount(page, 'list', 3);
});

test('add new todo list', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page, 0);
  await updateBlockType(page, 'affine:list', 'todo');
  await focusRichText(page, 0);

  await type(page, 'aa');
  await assertRichTexts(page, ['aa']);

  const checkBox = page.locator('.affine-list-block__prefix');
  await expect(page.locator('.affine-list--checked')).toHaveCount(0);
  await checkBox.click();
  await expect(page.locator('.affine-list--checked')).toHaveCount(1);
  await checkBox.click();
  await expect(page.locator('.affine-list--checked')).toHaveCount(0);
});

test('add new toggle list', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page, 0);
  await updateBlockType(page, 'affine:list', 'toggle');
  await focusRichText(page, 0);
  await type(page, 'top');
  await pressTab(page);
  await pressEnter(page);
  await type(page, 'kid 1');
  await pressEnter(page);

  await assertRichTexts(page, ['top', 'kid 1', '']);
  await assertBlockCount(page, 'list', 3);
});

test('convert nested paragraph to list', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'aaa\nbbb');
  await pressTab(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  await dragBetweenIndices(page, [0, 1], [1, 2]);
  const { openParagraphMenu, bulletedBtn } = getFormatBar(page);
  await openParagraphMenu();
  await bulletedBtn.click();

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_final.json`
  );
});

test('convert to numbered list block', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page, 0); // created 0, 1, 2
  await updateBlockType(page, 'affine:list', 'bulleted'); // replaced 2 to 3
  await waitNextFrame(page);
  await updateBlockType(page, 'affine:list', 'numbered');
  await focusRichText(page, 0);

  const listSelector = '.affine-list-rich-text-wrapper';
  const bulletIconSelector = `${listSelector} > div`;
  await assertTextContent(page, bulletIconSelector, /1\./);

  await undoByClick(page);
  // const numberIconSelector = `${listSelector} > svg`;
  // await expect(page.locator(numberIconSelector)).toHaveCount(1);

  await redoByClick(page);
  await focusRichText(page, 0);
  await type(page, 'aa');
  await pressEnter(page); // created 4
  await assertBlockType(page, '4', 'numbered');

  await type(page, 'aa');
  await pressEnter(page); // created 5
  await assertBlockType(page, '5', 'numbered');

  await page.keyboard.press('Tab');
  await assertBlockType(page, '5', 'numbered');
});

test('indent list block', async ({ page }) => {
  await enterPlaygroundWithList(page); // 0(1(2,3,4))

  await focusRichText(page, 1);
  await type(page, 'hello');
  await assertRichTexts(page, ['', 'hello', '']);

  await page.keyboard.press('Tab'); // 0(1(2(3)4))
  await assertRichTexts(page, ['', 'hello', '']);
  await assertBlockChildrenIds(page, '1', ['2', '4']);
  await assertBlockChildrenIds(page, '2', ['3']);

  await undoByKeyboard(page); // 0(1(2,3,4))
  await assertBlockChildrenIds(page, '1', ['2', '3', '4']);
});

test('unindent list block', async ({ page }) => {
  await enterPlaygroundWithList(page); // 0(1(2,3,4))

  await focusRichText(page, 1);
  await page.keyboard.press('Tab', { delay: 50 }); // 0(1(2(3)4))

  await assertBlockChildrenIds(page, '1', ['2', '4']);
  await assertBlockChildrenIds(page, '2', ['3']);

  await pressShiftTab(page); // 0(1(2,3,4))
  await assertBlockChildrenIds(page, '1', ['2', '3', '4']);

  await pressShiftTab(page);
  await assertBlockChildrenIds(page, '1', ['2', '3', '4']);
});

test('remove all indent for a list block', async ({ page }) => {
  await enterPlaygroundWithList(page); // 0(1(2,3,4))

  await focusRichText(page, 1);
  await page.keyboard.press('Tab', { delay: 50 }); // 0(1(2(3)4))
  await focusRichText(page, 2);
  await page.keyboard.press('Tab', { delay: 50 });
  await page.keyboard.press('Tab', { delay: 50 }); // 0(1(2(3(4))))
  await assertBlockChildrenIds(page, '3', ['4']);
  await pressBackspaceWithShortKey(page); // 0(1(2(3)4))
  await assertBlockChildrenIds(page, '1', ['2', '4']);
  await assertBlockChildrenIds(page, '2', ['3']);
});

test('insert new list block by enter', async ({ page }) => {
  await enterPlaygroundWithList(page);
  await assertRichTexts(page, ['', '', '']);

  await focusRichText(page, 1);
  await type(page, 'hello');
  await assertRichTexts(page, ['', 'hello', '']);

  await pressEnter(page);
  await type(page, 'world');
  await assertRichTexts(page, ['', 'hello', 'world', '']);
  await assertBlockChildrenFlavours(page, '1', [
    'affine:list',
    'affine:list',
    'affine:list',
    'affine:list',
  ]);
});

test('delete at start of list block', async ({ page }) => {
  await enterPlaygroundWithList(page);
  await focusRichText(page, 1);
  await page.keyboard.press('Backspace');
  await assertBlockChildrenFlavours(page, '1', [
    'affine:list',
    'affine:paragraph',
    'affine:list',
  ]);
  await waitNextFrame(page, 200);
  await assertRichTextInlineRange(page, 1, 0, 0);

  await undoByClick(page);
  await assertBlockChildrenFlavours(page, '1', [
    'affine:list',
    'affine:list',
    'affine:list',
  ]);
  await waitNextFrame(page);
  //FIXME: it just failed in playwright
  // await assertSelection(page, 1, 0, 0);
});

test('nested list blocks', async ({ page }, testInfo) => {
  await enterPlaygroundWithList(page);

  await focusRichText(page, 0);
  await type(page, '123');

  await focusRichText(page, 1);
  await pressTab(page);
  await type(page, '456');

  await focusRichText(page, 2);
  await pressTab(page);
  await pressTab(page);
  await type(page, '789');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  await focusRichText(page, 1);
  await pressShiftTab(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_finial.json`
  );
});

test('update numbered list block prefix', async ({ page }) => {
  await enterPlaygroundWithList(page, ['', '', ''], 'numbered'); // 0(1(2,3,4))

  await focusRichText(page, 1);
  await type(page, 'lunatic');
  await assertRichTexts(page, ['', 'lunatic', '']);
  await assertListPrefix(page, ['1', '2', '3']);

  await page.keyboard.press('Tab');
  await assertListPrefix(page, ['1', 'a', '2']);

  await page.keyboard.press('Shift+Tab');
  await assertListPrefix(page, ['1', '2', '3']);

  await waitNextFrame(page, 200);
  await page.keyboard.press('Enter');
  await assertListPrefix(page, ['1', '2', '3', '4']);

  await waitNextFrame(page, 200);
  await type(page, 'concorde');
  await assertRichTexts(page, ['', 'lunatic', 'concorde', '']);

  await page.keyboard.press('Tab');
  await assertListPrefix(page, ['1', '2', 'a', '3']);
});

test('basic indent and unindent', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'text1');
  await pressEnter(page);
  await type(page, 'text2');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  await page.keyboard.press('Tab');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_after_tab.json`
  );

  await page.waitForTimeout(100);
  await pressShiftTab(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_after_shift_tab.json`
  );
});

test('should indent todo block preserve todo status', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'text1');
  await pressEnter(page);

  await type(page, '[x]');
  await pressSpace(page);

  await type(page, 'todo item');
  await pressTab(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );
  await pressShiftTab(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_final.json`
  );
});

test('enter list block with empty text', async ({ page }, testInfo) => {
  await enterPlaygroundWithList(page); // 0(1(2,3,4))

  /**
   * -
   * -
   * -
   */
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_init.json`
  );

  await focusRichText(page, 1);
  await pressTab(page);
  await focusRichText(page, 2);
  await pressTab(page);

  /**
   * -
   *   -
   *   -|
   */
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );

  await pressEnter(page);

  /**
   * -
   *   -
   * -|
   */
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_2.json`
  );

  await pressEnter(page);

  /**
   * -
   *   -
   * |
   */
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_3.json`
  );

  await undoByClick(page);
  await undoByClick(page);

  /**
   * -
   *   -
   *   -|
   */
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );

  /**
   * -
   *   -|
   *   -
   */
  await focusRichText(page, 1);
  await waitNextFrame(page);
  await pressEnter(page);
  await waitNextFrame(page);

  /**
   * -
   * -|
   *   -
   */
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_4.json`
  );

  await undoByClick(page);

  /**
   * -
   *   -
   *   -|
   */
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );

  /**
   * -|
   *   -
   *   -
   */
  await focusRichText(page, 0);
  await waitNextFrame(page);
  await pressEnter(page);
  await waitNextFrame(page);

  /**
   * |
   *   -
   *   -
   */
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_5.json`
  );

  await undoByClick(page);

  /**
   * -
   *   -
   *   -|
   */
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );
});

test('enter list block with non-empty text', async ({ page }) => {
  await enterPlaygroundWithList(page); // 0(1(2,3,4))

  await focusRichText(page, 0);
  await type(page, 'aa');
  await focusRichText(page, 1);
  await type(page, 'bb');
  await pressTab(page);
  await focusRichText(page, 2);
  await type(page, 'cc');
  await pressTab(page);
  await assertBlockChildrenIds(page, '2', ['3', '4']); // 0(1(2,(3,4)))

  await focusRichText(page, 1);
  await pressEnter(page);
  await assertBlockChildrenIds(page, '2', ['3', '5', '4']);
  await undoByClick(page);
  await assertBlockChildrenIds(page, '2', ['3', '4']); // 0(1(2,(3,4)))

  await focusRichText(page, 0);
  await pressEnter(page);
  await assertBlockChildrenIds(page, '2', ['6', '3', '4']); // 0(1(2,(6,3,4)))
  await waitNextFrame(page);
  await undoByClick(page);
  await assertBlockChildrenIds(page, '2', ['3', '4']); // 0(1(2,(3,4)))
});

test.describe('indent correctly when deleting list item', () => {
  test('delete the child item in the middle position', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page, 0);

    await type(page, '- a');
    await pressEnter(page);
    await pressTab(page);
    await type(page, 'b');
    await pressEnter(page);
    await type(page, 'c');
    await pressEnter(page);
    await type(page, 'd');
    await pressArrowUp(page);
    await pressArrowLeft(page);
    await pressBackspace(page);
    await pressBackspace(page);

    await assertBlockChildrenIds(page, '3', ['4', '6']);
    await assertRichTexts(page, ['a', 'bc', 'd']);
    await assertRichTextInlineRange(page, 1, 1);
  });

  test('merge two lists', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page, 0);

    await type(page, '- a');
    await pressEnter(page);
    await pressTab(page);
    await type(page, 'b');
    await pressEnter(page);
    await pressTab(page);
    await type(page, 'c');
    await pressEnter(page);
    await pressBackspace(page, 3);
    await assertRichTexts(page, ['a', 'b', 'c', '']);

    await waitNextFrame(page);
    await pressEnter(page);
    await type(page, '- d');
    await pressEnter(page);
    await pressTab(page);
    await type(page, 'e');
    await pressEnter(page);
    await pressTab(page);
    await type(page, 'f');
    await pressArrowUp(page, 3);
    await pressBackspace(page, 2);

    await waitNextFrame(page, 200);
    await assertRichTexts(page, ['a', 'b', '', 'd', 'e', 'f']);
    await assertBlockChildrenIds(page, '1', ['3', '9']);
    await assertBlockChildrenIds(page, '3', ['4']);
    await assertBlockChildrenIds(page, '4', ['5']);
    await assertBlockChildrenIds(page, '10', ['11']);
  });
});

test('delete list item with nested children items', async ({ page }) => {
  await enterPlaygroundWithList(page);

  await focusRichText(page, 0);
  await type(page, '1');

  await focusRichText(page, 1);
  await pressTab(page);
  await type(page, '2');

  await focusRichText(page, 2);
  await pressTab(page);
  await pressTab(page);
  await type(page, '3');

  await pressEnter(page);
  await type(page, '4');

  await focusRichText(page, 1);
  await pressArrowLeft(page);
  // 1
  //   |2
  //     3
  //     4

  await pressBackspace(page);
  await waitNextFrame(page);
  // 1
  //   |2 (transformed to paragraph)
  //     3
  //     4

  await pressBackspace(page);
  await waitNextFrame(page);
  // 1
  // |2
  //   3
  //   4

  await pressBackspace(page);
  await waitNextFrame(page);
  // 1|2
  // 3
  // 4

  await assertRichTextInlineRange(page, 0, 1);
  await assertRichTexts(page, ['12', '3', '4']);
  await assertBlockChildrenIds(page, '1', ['2', '4', '5']);
});

test('add number prefix to a todo item should not forcefully change it into numbered list, vice versa', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page, 0);
  await type(page, '1. numberList');
  await assertListPrefix(page, ['1']);
  await focusRichText(page, 0, { clickPosition: { x: 0, y: 0 } });
  await type(page, '[] ');
  await assertListPrefix(page, ['1']);
  await pressBackspace(page, 14);
  await type(page, '[] todoList');
  await assertListPrefix(page, ['']);
  await focusRichText(page, 0, { clickPosition: { x: 0, y: 0 } });
  await type(page, '1. ');
  await assertListPrefix(page, ['']);
});

test('should not convert to a list when pressing space at the second line', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaa');
  await pressShiftEnter(page);
  await type(page, '-');
  await pressSpace(page);
  await type(page, 'bbb');
  await assertRichTexts(page, ['aaa\n- bbb']);
});

test.describe('toggle list', () => {
  test('click toggle icon should collapsed list', async ({
    page,
  }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await initThreeLists(page);
    const toggleIcon = page.locator('.toggle-icon');
    const prefixes = page.locator('.affine-list-block__prefix');
    const listChildren = page
      .locator('[data-block-id="4"] .affine-block-children-container')
      .nth(0);
    const parentPrefix = prefixes.nth(1);

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_init.json`
    );

    await parentPrefix.hover();
    await waitNextFrame(page);
    expect(await isToggleIconVisible(toggleIcon)).toBe(true);

    await expect(listChildren).toBeVisible();
    await toggleIcon.click();
    await expect(listChildren).not.toBeVisible();
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_toggle.json`
    );

    // Collapsed toggle icon should be show always
    await page.mouse.move(0, 0);
    expect(await isToggleIconVisible(toggleIcon)).toBe(true);

    await expect(listChildren).not.toBeVisible();
    await toggleIcon.click();
    await expect(listChildren).toBeVisible();
    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_init.json`
    );

    await page.mouse.move(0, 0);
    await waitNextFrame(page, 200);
    expect(await isToggleIconVisible(toggleIcon)).toBe(false);
  });

  test('indent item should expand toggle', async ({ page }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await initThreeLists(page);
    await focusRichText(page, 2);
    await pressEnter(page);
    await pressEnter(page);
    await type(page, '012');

    const toggleIcon = page.locator('.toggle-icon');
    const listChildren = page
      .locator('[data-block-id="4"] .affine-block-children-container')
      .nth(0);

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_init.json`
    );

    await expect(listChildren).toBeVisible();
    await toggleIcon.click();
    await expect(listChildren).not.toBeVisible();

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_toggle.json`
    );

    await focusRichText(page, 3);
    await pressTab(page);
    await waitNextFrame(page, 200);
    await expect(listChildren).not.toBeVisible();

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_finial.json`
    );
  });

  test('toggle icon should be show when hover', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await initThreeLists(page);
    const toggleIcon = page.locator('.toggle-icon');

    const prefixes = page.locator('.affine-list-block__prefix');
    const parentPrefix = prefixes.nth(1);

    expect(await isToggleIconVisible(toggleIcon)).toBe(false);
    await parentPrefix.hover();
    await waitNextFrame(page, 200);
    expect(await isToggleIconVisible(toggleIcon)).toBe(true);

    await page.mouse.move(0, 0);
    await waitNextFrame(page, 300);
    expect(await isToggleIconVisible(toggleIcon)).toBe(false);
  });
});

test.describe('readonly', () => {
  test('can expand toggle in readonly mode', async ({ page }, testInfo) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await initThreeLists(page);
    const toggleIcon = page.locator('.toggle-icon');
    const prefixes = page.locator('.affine-list-block__prefix');
    const listChildren = page
      .locator('[data-block-id="4"] .affine-block-children-container')
      .nth(0);
    const parentPrefix = prefixes.nth(1);

    await parentPrefix.hover();
    await waitNextFrame(page, 200);
    expect(await isToggleIconVisible(toggleIcon)).toBe(true);

    await expect(listChildren).toBeVisible();
    await toggleIcon.click();
    await expect(listChildren).not.toBeVisible();

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_before_readonly.json`
    );

    await waitNextFrame(page, 200);
    await switchReadonly(page);

    await waitNextFrame(page, 200);
    expect(await isToggleIconVisible(toggleIcon)).toBe(true);

    await expect(listChildren).not.toBeVisible();
    await toggleIcon.click();
    await expect(listChildren).toBeVisible();

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_before_readonly.json`
    );

    await toggleIcon.click();
    await expect(listChildren).not.toBeVisible();

    expect(await getPageSnapshot(page, true)).toMatchSnapshot(
      `${testInfo.title}_before_readonly.json`
    );
  });

  test('can not modify todo list in readonly mode', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    const checkBox = page.locator('.affine-list-block__prefix');

    {
      await type(page, '[] todo');
      await switchReadonly(page);
      await expect(page.locator('.affine-list--checked')).toHaveCount(0);
      await checkBox.click();
      await expect(page.locator('.affine-list--checked')).toHaveCount(0);
    }

    {
      await switchReadonly(page, false);
      await checkBox.click();
      await switchReadonly(page);
      await expect(page.locator('.affine-list--checked')).toHaveCount(1);
      await checkBox.click();
      await expect(page.locator('.affine-list--checked')).toHaveCount(1);
    }
  });

  test('should render collapsed list correctly', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    // await switchEditorMode(page);
    await initThreeLists(page);

    const toggleIcon = page.locator('.toggle-icon');
    const listChildren = page
      .locator('[data-block-id="5"] .affine-block-children-container')
      .nth(0);

    await expect(listChildren).toBeVisible();
    await toggleIcon.click();
    await expect(listChildren).not.toBeVisible();

    await switchReadonly(page);
    // trick for render a readonly doc from scratch
    await switchEditorMode(page);
    await switchEditorMode(page);

    await expect(listChildren).not.toBeVisible();
  });
});
