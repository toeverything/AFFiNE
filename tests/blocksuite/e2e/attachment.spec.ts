import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sleep } from '@blocksuite/global/utils';
import { expect, type Page } from '@playwright/test';

import { dragBlockToPoint, popImageMoreMenu } from './utils/actions/drag.js';
import { switchEditorMode } from './utils/actions/edgeless.js';
import {
  pressArrowDown,
  pressArrowUp,
  pressBackspace,
  pressEnter,
  pressEscape,
  pressShiftTab,
  pressTab,
  redoByKeyboard,
  SHORT_KEY,
  type,
  undoByKeyboard,
} from './utils/actions/keyboard.js';
import {
  captureHistory,
  enterPlaygroundRoom,
  focusRichText,
  getPageSnapshot,
  initEmptyEdgelessState,
  initEmptyParagraphState,
  resetHistory,
  waitNextFrame,
} from './utils/actions/misc.js';
import {
  assertBlockChildrenIds,
  assertBlockCount,
  assertBlockFlavour,
  assertBlockSelections,
  assertKeyboardWorkInInput,
  assertParentBlockFlavour,
  assertRichImage,
  assertRichTextInlineRange,
} from './utils/asserts.js';
import { test } from './utils/playwright.js';

const FILE_NAME = 'test-card-1.png';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FILE_PATH = path.resolve(
  __dirname,
  `../../../blocksuite/playground/public/${FILE_NAME}`
);

function getAttachment(page: Page) {
  const attachment = page.locator('affine-attachment');
  const loading = attachment.locator('.affine-attachment-card.loading');
  const toolbar = page.locator('affine-toolbar-widget editor-toolbar');
  const switchViewButton = toolbar.getByRole('button', { name: 'Switch view' });
  const renameBtn = toolbar.getByRole('button', { name: 'Rename' });
  const renameInput = page.locator('.affine-attachment-rename-container input');

  const insertAttachment = async () => {
    await page.evaluate(() => {
      // Force fallback to input[type=file] in tests
      // See https://github.com/microsoft/playwright/issues/8850
      window.showOpenFilePicker = undefined;
    });

    const slashMenu = page.locator(`.slash-menu`);
    await waitNextFrame(page);
    await type(page, '/');
    await resetHistory(page);
    await expect(slashMenu).toBeVisible();
    await type(page, 'file', 100);
    await expect(slashMenu).toBeVisible();

    const fileChooser = page.waitForEvent('filechooser');
    await pressEnter(page);
    await sleep(100);
    await (await fileChooser).setFiles(FILE_PATH);

    // Try to break the undo redo test
    await captureHistory(page);

    await expect(attachment).toBeVisible();
  };

  const getName = () =>
    attachment.locator('.affine-attachment-content-title-text').innerText();

  return {
    // locators
    attachment,
    toolbar,
    switchViewButton,
    renameBtn,
    renameInput,

    // actions
    insertAttachment,
    /**
     * Wait for the attachment upload to finish
     */
    waitLoading: () => loading.waitFor({ state: 'hidden' }),
    getName,
    getSize: () =>
      attachment.locator('.affine-attachment-content-info').innerText(),

    turnToEmbed: async () => {
      await expect(switchViewButton).toBeVisible();
      await switchViewButton.click();
      await page.getByRole('button', { name: 'Embed view' }).click();
      await assertRichImage(page, 1);
    },
    rename: async (newName: string) => {
      await attachment.click();
      await expect(toolbar).toBeVisible();
      await renameBtn.click();
      await page.keyboard.press(`${SHORT_KEY}+a`, { delay: 50 });
      await pressBackspace(page);
      await type(page, newName);
      await pressEnter(page);
      expect(await getName()).toContain(newName);
    },

    // external
    turnImageToCard: async () => {
      const { turnIntoCardButton } = await popImageMoreMenu(page);
      await turnIntoCardButton.click();
      await expect(attachment).toBeVisible();
    },
  };
}

test('can insert attachment from slash menu', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  const { insertAttachment, waitLoading, getName, getSize } =
    getAttachment(page);

  await focusRichText(page);
  await insertAttachment();

  // Wait for the attachment to be uploaded
  await waitLoading();

  expect(await getName()).toBe(FILE_NAME);
  expect(await getSize()).toBe('44.73KB');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test('should undo/redo works for attachment', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  const { insertAttachment, waitLoading } = getAttachment(page);

  await focusRichText(page);
  await insertAttachment();

  // Wait for the attachment to be uploaded
  await waitLoading();

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );

  await undoByKeyboard(page);
  await page.locator('affine-attachment').waitFor({ state: 'detached' });

  // The loading/error state should not be restored after undo
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_2.json`
  );

  await redoByKeyboard(page);
  await waitNextFrame(page);

  // The loading/error state should not be restored after undo
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_3.json`
  );
});

test('should rename attachment works', async ({ page }) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/4534',
  });
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  const {
    attachment,
    renameBtn,
    renameInput,
    insertAttachment,
    waitLoading,
    getName,
    rename,
  } = getAttachment(page);

  await focusRichText(page);
  await insertAttachment();
  // Wait for the attachment to be uploaded
  await waitLoading();

  expect(await getName()).toBe(FILE_NAME);

  await attachment.click();
  await expect(renameBtn).toBeVisible();
  await renameBtn.click();
  await assertKeyboardWorkInInput(page, renameInput);
  await pressEscape(page);
  await expect(renameInput).not.toBeVisible();

  await rename('new-name');
  expect(await getName()).toBe('new-name.png');
  await rename('');
  expect(await getName()).toBe('.png');
  await rename('abc');
  expect(await getName()).toBe('abc');
});

test('should turn attachment to image works', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  const {
    attachment,
    insertAttachment,
    waitLoading,
    turnToEmbed,
    turnImageToCard,
  } = getAttachment(page);

  await focusRichText(page);
  await insertAttachment();
  // Wait for the attachment to be uploaded
  await waitLoading();

  await attachment.click();
  await turnToEmbed();

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );

  await turnImageToCard();

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_2.json`
  );
});

test('should attachment can be deleted', async ({ page }, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  const { attachment, insertAttachment, waitLoading } = getAttachment(page);

  await focusRichText(page);
  await insertAttachment();
  // Wait for the attachment to be uploaded
  await waitLoading();

  await attachment.click();
  await pressBackspace(page);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}.json`
  );
});

test(`support dragging attachment block directly`, async ({
  page,
}, testInfo) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  const { insertAttachment, waitLoading, getName, getSize } =
    getAttachment(page);

  await focusRichText(page);
  await insertAttachment();

  // Wait for the attachment to be uploaded
  await waitLoading();

  expect(await getName()).toBe(FILE_NAME);
  expect(await getSize()).toBe('44.73KB');

  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_1.json`
  );

  const attachmentBlock = page.locator('affine-attachment');
  const rect = await attachmentBlock.boundingBox();
  if (!rect) {
    throw new Error('image not found');
  }

  // add new paragraph blocks
  await page.mouse.click(rect.x + 20, rect.y + rect.height + 20);
  await focusRichText(page);
  await type(page, '111');
  await page.waitForTimeout(200);
  await pressEnter(page);

  await type(page, '222');
  await page.waitForTimeout(200);
  await pressEnter(page);

  await type(page, '333');
  await page.waitForTimeout(200);

  await page.waitForTimeout(200);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_2.json`
  );

  // drag bookmark block
  await page.mouse.move(rect.x + 20, rect.y + 20);
  await page.mouse.down();
  await page.mouse.move(rect.x + 40, rect.y + rect.height + 80, { steps: 20 });
  await page.mouse.up();

  const rects = page.locator('.affine-attachment-container.focused');
  await expect(rects).toHaveCount(1);
  expect(await getPageSnapshot(page, true)).toMatchSnapshot(
    `${testInfo.title}_3.json`
  );
});

test('press backspace after attachment block can select attachment block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  const { insertAttachment, waitLoading } = getAttachment(page);

  await focusRichText(page);
  await pressEnter(page);
  await pressArrowUp(page);
  await insertAttachment();
  // Wait for the attachment to be uploaded
  await waitLoading();

  await focusRichText(page);
  await assertBlockCount(page, 'paragraph', 1);
  await assertRichTextInlineRange(page, 0, 0);
  await pressBackspace(page);
  await assertBlockSelections(page, ['4']);
  await assertBlockCount(page, 'paragraph', 0);
});

test('cancel file picker with input element resolves', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);

  const { attachment } = getAttachment(page);

  await focusRichText(page);
  await pressEnter(page);
  await pressArrowUp(page);

  await page.evaluate(() => {
    // Force fallback to input[type=file]
    window.showOpenFilePicker = undefined;
  });

  const slashMenu = page.locator(`.slash-menu`);
  await waitNextFrame(page);
  await type(page, '/file', 100);
  await expect(slashMenu).toBeVisible();

  const fileChooser = page.waitForEvent('filechooser');
  await pressEnter(page);
  const inputFile = page.locator("input[type='file']");
  await expect(inputFile).toHaveCount(1);

  // This does not trigger `cancel` event and,
  // therefore, the test isn't representative.
  // Waiting for https://github.com/microsoft/playwright/issues/27524
  await (await fileChooser).setFiles([]);

  await expect(attachment).toHaveCount(0);
  await expect(inputFile).toHaveCount(0);
});

test('indent attachment block to paragraph', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  const { insertAttachment, waitLoading } = getAttachment(page);

  await focusRichText(page);
  await pressEnter(page);
  await insertAttachment();
  // Wait for the attachment to be uploaded
  await waitLoading();

  await assertBlockChildrenIds(page, '1', ['2', '4']);
  await assertBlockFlavour(page, '1', 'affine:note');
  await assertBlockFlavour(page, '2', 'affine:paragraph');
  await assertBlockFlavour(page, '4', 'affine:attachment');

  await focusRichText(page);
  await pressArrowDown(page);
  await assertBlockSelections(page, ['4']);
  await pressTab(page);
  await assertBlockChildrenIds(page, '1', ['2']);
  await assertBlockChildrenIds(page, '2', ['4']);

  await pressShiftTab(page);
  await assertBlockChildrenIds(page, '1', ['2', '4']);
});

test('indent attachment block to list', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyParagraphState(page);
  const { insertAttachment, waitLoading } = getAttachment(page);

  await focusRichText(page);
  await type(page, '- a');
  await pressEnter(page);
  await insertAttachment();
  // Wait for the attachment to be uploaded
  await waitLoading();

  await assertBlockChildrenIds(page, '1', ['3', '5']);
  await assertBlockFlavour(page, '1', 'affine:note');
  await assertBlockFlavour(page, '3', 'affine:list');
  await assertBlockFlavour(page, '5', 'affine:attachment');

  await focusRichText(page);
  await pressArrowDown(page);
  await assertBlockSelections(page, ['5']);
  await pressTab(page);
  await assertBlockChildrenIds(page, '1', ['3']);
  await assertBlockChildrenIds(page, '3', ['5']);

  await pressShiftTab(page);
  await assertBlockChildrenIds(page, '1', ['3', '5']);
});

test('attachment can be dragged from note to surface top level block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  const { insertAttachment, waitLoading } = getAttachment(page);

  await focusRichText(page);
  await insertAttachment();

  // Wait for the attachment to be uploaded
  await waitLoading();

  await switchEditorMode(page);
  await page.mouse.dblclick(450, 450);

  await dragBlockToPoint(page, '4', { x: 200, y: 200 });

  await waitNextFrame(page);
  await assertParentBlockFlavour(page, '4', 'affine:surface');
});
