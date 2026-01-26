import { expect } from '@playwright/test';

import {
  dragBetweenIndices,
  enterPlaygroundRoom,
  focusRichText,
  getIndexCoordinate,
  initEmptyParagraphState,
  initThreeParagraphs,
  pressForwardDelete,
  type,
  waitNextFrame,
} from '../../utils/actions/index.js';
import { assertRichTexts, assertTextContain } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test('should not crash when deleting with selection dragged outside note (firefox)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'firefox', 'Firefox-only regression');

  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await initThreeParagraphs(page);
  await assertRichTexts(page, ['123', '456', '789']);

  const outside = await page.evaluate(() => {
    const note = document.querySelector('affine-note');
    if (!note) {
      throw new Error('affine-note not found');
    }
    const rect = note.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.bottom + 50 };
  });

  // Drag starting from the end of the last paragraph to outside the note.
  // Previously Firefox could perform native `contenteditable` deletion here and
  // crash Lit updates with `ChildPart has no parentNode`.
  await dragBetweenIndices(
    page,
    [2, 3],
    [2, 3],
    { x: 0, y: 0 },
    { x: 0, y: 0 },
    {
      steps: 20,
      async beforeMouseUp() {
        await page.mouse.move(outside.x, outside.y);
      },
    }
  );

  await pressForwardDelete(page);
  await waitNextFrame(page);
  await type(page, 'a');
  await waitNextFrame(page);

  await assertTextContain(page, 'a', 2);
});

test('should not crash when replacing the first word by double click (firefox)', async ({
  page,
  browserName,
}) => {
  test.skip(browserName !== 'firefox', 'Firefox-only regression');

  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  await focusRichText(page, 0);
  await type(page, 'hello world');
  await waitNextFrame(page);

  const coord = await getIndexCoordinate(page, [0, 1]);
  await page.mouse.click(coord.x, coord.y, { clickCount: 2 });
  await type(page, 'x');
  await waitNextFrame(page);

  const text = await page.evaluate(() => {
    const editorHost = document.querySelector('editor-host');
    const richText = editorHost?.querySelector('rich-text') as any;
    return richText?.inlineEditor?.yText?.toString?.() ?? '';
  });
  expect(text.startsWith('x')).toBe(true);
  expect(text.includes('world')).toBe(true);
});
