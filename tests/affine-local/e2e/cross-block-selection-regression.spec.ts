import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEditorLoad,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Locator, type Page, test } from '@playwright/test';

// Real regression (reported 2026-10-01, desktop): "I can no longer select
// multiple rows of text separated by enter, or multiple lines of a bullet or
// numbered list ... select seems bounded by the row/paragraph."
//
// Root cause (confirmed via direct source/history inspection, not inferred):
// commit c7d3e62e40 ("fix(04-03): add contenteditable=false boundary to
// notes and database title cells (MOBILE-14)") added
// `this.contentEditable = 'false'` to `NoteBlockComponent.connectedCallback`
// (blocksuite/affine/blocks/note/src/note-block.ts), unconditionally (not
// gated to mobile). Before that commit, `PageRootBlockComponent` sets the
// whole page `contentEditable="true"` with nothing marking a boundary
// underneath it, so every descendant paragraph/list-item's own rich-text div
// (independently `contenteditable="true"`) was really one single continuous
// editable region -- native drag-selection could freely span any two of
// them. After that commit, each note is `contenteditable="false"`, so its
// child blocks' rich-text divs become ISOLATED `contenteditable="true"`
// islands (true -> false -> true, true, true...) -- a nesting shape browsers
// are known to refuse to extend a native selection across. The fix was
// solving a real, different, mobile-only bug (a tap-to-edit hit-testing
// jump) and should have been scoped to `IS_MOBILE`; it was not.
test.describe('Cross-block text selection (regression guard)', () => {
  test.beforeEach(async ({ page }) => {
    await openHomePage(page);
    await clickNewPageButton(page);
    await waitForEditorLoad(page);
    // Focus starts in the (empty) title field after clickNewPageButton;
    // Enter moves the caret into the first paragraph of the body (same
    // finding documented in row-enter-focus-loss.spec.ts).
    await page.keyboard.press('Enter');
  });

  test('dragging a selection from one paragraph into the next selects text in both', async ({
    page,
  }) => {
    await type(page, 'first paragraph');
    await page.keyboard.press('Enter');
    await type(page, 'second paragraph');

    const firstBlock = page
      .locator('affine-paragraph')
      .filter({ hasText: 'first paragraph' });
    const secondBlock = page
      .locator('affine-paragraph')
      .filter({ hasText: 'second paragraph' });
    await expect(firstBlock).toHaveCount(1);
    await expect(secondBlock).toHaveCount(1);

    const selected = await dragAcrossBlocks(page, firstBlock, secondBlock);

    expect(selected).toContain('first');
    expect(selected).toContain('second');
  });

  test('dragging a selection from one list item into the next selects text in both', async ({
    page,
  }) => {
    await type(page, '1. first item');
    await page.keyboard.press('Enter');
    await type(page, 'second item');

    const firstItem = page
      .locator('affine-list')
      .filter({ hasText: 'first item' });
    const secondItem = page
      .locator('affine-list')
      .filter({ hasText: 'second item' });
    await expect(firstItem).toHaveCount(1);
    await expect(secondItem).toHaveCount(1);

    const selected = await dragAcrossBlocks(page, firstItem, secondItem);

    expect(selected).toContain('first');
    expect(selected).toContain('second');
  });
});

/**
 * Drags a real mouse selection starting inside `from`'s rich-text and ending
 * inside `to`'s rich-text, then returns `document.getSelection().toString()`.
 * Mirrors the drag technique already established in
 * row-index0-selection.spec.ts's `dragSelect`.
 */
async function dragAcrossBlocks(page: Page, from: Locator, to: Locator) {
  const fromBox = await from.locator('rich-text').boundingBox();
  const toBox = await to.locator('rich-text').boundingBox();
  if (!fromBox || !toBox) {
    throw new Error('could not measure rich-text bounding boxes');
  }

  const startX = fromBox.x + 1;
  const startY = fromBox.y + fromBox.height / 2;
  const endX = toBox.x + toBox.width - 5;
  const endY = toBox.y + toBox.height / 2;

  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 12 });
  await page.mouse.up();

  return page.evaluate(() => document.getSelection()?.toString() ?? '');
}
