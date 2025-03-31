import {
  pressArrowDown,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  undoByKeyboard,
} from '@affine-test/kit/utils/keyboard';
import { openHomePage } from '@affine-test/kit/utils/load-page';
import {
  clickNewPageButton,
  type,
  waitForEmptyEditor,
} from '@affine-test/kit/utils/page-logic';
import { expect, test } from '@playwright/test';

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
  const emoji = page.locator('affine-callout .affine-callout-emoji');
  await expect(callout).toBeVisible();
  await expect(emoji).toContainText('😀');

  const paragraph = page.locator('affine-callout affine-paragraph');
  await expect(paragraph).toHaveCount(1);

  const vLine = page.locator('affine-callout v-line');
  await expect(vLine).toHaveCount(2);
  expect(await vLine.nth(0).innerText()).toBe('aaaa');
  expect(await vLine.nth(1).innerText()).toBe('bbbb');

  await emoji.click();
  const emojiMenu = page.locator('affine-emoji-menu');
  await expect(emojiMenu).toBeVisible();
  await page
    .locator('div')
    .filter({ hasText: /^😀😃😄😁😆😅🤣😂🙂$/ })
    .getByLabel('😆')
    .click();
  await page.getByTestId('page-editor-blank').click();
  await expect(emojiMenu).not.toBeVisible();
  await expect(emoji).toContainText('😆');
});

test('disable slash menu in callout block', async ({ page }) => {
  await type(page, '/callout\n');
  const callout = page.locator('affine-callout');
  const emoji = page.locator('affine-callout .affine-callout-emoji');
  await expect(callout).toBeVisible();
  await expect(emoji).toContainText('😀');

  await type(page, '/');
  const slashMenu = page.locator('.slash-menu');
  await expect(slashMenu).not.toBeVisible();
  await undoByKeyboard(page);
  await undoByKeyboard(page);
  await type(page, '/');
  await expect(slashMenu).toBeVisible();
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
  await expect(paragraph).toHaveCount(2);
  await expect(callout).toHaveCount(1);

  await pressBackspace(page);
  await expect(paragraph).toHaveCount(1);
  await expect(callout).toHaveCount(0);
});
