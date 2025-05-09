import { expect } from '@playwright/test';

import {
  activeEmbed,
  enterPlaygroundRoom,
  initImageState,
  pressArrowDown,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  type,
} from '../utils/actions/index.js';
import {
  assertBlockCount,
  assertBlockSelections,
  assertRichImage,
  assertRichTextInlineRange,
  assertRichTexts,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test.beforeEach(async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initImageState(page, true);
  await assertRichImage(page, 1);
});

test('press enter will create new block when click and select image', async ({
  page,
}) => {
  await activeEmbed(page);
  await pressEnter(page);
  await type(page, 'aa');
  await assertRichTexts(page, ['', 'aa']);
});

test('press backspace after image block can select image block', async ({
  page,
}) => {
  await activeEmbed(page);
  await pressEnter(page);
  await assertRichTextInlineRange(page, 1, 0);
  await assertBlockCount(page, 'paragraph', 2);
  await pressBackspace(page);
  await assertBlockSelections(page, ['3']);
  await assertBlockCount(page, 'paragraph', 1);
});

test('press enter when image is selected should move next paragraph and should placeholder', async ({
  page,
}) => {
  await activeEmbed(page);
  await pressEnter(page);

  const placeholder = page.locator('.affine-paragraph-placeholder.visible');
  await expect(placeholder).toBeVisible();
});

test('press arrow up when image is selected should move to previous paragraph', async ({
  page,
}) => {
  await activeEmbed(page);
  await pressArrowUp(page);
  await assertRichTextInlineRange(page, 0, 0);
  await type(page, 'aa');
  await assertRichTexts(page, ['aa']);
});

test('press arrow down when image is selected should move to previous paragraph', async ({
  page,
}) => {
  await activeEmbed(page);
  await pressEnter(page);
  await type(page, 'aa');
  await activeEmbed(page);
  await pressArrowDown(page);
  await type(page, 'bb');
  await assertRichTexts(page, ['', 'bbaa']);
});
