import { expect } from '@playwright/test';

import {
  activeNoteInEdgeless,
  click,
  copyByKeyboard,
  countBlock,
  dragBetweenCoords,
  enterPlaygroundRoom,
  fillLine,
  focusRichText,
  getNoteRect,
  initEmptyEdgelessState,
  initSixParagraphs,
  pasteByKeyboard,
  redoByClick,
  redoByKeyboard,
  selectNoteInEdgeless,
  switchEditorMode,
  triggerComponentToolbarAction,
  type,
  undoByClick,
  undoByKeyboard,
  waitNextFrame,
  zoomResetByKeyboard,
} from '../../utils/actions/index.js';
import { assertRectEqual } from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test('undo/redo should work correctly after clipping', async ({ page }) => {
  await enterPlaygroundRoom(page);
  const { noteId } = await initEmptyEdgelessState(page);
  await initSixParagraphs(page);

  await switchEditorMode(page);
  await expect(page.locator('affine-edgeless-note')).toHaveCount(1);

  await selectNoteInEdgeless(page, noteId);
  await triggerComponentToolbarAction(page, 'changeNoteSlicerSetting');

  const button = page.locator('.note-slicer-button');
  await button.click();
  await expect(page.locator('affine-edgeless-note')).toHaveCount(2);

  await undoByKeyboard(page);
  await waitNextFrame(page);
  await expect(page.locator('affine-edgeless-note')).toHaveCount(1);
  await redoByKeyboard(page);
  await waitNextFrame(page);
  await expect(page.locator('affine-edgeless-note')).toHaveCount(2);
});

test('undo/redo should work correctly after resizing', async ({ page }) => {
  await enterPlaygroundRoom(page);
  const { noteId } = await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  await activeNoteInEdgeless(page, noteId);
  await waitNextFrame(page, 400);
  // current implementation may be a little inefficient
  await fillLine(page, true);
  await page.mouse.click(0, 0);
  await waitNextFrame(page, 400);
  await selectNoteInEdgeless(page, noteId);

  const initRect = await getNoteRect(page, noteId);
  const rightHandle = page.locator('.handle[aria-label="right"] .resize');
  const box = await rightHandle.boundingBox();
  if (box === null) throw new Error();

  await dragBetweenCoords(
    page,
    { x: box.x + 5, y: box.y + 5 },
    { x: box.x + 105, y: box.y + 5 }
  );
  const draggedRect = await getNoteRect(page, noteId);
  assertRectEqual(draggedRect, {
    x: initRect.x,
    y: initRect.y,
    w: initRect.w + 100,
    h: draggedRect.h, // not assert `h` here
  });
  expect(draggedRect.h).toBe(initRect.h);

  await undoByKeyboard(page);
  await waitNextFrame(page);
  const undoRect = await getNoteRect(page, noteId);
  assertRectEqual(undoRect, initRect);

  await redoByKeyboard(page);
  await waitNextFrame(page);
  const redoRect = await getNoteRect(page, noteId);
  assertRectEqual(redoRect, draggedRect);
});

test('continuous undo and redo (note block add operation) should work', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await switchEditorMode(page);
  await click(page, { x: 260, y: 450 });
  await copyByKeyboard(page);

  let count = await countBlock(page, 'affine-edgeless-note');
  expect(count).toBe(1);

  await page.mouse.move(100, 100);
  await pasteByKeyboard(page, false);
  await waitNextFrame(page, 1000);

  await page.mouse.move(200, 200);
  await pasteByKeyboard(page, false);
  await waitNextFrame(page, 1000);

  await page.mouse.move(300, 300);
  await pasteByKeyboard(page, false);
  await waitNextFrame(page, 1000);

  count = await countBlock(page, 'affine-edgeless-note');
  expect(count).toBe(4);

  await undoByClick(page);
  count = await countBlock(page, 'affine-edgeless-note');
  expect(count).toBe(3);

  await undoByClick(page);
  count = await countBlock(page, 'affine-edgeless-note');
  expect(count).toBe(2);

  await redoByClick(page);
  count = await countBlock(page, 'affine-edgeless-note');
  expect(count).toBe(3);

  await redoByClick(page);
  count = await countBlock(page, 'affine-edgeless-note');
  expect(count).toBe(4);
});
