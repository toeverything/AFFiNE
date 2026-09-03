import {
  pressArrowDown,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  pressEscape,
  pressTab,
  undoByKeyboard,
} from '@affine-test/kit/utils/keyboard';
import { locateToolbar } from '@affine-test/kit/utils/editor';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { expect, test } from '@playwright/test';

// ─── helpers ───────────────────────────────────────────────────────────────

async function redoByKeyboard(page: Parameters<typeof undoByKeyboard>[0]) {
  const isMac = process.platform === 'darwin';
  await page.keyboard.press(isMac ? 'Meta+Shift+Z' : 'Control+Shift+Z');
}

/** Select all text in the current focused block and open the Turn-into menu */
async function openTurnIntoMenu(page: Parameters<typeof undoByKeyboard>[0]) {
  await page.keyboard.press('Control+A');
  const toolbar = locateToolbar(page);
  await toolbar.getByLabel('Conversions').click();
  return toolbar;
}

/** Convert the currently-selected content to Callout via the toolbar */
async function convertToCallout(page: Parameters<typeof undoByKeyboard>[0]) {
  const toolbar = await openTurnIntoMenu(page);
  await toolbar.getByLabel('Callout').click();
}

test.beforeEach(async ({ page }) => {
  await openHomePage(page);
  await clickNewPageButton(page);
  await waitForEmptyEditor(page);
  await page.locator('affine-paragraph v-line div').click();
});

test('add callout block using slash menu and change emoji', async ({
  page,
}) => {
  await type(page, '/callout\naaaa\nbbbb');
  const callout = page.locator('affine-callout');
  const emoji = page.locator('affine-callout').getByTestId('callout-emoji');
  await expect(callout).toBeVisible();
  await expect(emoji).toContainText('💡');

  const paragraph = page.locator('affine-callout affine-paragraph');
  await expect(paragraph).toHaveCount(2);

  const vLine = page.locator('affine-callout v-line');
  await expect(vLine).toHaveCount(2);
  expect(await vLine.nth(0).innerText()).toBe('aaaa');
  expect(await vLine.nth(1).innerText()).toBe('bbbb');
});

test('press backspace after callout block', async ({ page }) => {
  await pressEnter(page);
  await pressArrowUp(page);
  await type(page, '/callout\n');
  await pressArrowDown(page);

  const paragraph = page.locator('affine-paragraph');
  const callout = page.locator('affine-callout');
  expect(await paragraph.count()).toBe(3);
  expect(await callout.count()).toBe(1);

  await pressBackspace(page);
  expect(await paragraph.count()).toBe(3);
  expect(await callout.count()).toBe(1);

  await pressBackspace(page);
  await expect(paragraph).toHaveCount(2);
  await expect(callout).toHaveCount(0);
});

test('press backspace in callout block', async ({ page }) => {
  const paragraph = page.locator('affine-paragraph');
  const callout = page.locator('affine-callout');

  await type(page, '/callout\n');

  expect(await paragraph.count()).toBe(2);
  expect(await callout.count()).toBe(1);

  await pressBackspace(page);
  await expect(paragraph).toHaveCount(1);
  await expect(callout).toHaveCount(1);

  await pressBackspace(page);
  await expect(paragraph).toHaveCount(1);
  await expect(callout).toHaveCount(0);
});

// ─── Turn into → Callout regression tests ──────────────────────────────────

test('turn into callout: plain paragraph preserves text and creates callout', async ({
  page,
}) => {
  await type(page, 'hello world');
  await convertToCallout(page);

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  const innerParagraph = page.locator('affine-callout affine-paragraph');
  await expect(innerParagraph).toHaveCount(1);
  await expect(innerParagraph.locator('v-line')).toHaveText('hello world');
});

test('turn into callout: nested list items remain reachable after conversion', async ({
  page,
}) => {
  // Build:  - parent item
  //           - child item  (indented via Tab)
  await type(page, '- parent item');
  await pressEnter(page);
  await pressTab(page);
  await type(page, 'child item');

  // Navigate back to parent and convert it
  await pressArrowUp(page);
  await convertToCallout(page);

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  // Both "parent item" text and "child item" must be visible inside the callout
  await expect(callout).toContainText('parent item');
  await expect(callout).toContainText('child item');
});

test('turn into callout: content inside existing callout is NOT converted (no data loss)', async ({
  page,
}) => {
  // Create a callout with some text
  await type(page, '/callout\ninner text');

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  // Select the inner paragraph and try to convert to callout again
  const innerParagraph = page.locator('affine-callout affine-paragraph');
  await innerParagraph.click();
  await page.keyboard.press('Control+A');

  const toolbar = locateToolbar(page);
  await toolbar.getByLabel('Conversions').click();

  // The Callout option must NOT appear in the menu (hidden for nested context)
  await expect(toolbar.getByLabel('Callout')).toHaveCount(0);

  // The inner paragraph still exists and its text is intact
  await pressEscape(page);
  await expect(innerParagraph).toContainText('inner text');
  await expect(callout).toHaveCount(1);
});

test('turn into callout: delete after conversion removes the whole callout', async ({
  page,
}) => {
  await type(page, 'delete me');

  // Use keyboard shortcut path to trigger conversion so we can check
  // BlockSelection behavior afterwards
  await convertToCallout(page);

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  // Press Escape to exit text editing → BlockSelection on the callout
  await pressEscape(page);
  await page.keyboard.press('Backspace');

  // The entire callout (not just the inner paragraph) should be gone
  await expect(callout).toHaveCount(0);
});

test('turn into callout: undo restores original paragraph with correct text', async ({
  page,
}) => {
  await type(page, 'undo me');
  await convertToCallout(page);

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  await undoByKeyboard(page);

  await expect(callout).toHaveCount(0);
  const paragraph = page.locator('affine-note > affine-paragraph');
  await expect(paragraph).toContainText('undo me');
});

test('turn into callout: redo restores the callout after undo', async ({
  page,
}) => {
  await type(page, 'redo me');
  await convertToCallout(page);
  await undoByKeyboard(page);

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(0);

  await redoByKeyboard(page);
  await expect(callout).toHaveCount(1);
  await expect(callout).toContainText('redo me');
});

test('turn into callout: rich-text formatting is preserved after conversion', async ({
  page,
}) => {
  // Type text and bold part of it
  await type(page, 'plain ');
  await page.keyboard.press('Control+B');
  await type(page, 'bold');
  await page.keyboard.press('Control+B');

  await convertToCallout(page);

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  // The bold span must still be inside the callout
  const boldSpan = callout.locator('v-element[data-v-type="text"] span').filter({
    hasText: 'bold',
  });
  await expect(boldSpan).toHaveCount(1);
});
