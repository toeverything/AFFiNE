import { expect, test } from '@playwright/test';

import { switchReadonly } from './utils/actions/click.js';
import {
  copyByKeyboard,
  pressBackspace,
  pressEnter,
  selectAllByKeyboard,
  type,
} from './utils/actions/keyboard.js';
import {
  enterPlaygroundRoom,
  focusRichText,
  getClipboardText,
  getInlineSelectionIndex,
  initEmptyParagraphState,
} from './utils/actions/misc.js';
import { assertRichTextInlineRange, assertRichTexts } from './utils/asserts.js';

test('renders hashtag text as badge, hides # visually, and preserves plain text', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'hello #abc world');

  await assertRichTexts(page, ['hello #abc world']);
  const badge = page.locator('.affine-page-hashtag-badge');
  await expect(badge).toHaveCount(1);
  await expect(badge.locator('.affine-page-hashtag-prefix')).toHaveText('#');
  await expect(badge.locator('.affine-page-hashtag-content')).toHaveText('abc');
  await expect(badge.locator('.affine-page-hashtag-prefix')).toHaveCSS(
    'width',
    '0px'
  );
  await expect(badge).toHaveCSS('background-color', 'rgb(255, 236, 246)');

  await selectAllByKeyboard(page);
  await copyByKeyboard(page);
  await expect.poll(() => getClipboardText(page)).toContain('hello #abc world');
});

test('ends badge on the next space', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#todo next');

  await assertRichTexts(page, ['#todo next']);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveCount(1);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveText('#todo');
});

test('updates badge text through backspace like plain text', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#todo');
  await pressBackspace(page);

  await assertRichTexts(page, ['#tod']);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveCount(1);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveText('#tod');
});

test('pressing enter at hashtag line end creates the next line below', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#abc');
  await pressEnter(page);

  await assertRichTexts(page, ['#abc', '']);
  await assertRichTextInlineRange(page, 1, 0, 0);
});

test('clicking the visible end of a hashtag keeps the caret at line end', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#abc');

  const badgeContent = page.locator('.affine-page-hashtag-content');
  const box = await badgeContent.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width - 1, box!.y + box!.height / 2);

  await expect
    .poll(async () => getInlineSelectionIndex(page))
    .toBe('#abc'.length);

  await pressEnter(page);

  await assertRichTexts(page, ['#abc', '']);
  await assertRichTextInlineRange(page, 1, 0, 0);
});

test('clicking the padded end of a hashtag keeps the caret at line end', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#abc');

  const badge = page.locator('.affine-page-hashtag-badge');
  const box = await badge.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.click(box!.x + box!.width - 1, box!.y + box!.height / 2);

  await expect
    .poll(async () => getInlineSelectionIndex(page))
    .toBe('#abc'.length);

  await pressEnter(page);

  await assertRichTexts(page, ['#abc', '']);
  await assertRichTextInlineRange(page, 1, 0, 0);
});

test('hashtag v-element end boundary maps to the line end', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#abc');

  const result = await page.evaluate(() => {
    const richText = document
      .querySelector('editor-host')
      ?.querySelector('rich-text') as any;
    const vElement = richText.querySelector(
      '[data-v-element="true"]'
    ) as HTMLElement | null;
    if (!vElement) {
      return { index: -1, found: false, childCount: -1 };
    }
    const endOffset = vElement.childNodes.length;
    const range = document.createRange();
    range.setStart(vElement, endOffset);
    range.setEnd(vElement, endOffset);
    return {
      index: richText.inlineEditor.toInlineRange(range)?.index ?? -1,
      found: true,
      childCount: endOffset,
    };
  });

  expect(result).toEqual({
    index: '#abc'.length,
    found: true,
    childCount: expect.any(Number),
  });
});

test('pressing enter after trailing hashtag keeps the whole line above', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, 'hello #abc');
  await pressEnter(page);

  await assertRichTexts(page, ['hello #abc', '']);
  await assertRichTextInlineRange(page, 1, 0, 0);
});

for (const text of [
  '#abc world',
  'hello #abc world',
  'hello #abc world #def',
]) {
  test(`pressing enter at end of "${text}" keeps the full line above`, async ({
    page,
  }) => {
    await enterPlaygroundRoom(page);
    await initEmptyParagraphState(page);
    await focusRichText(page);

    await type(page, text);
    await pressEnter(page);

    await assertRichTexts(page, [text, '']);
    await assertRichTextInlineRange(page, 1, 0, 0);
  });
}

test('keeps hashtag badge rendering in readonly page mode', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);

  await type(page, '#todo');
  await switchReadonly(page);

  await assertRichTexts(page, ['#todo']);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveCount(1);
  await expect(page.locator('.affine-page-hashtag-badge')).toHaveText('#todo');
});
