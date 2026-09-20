import { locateToolbar } from '@affine-test/kit/utils/editor';
import {
  pressArrowDown,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  pressEscape,
  pressTab,
  selectAllByKeyboard,
  undoByKeyboard,
  withCtrlOrMeta,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { expect, type Page, test } from '@playwright/test';

async function openTurnIntoMenu(page: Page) {
  await selectAllByKeyboard(page);
  const toolbar = locateToolbar(page);
  await toolbar.getByLabel('Conversions').click();
  return toolbar;
}

async function convertToCallout(page: Page) {
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

test('turn into callout preserves text formatting', async ({ page }) => {
  await type(page, 'plain ');
  await withCtrlOrMeta(page, () => page.keyboard.press('b'));
  await type(page, 'bold');
  await withCtrlOrMeta(page, () => page.keyboard.press('b'));
  await convertToCallout(page);

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  const innerParagraph = page.locator('affine-callout affine-paragraph');
  await expect(innerParagraph).toHaveCount(1);
  await expect(innerParagraph.locator('v-line')).toHaveText('plain bold');
  await expect(
    innerParagraph
      .locator('v-element', { hasText: 'bold' })
      .locator('span')
      .last()
  ).toHaveCSS('font-weight', '700');
});

test('turn into callout: nested list items remain reachable after conversion', async ({
  page,
}) => {
  await type(page, '- parent item');
  await pressEnter(page);
  await pressTab(page);
  await type(page, 'child item');

  await pressArrowUp(page);
  await convertToCallout(page);

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);
  await expect(callout).toContainText('parent item');
  await expect(callout).toContainText('child item');
  await expect(
    callout.locator('affine-paragraph affine-list', {
      hasText: 'child item',
    })
  ).toHaveCount(1);
});

test('turn into callout is unavailable for descendants of a callout', async ({
  page,
}) => {
  await type(page, '/callout\n- parent item');
  await pressEnter(page);
  await pressTab(page);
  await type(page, 'child item');

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  const toolbar = await openTurnIntoMenu(page);
  await expect(toolbar.getByLabel('Callout')).toHaveCount(0);

  await pressEscape(page);
  await expect(callout).toContainText('parent item');
  await expect(callout).toContainText('child item');
  await expect(callout).toHaveCount(1);
});

test('turn into callout: delete after conversion removes the whole callout', async ({
  page,
}) => {
  await type(page, 'delete me');
  await pressEscape(page);

  const toolbar = locateToolbar(page);
  await toolbar.getByLabel('Conversions').click();
  await toolbar.getByLabel('Callout').click();

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  await page.keyboard.press('Backspace');
  await expect(callout).toHaveCount(0);
});

test('turn into callout preserves the block tree across undo and redo', async ({
  page,
}) => {
  await type(page, 'undo me');
  await convertToCallout(page);

  const callout = page.locator('affine-callout');
  await expect(callout).toHaveCount(1);

  await undoByKeyboard(page);

  await expect(callout).toHaveCount(0);
  const paragraph = page.locator('affine-note affine-paragraph');
  await expect(paragraph).toContainText('undo me');

  if (process.platform === 'darwin') {
    await withCtrlOrMeta(page, () => page.keyboard.press('Shift+z'));
  } else {
    await page.keyboard.press('Control+y');
  }
  await expect(callout).toHaveCount(1);
  await expect(callout).toContainText('undo me');
});
