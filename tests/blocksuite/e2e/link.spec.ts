import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

import {
  cutByKeyboard,
  dragBetweenIndices,
  enterPlaygroundRoom,
  focusRichText,
  focusRichTextEnd,
  getPageSnapshot,
  initEmptyParagraphState,
  pasteByKeyboard,
  pressEnter,
  pressShiftEnter,
  pressTab,
  selectAllByKeyboard,
  setSelection,
  SHORT_KEY,
  switchReadonly,
  type,
  waitNextFrame,
} from './utils/actions/index.js';
import { assertKeyboardWorkInInput } from './utils/asserts.js';
import { test } from './utils/playwright.js';

const pressCreateLinkShortCut = async (page: Page) => {
  await page.keyboard.press(`${SHORT_KEY}+k`);
};

test('basic link', async ({ page }, testInfo) => {
  const linkText = 'linkText';
  const link = 'http://example.com';
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, linkText);

  // Create link
  await dragBetweenIndices(page, [0, 0], [0, 8]);
  await pressCreateLinkShortCut(page);
  await page.mouse.move(0, 0);

  const createLinkPopoverLocator = page.locator('.affine-link-popover.create');
  await expect(createLinkPopoverLocator).toBeVisible();
  const linkPopoverInput = page.locator('.affine-link-popover-input');
  await expect(linkPopoverInput).toBeVisible();
  await type(page, link);
  await pressEnter(page);
  await expect(createLinkPopoverLocator).not.toBeVisible();

  const linkLocator = page.locator('affine-link a');
  await expect(linkLocator).toHaveAttribute('href', link);

  // clear text selection
  await page.keyboard.press('ArrowLeft');

  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  // Hover link
  await expect(toolbar).not.toBeVisible();
  await linkLocator.hover();
  // wait for popover delay open
  await page.waitForTimeout(200);
  await expect(toolbar).toBeVisible();

  // Edit link
  const text2 = 'link2';
  const link2 = 'https://github.com';
  const editLinkBtn = toolbar.getByTestId('edit');
  await editLinkBtn.click();

  const editLinkPopoverLocator = page.locator('.affine-link-edit-popover');
  await expect(editLinkPopoverLocator).toBeVisible();
  // workaround to make tab key work as expected
  await editLinkPopoverLocator.click({
    position: { x: 5, y: 5 },
  });
  await page.keyboard.press('Tab');
  await type(page, text2);
  await page.keyboard.press('Tab');
  await type(page, link2);
  await page.keyboard.press('Tab');
  await pressEnter(page);
  const link2Locator = page.locator('affine-link a');

  await expect(link2Locator).toHaveAttribute('href', link2);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test('add link when dragging from empty line', async ({ page }) => {
  const linkText = 'linkText\n\n';
  const link = 'http://example.com';
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, linkText);

  // Create link
  await dragBetweenIndices(page, [2, 0], [0, 0], {
    x: 1,
    y: 2,
  });
  await pressCreateLinkShortCut(page);
  await page.mouse.move(0, 0);

  const createLinkPopoverLocator = page.locator('.affine-link-popover.create');
  await expect(createLinkPopoverLocator).toBeVisible();
  const linkPopoverInput = page.locator('.affine-link-popover-input');
  await expect(linkPopoverInput).toBeVisible();
  await type(page, link);
  await pressEnter(page);
  await expect(createLinkPopoverLocator).not.toBeVisible();

  const linkLocator = page.locator('affine-link a');
  await expect(linkLocator).toHaveAttribute('href', link);
});

async function createLinkBlock(page: Page, str: string, link: string) {
  const id = await page.evaluate(
    ([str, link]) => {
      const { doc } = window;
      const rootId = doc.addBlock('affine:page', {
        title: new window.$blocksuite.store.Text('title'),
      });
      const noteId = doc.addBlock('affine:note', {}, rootId);

      const text = new window.$blocksuite.store.Text([
        { insert: 'Hello' },
        { insert: str, attributes: { link } },
      ]);
      const id = doc.addBlock(
        'affine:paragraph',
        { type: 'text', text: text },
        noteId
      );
      return id;
    },
    [str, link]
  );
  return id;
}

test('type character in link should not jump out link node', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await createLinkBlock(page, 'link text', 'http://example.com');
  await focusRichText(page, 0);
  await page.keyboard.press('ArrowLeft');
  await type(page, 'IN_LINK');
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test('type character after link should not extend the link attributes', async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await createLinkBlock(page, 'link text', 'http://example.com');
  await focusRichText(page, 0);
  await type(page, 'AFTER_LINK');
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test('readonly mode should not trigger toolbar', async ({ page }) => {
  await enterPlaygroundRoom(page);
  const linkText = 'linkText';
  await createLinkBlock(page, 'linkText', 'http://example.com');
  await focusRichText(page, 0);
  const linkLocator = page.locator(`text="${linkText}"`);

  // Hover link
  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  await linkLocator.hover();
  await expect(toolbar).toBeVisible();

  await switchReadonly(page);

  await page.mouse.move(0, 0);
  // XXX Wait for readonly delay
  await page.waitForTimeout(300);

  await linkLocator.hover();
  await expect(toolbar).not.toBeVisible();

  // ---
  // press hotkey should not trigger create link popup

  await dragBetweenIndices(page, [0, 0], [0, 3]);
  await pressCreateLinkShortCut(page);

  await expect(toolbar).not.toBeVisible();
  const linkPopoverInput = page.locator('.affine-link-popover-input');
  await expect(linkPopoverInput).not.toBeVisible();
});

test('should mock selection not stored', async ({ page }, testInfo) => {
  const linkText = 'linkText';
  const link = 'http://example.com';
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, linkText);

  // Create link
  await dragBetweenIndices(page, [0, 0], [0, 8]);
  await pressCreateLinkShortCut(page);

  const mockSelectNode = page.locator('.mock-selection');
  await expect(mockSelectNode).toHaveCount(1);
  await expect(mockSelectNode).toBeVisible();

  // the mock select node should not be stored in the Y doc
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );

  await type(page, link);
  await pressEnter(page);

  // the mock select node should be removed after link created
  await expect(mockSelectNode).not.toBeVisible();
  await expect(mockSelectNode).toHaveCount(0);
});

test('should keyboard work in link popover', async ({ page }) => {
  await enterPlaygroundRoom(page);
  const linkText = 'linkText';
  await createLinkBlock(page, linkText, 'http://example.com');

  await dragBetweenIndices(page, [0, 0], [0, 8]);
  await pressCreateLinkShortCut(page);
  const linkPopoverInput = page.locator('.affine-link-popover-input');
  await assertKeyboardWorkInInput(page, linkPopoverInput);
  await page.mouse.click(500, 500);

  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  const linkLocator = page.locator(`text="${linkText}"`);

  await focusRichText(page);
  // hover link
  await linkLocator.hover();
  // wait for popover delay open
  await page.waitForTimeout(500);
  await expect(toolbar).toBeVisible();

  const editLinkBtn = toolbar.getByTestId('edit');
  await editLinkBtn.click();

  const editLinkPopover = page.locator('.affine-link-edit-popover');
  await expect(editLinkPopover).toBeVisible();

  const editTextInput = editLinkPopover.locator(
    '.affine-edit-area.text .affine-edit-input'
  );
  await assertKeyboardWorkInInput(page, editTextInput);
  const editLinkInput = editLinkPopover.locator(
    '.affine-edit-area.link .affine-edit-input'
  );
  await assertKeyboardWorkInInput(page, editLinkInput);
});

test('link bar should not be appear when the range is collapsed', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaa');

  await pressCreateLinkShortCut(page);
  const linkPopoverLocator = page.locator('.affine-link-popover');
  await expect(linkPopoverLocator).not.toBeVisible();

  await dragBetweenIndices(page, [0, 0], [0, 3]);
  await pressCreateLinkShortCut(page);
  await expect(linkPopoverLocator).toBeVisible();

  await focusRichText(page); // click to cancel the link popover
  await waitNextFrame(page);
  await focusRichTextEnd(page);
  await pressShiftEnter(page);
  await waitNextFrame(page);
  await type(page, 'bbb');
  await dragBetweenIndices(page, [0, 1], [0, 5]);
  await pressCreateLinkShortCut(page);
  await expect(linkPopoverLocator).toBeVisible();

  await focusRichText(page); // click to cancel the link popover
  await focusRichTextEnd(page);
  await pressEnter(page);
  // create auto line-break in span element
  await type(page, 'd'.repeat(67));
  await page.mouse.click(1, 1);
  await focusRichText(page);
  await waitNextFrame(page);
  await dragBetweenIndices(page, [1, 1], [1, 66]);
  await pressCreateLinkShortCut(page);
  await expect(linkPopoverLocator).toBeVisible();
});

test('create link with paste', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaa');

  await dragBetweenIndices(page, [0, 0], [0, 3]);
  await pressCreateLinkShortCut(page);

  const createLinkPopoverLocator = page.locator('.affine-link-popover.create');
  const confirmBtn = createLinkPopoverLocator.locator('.affine-confirm-button');

  await expect(createLinkPopoverLocator).toBeVisible();
  await expect(confirmBtn).toHaveAttribute('disabled');

  await type(page, 'affine.pro');
  await expect(confirmBtn).not.toHaveAttribute('disabled');
  await selectAllByKeyboard(page);
  await cutByKeyboard(page);

  // press enter should not trigger confirm
  await pressEnter(page);
  await expect(createLinkPopoverLocator).toBeVisible();
  await expect(confirmBtn).toHaveAttribute('disabled');

  await pasteByKeyboard(page, false);
  await expect(confirmBtn).not.toHaveAttribute('disabled');
  await pressEnter(page);
  await expect(createLinkPopoverLocator).not.toBeVisible();
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test('convert link to card', async ({ page }, testInfo) => {
  const linkText = 'alinkTexta';
  const link = 'http://example.com';
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaa');
  await pressEnter(page);
  await type(page, linkText);

  // Create link
  await setSelection(page, 3, 1, 3, 9);
  await pressCreateLinkShortCut(page);
  await waitNextFrame(page);
  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  await expect(toolbar).toBeVisible();
  const linkPopoverInput = page.locator('.affine-link-popover-input');
  await expect(linkPopoverInput).toBeVisible();
  await type(page, link);
  await pressEnter(page);
  await focusRichText(page, 1);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );

  const linkLocator = page.locator('affine-link a');

  await linkLocator.hover();
  await waitNextFrame(page);
  await expect(toolbar).toBeVisible();

  await toolbar.getByRole('button', { name: 'Switch view' }).click();
  const linkToCardBtn = toolbar.getByTestId('link-to-card');
  const linkToEmbedBtn = toolbar.getByTestId('link-to-embed');
  await expect(linkToCardBtn).toBeVisible();
  await expect(linkToEmbedBtn).not.toBeVisible();

  await page.mouse.move(0, 0);
  await waitNextFrame(page);
  await expect(toolbar).not.toBeVisible();
  await focusRichText(page, 1);
  await pressTab(page);

  await linkLocator.hover();
  await waitNextFrame(page);
  await expect(toolbar).toBeVisible();
  await toolbar.getByRole('button', { name: 'Switch view' }).click();
  await expect(linkToCardBtn).toBeVisible();
  await expect(linkToEmbedBtn).not.toBeVisible();
});

test('convert link to embed', async ({ page }, testInfo) => {
  const linkText = 'alinkTexta';
  const link = 'https://www.youtube.com/watch?v=U6s2pdxebSo';
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  await focusRichText(page);
  await type(page, 'aaa');
  await pressEnter(page);
  await type(page, linkText);

  // Create link
  await setSelection(page, 3, 1, 3, 9);
  await pressCreateLinkShortCut(page);
  await waitNextFrame(page);
  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  await expect(toolbar).toBeVisible();
  const linkPopoverInput = page.locator('.affine-link-popover-input');
  await expect(linkPopoverInput).toBeVisible();
  await type(page, link);
  await pressEnter(page);
  await focusRichText(page);

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );

  const linkLocator = page.locator('affine-link a');

  await linkLocator.hover();
  await waitNextFrame(page);
  await expect(toolbar).toBeVisible();
});
