import { expect } from '@playwright/test';

import {
  createFrame,
  createNote,
  createShapeElement,
  edgelessCommonSetup,
  getAllSortedIds,
  getEdgelessSelectedRectModel,
  Shape,
  zoomResetByKeyboard,
} from '../../utils/actions/edgeless.js';
import {
  pressEscape,
  selectAllByKeyboard,
} from '../../utils/actions/keyboard.js';
import { test } from '../../utils/playwright.js';

test.beforeEach(async ({ page }) => {
  await edgelessCommonSetup(page);
  await zoomResetByKeyboard(page);
});

test.describe('layer logic of frame block', () => {
  test('a new frame should be on the bottom layer', async ({ page }) => {
    const shapeId = await createShapeElement(
      page,
      [100, 100],
      [200, 200],
      Shape.Square
    );
    const noteId = await createNote(page, [200, 200]);
    await pressEscape(page, 3);

    await selectAllByKeyboard(page);
    const [x, y, w, h] = await getEdgelessSelectedRectModel(page);
    await pressEscape(page);
    const frameAId = await createFrame(
      page,
      [x - 10, y - 10],
      [x + w + 10, y + h + 10]
    );

    let sortedIds = await getAllSortedIds(page);
    expect(
      sortedIds[0],
      'a new frame created by frame-tool should be on the bottom layer'
    ).toBe(frameAId);
    expect(sortedIds[1]).toBe(shapeId);
    expect(sortedIds[2]).toBe(noteId);

    await selectAllByKeyboard(page);
    await page.keyboard.press('f');

    sortedIds = await getAllSortedIds(page);
    const frameBId = sortedIds.find(
      id => ![frameAId, noteId, shapeId].includes(id)
    );
    expect(
      sortedIds[0],
      'a new frame created by short-cut should also be on the bottom layer'
    ).toBe(frameBId);
    expect(sortedIds[1]).toBe(frameAId);
    expect(sortedIds[2]).toBe(shapeId);
    expect(sortedIds[3]).toBe(noteId);
  });
});
