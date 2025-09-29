import {
  pressArrowDown,
  pressArrowUp,
  pressBackspace,
  pressEnter,
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
