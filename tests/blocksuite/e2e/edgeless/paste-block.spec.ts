import { expect, type Page } from '@playwright/test';

import {
  click,
  copyByKeyboard,
  enterPlaygroundRoom,
  focusRichText,
  getAllEdgelessNoteIds,
  getAllEdgelessTextIds,
  getNoteBoundBoxInEdgeless,
  initEmptyEdgelessState,
  pasteByKeyboard,
  pasteTestImage,
  pressEnter,
  pressEnterWithShortkey,
  pressEscape,
  selectAllByKeyboard,
  setEdgelessTool,
  switchEditorMode,
  type,
} from '../utils/actions/index.js';
import { test } from '../utils/playwright.js';

test.describe('pasting blocks', () => {
  const initContent = async (page: Page) => {
    // Text
    await type(page, 'hello');
    await pressEnter(page);
    // Image
    await pasteTestImage(page);
    await pressEnter(page);
    // Text
    await type(page, 'world');
    await pressEnter(page);
    // code
    await type(page, '``` ');
    await type(page, 'code');
    await pressEnterWithShortkey(page);
  };
  test('pasting a note block', async ({ page }) => {
    await enterPlaygroundRoom(page);
    const { noteId } = await initEmptyEdgelessState(page);
    await focusRichText(page);
    await initContent(page);
    await switchEditorMode(page);
    await click(page, { x: 0, y: 0 });
    const box = await getNoteBoundBoxInEdgeless(page, noteId);
    await click(page, {
      x: box.x + 10,
      y: box.y + 10,
    });
    await copyByKeyboard(page);
    await pasteByKeyboard(page);
    // not equal to noteId
    const noteIds = await getAllEdgelessNoteIds(page);
    expect(noteIds.length).toBe(2);
    expect(noteIds[0]).toBe(noteId);
    const newNoteId = noteIds[1];
    const newNote = page.locator(
      `affine-edgeless-note[data-block-id="${newNoteId}"]`
    );
    await expect(newNote).toBeVisible();
    const blocks = newNote.locator('[data-block-id]');
    await expect(blocks.nth(0)).toContainText('hello');
    await expect(blocks.nth(1).locator('.resizable-img')).toBeVisible();
    await expect(blocks.nth(2)).toContainText('world');
    await expect(blocks.nth(3)).toContainText('code');
  });
  test('pasting a edgeless block', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await setEdgelessTool(page, 'default');
    await page.mouse.dblclick(130, 140, {
      delay: 100,
    });
    await initContent(page);
    await pressEscape(page, 3);
    await page.mouse.click(130, 140);
    await copyByKeyboard(page);
    await page.mouse.move(500, 500);
    await pasteByKeyboard(page);
    const textIds = await getAllEdgelessTextIds(page);
    expect(textIds.length).toBe(2);
    const newTextId = textIds[1];
    const newText = page.locator(
      `affine-edgeless-text[data-block-id="${newTextId}"]`
    );
    await expect(newText).toBeVisible();
    const blocks = newText.locator('[data-block-id]');
    await expect(blocks.nth(0)).toContainText('hello');
    await expect(blocks.nth(1).locator('.resizable-img')).toBeVisible();
    await expect(blocks.nth(2)).toContainText('world');
    await expect(blocks.nth(3)).toContainText('code');
  });

  test('pasting a note block from doc mode', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await focusRichText(page);
    await type(page, 'hello world');

    await selectAllByKeyboard(page);
    await copyByKeyboard(page);

    await switchEditorMode(page);
    await click(page, {
      x: 100,
      y: 100,
    });
    await pasteByKeyboard(page);

    // not equal to noteId
    const noteIds = await getAllEdgelessNoteIds(page);
    expect(noteIds.length).toBe(2);

    const newNoteId = noteIds[1];
    const newNote = page.locator(
      `affine-edgeless-note[data-block-id="${newNoteId}"]`
    );
    await expect(newNote).toBeVisible();
    const blocks = newNote.locator('[data-block-id]');
    await expect(blocks.nth(0)).toContainText('hello world');
  });
});
