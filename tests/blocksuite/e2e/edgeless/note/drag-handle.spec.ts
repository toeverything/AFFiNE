import { expect } from '@playwright/test';

import {
  addNote,
  dragHandleFromBlockToBlockBottomById,
  enterPlaygroundRoom,
  focusRichText,
  initEmptyEdgelessState,
  initThreeParagraphs,
  setEdgelessTool,
  switchEditorMode,
  type,
  waitNextFrame,
} from '../../utils/actions/index.js';
import { assertRectExist, assertRichTexts } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

const CENTER_X = 450;
const CENTER_Y = 450;

test('drag handle should be shown when a note is activated in default mode or hidden in other modes', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await assertRichTexts(page, ['hello']);

  await switchEditorMode(page);
  const noteBox = await page.locator('affine-edgeless-note').boundingBox();
  if (!noteBox) {
    throw new Error('Missing edgeless affine-note');
  }

  const [x, y] = [noteBox.x + 26, noteBox.y + noteBox.height / 2];

  await page.mouse.move(x, y);
  await expect(page.locator('.affine-drag-handle-container')).toBeHidden();
  await page.mouse.dblclick(x, y);
  await waitNextFrame(page);
  await page.mouse.move(x, y);

  await expect(page.locator('.affine-drag-handle-container')).toBeVisible();

  await page.mouse.move(0, 0);
  await setEdgelessTool(page, 'shape');
  await page.mouse.move(x, y);
  await expect(page.locator('.affine-drag-handle-container')).toBeHidden();

  await page.mouse.move(0, 0);
  await setEdgelessTool(page, 'default');
  await page.mouse.move(x, y);
  await page.mouse.click(x, y);
  await expect(page.locator('.affine-drag-handle-container')).toBeVisible();
});

test('drag handle can drag note into another note', async ({ page }) => {
  await enterPlaygroundRoom(page);
  const { noteId } = await initEmptyEdgelessState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await assertRichTexts(page, ['hello']);

  await switchEditorMode(page);
  const noteRect = await page
    .locator(`[data-block-id="${noteId}"]`)
    .boundingBox();
  assertRectExist(noteRect);

  const secondNoteId = await addNote(page, 'hello world', 100, 100);
  await waitNextFrame(page);
  const secondNoteRect = await page
    .locator(`[data-block-id="${secondNoteId}"]`)
    .boundingBox();
  assertRectExist(secondNoteRect);

  {
    const [x, y] = [
      noteRect.x + noteRect.width / 2,
      noteRect.y + noteRect.height / 2,
    ];
    await page.mouse.click(noteRect.x, noteRect.y + noteRect.height + 100);
    await page.mouse.move(x, y);
    await page.mouse.click(x, y);

    const handlerRect = await page
      .locator('.affine-drag-handle-container')
      .boundingBox();
    assertRectExist(handlerRect);

    await page.mouse.move(
      handlerRect.x + handlerRect.width / 2,
      handlerRect.y + handlerRect.height / 2
    );
    await page.mouse.down();

    const [targetX, targetY] = [
      secondNoteRect.x + 10,
      secondNoteRect.y + secondNoteRect.height / 2,
    ];
    await page.mouse.move(targetX, targetY);
    await page.mouse.up();

    await waitNextFrame(page);
  }
});

test('drag handle should work inside one note', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await initThreeParagraphs(page);

  await switchEditorMode(page);

  await page.mouse.dblclick(CENTER_X, CENTER_Y);
  await dragHandleFromBlockToBlockBottomById(page, '3', '5');
  await waitNextFrame(page);
  await expect(page.locator('affine-drag-handle-container')).toBeHidden();
  await assertRichTexts(page, ['456', '789', '123']);
});

test.fixme(
  'drag handle should work across multiple notes',
  async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await initThreeParagraphs(page);
    await assertRichTexts(page, ['123', '456', '789']);

    await switchEditorMode(page);

    await setEdgelessTool(page, 'note');

    await page.mouse.click(200, 200);
    await focusRichText(page, 3);
    await waitNextFrame(page);

    // block id 7
    await type(page, '000');

    await page.mouse.dblclick(CENTER_X, CENTER_Y - 20);
    await dragHandleFromBlockToBlockBottomById(page, '3', '7');
    await expect(page.locator('.affine-drag-handle-container')).toBeHidden();
    await waitNextFrame(page);
    await assertRichTexts(page, ['456', '789', '000', '123']);

    // await page.mouse.dblclick(305, 305);
    await dragHandleFromBlockToBlockBottomById(page, '3', '4');
    await waitNextFrame(page);
    await expect(page.locator('.affine-drag-handle-container')).toBeHidden();
    await assertRichTexts(page, ['456', '123', '789', '000']);

    await expect(page.locator('selected > *')).toHaveCount(0);
  }
);
