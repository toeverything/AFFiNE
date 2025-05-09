import {
  cutByKeyboard,
  dragOverTitle,
  enterPlaygroundRoom,
  focusRichText,
  focusTitle,
  initEmptyParagraphState,
  pasteByKeyboard,
  pressEnter,
  type,
} from '../utils/actions/index.js';
import { assertRichTexts, assertTitle } from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test('should cut in title works', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusTitle(page);
  await type(page, 'hello');
  await assertTitle(page, 'hello');

  await dragOverTitle(page);
  await cutByKeyboard(page);
  await assertTitle(page, '');

  await focusRichText(page);
  await pasteByKeyboard(page);
  await assertRichTexts(page, ['hello']);
});

test('enter in title should move cursor in new paragraph block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusTitle(page);
  await type(page, 'hello');
  await assertTitle(page, 'hello');
  await pressEnter(page);
  await type(page, 'world');
  await assertRichTexts(page, ['world', '']);
});
