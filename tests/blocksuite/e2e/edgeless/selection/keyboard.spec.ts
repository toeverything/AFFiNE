import { expect } from '@playwright/test';

import * as actions from '../../utils/actions/edgeless.js';
import {
  addNote,
  changeNoteDisplayModeWithId,
  setEdgelessTool,
  zoomResetByKeyboard,
} from '../../utils/actions/edgeless.js';
import {
  addBasicBrushElement,
  addBasicRectShapeElement,
  dragBetweenCoords,
  enterPlaygroundRoom,
  initEmptyEdgelessState,
  selectAllByKeyboard,
  switchEditorMode,
} from '../../utils/actions/index.js';
import {
  assertEdgelessDraggingArea,
  assertEdgelessNonSelectedRect,
  assertEdgelessSelectedElementHandleCount,
  assertEdgelessSelectedRect,
  assertVisibleBlockCount,
} from '../../utils/asserts.js';
import { NoteDisplayMode } from '../../utils/bs-alternative.js';
import { test } from '../../utils/playwright.js';

test.describe('translation should constrain to cur axis when dragged with shift key', () => {
  test('constrain-x', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);

    await switchEditorMode(page);

    await addBasicRectShapeElement(
      page,
      { x: 100, y: 100 },
      { x: 200, y: 200 }
    );

    await page.mouse.move(110, 110);
    await page.mouse.down();

    await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);
    await page.keyboard.down('Shift');
    await page.mouse.move(110, 200); // constrain to y
    await page.mouse.move(300, 200); // constrain to x
    await assertEdgelessSelectedRect(page, [290, 100, 100, 100]); // y should remain same as constrained to x
  });

  test('constrain-y', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);

    await switchEditorMode(page);

    await addBasicRectShapeElement(
      page,
      { x: 100, y: 100 },
      { x: 200, y: 200 }
    );

    await page.mouse.move(110, 110);
    await page.mouse.down();

    await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);
    await page.keyboard.down('Shift');
    await page.mouse.move(200, 110); // constrain to x
    await page.mouse.move(200, 300); // constrain to y
    await assertEdgelessSelectedRect(page, [100, 290, 100, 100]); // x should remain same as constrained to y
  });
});

test('select multiple shapes and press "Escape" to cancel selection', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);

  await addBasicBrushElement(page, { x: 100, y: 100 }, { x: 200, y: 200 });
  await page.mouse.click(110, 110);
  await assertEdgelessSelectedRect(page, [98, 98, 104, 104]);

  await addBasicRectShapeElement(page, { x: 210, y: 110 }, { x: 310, y: 210 });
  await page.mouse.click(220, 120);
  await assertEdgelessSelectedRect(page, [210, 110, 100, 100]);

  // Select both shapes
  await dragBetweenCoords(page, { x: 90, y: 90 }, { x: 320, y: 220 });

  // assert all shapes are selected
  await assertEdgelessSelectedRect(page, [98, 98, 212, 112]);

  // Press "Escape" to cancel the selection
  await page.keyboard.press('Escape');

  await assertEdgelessNonSelectedRect(page);
});

test('should move selection drag area when holding spaceBar', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);
  await setEdgelessTool(page, 'default');

  // Click to start the initial dragging area
  await page.mouse.click(100, 100);

  const initialX = 100,
    initialY = 100;
  const finalX = 300,
    finalY = 300;

  await dragBetweenCoords(
    page,
    { x: initialX, y: initialY },
    { x: finalX, y: finalY },
    {
      beforeMouseUp: async () => {
        await page.keyboard.down('Space');

        const dx = 100,
          dy = 100;
        await page.mouse.move(finalX + dx, finalY + dy);
        await assertEdgelessDraggingArea(page, [
          initialX + dx,
          initialY + dy,
          // width and height should be same
          finalX - initialX,
          finalY - initialY,
        ]);

        await page.keyboard.up('Space');
      },
    }
  );
});

test('selection drag-area start should be same when space is pressed again', async ({
  page,
}) => {
  //? This test is to check whether there is any flicker or jump when using the space again in the same selection

  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);

  // Make the selection out side the rect and move the selection to the rect
  await dragBetweenCoords(
    page,
    // Make the selection not selecting the rect
    { x: 100, y: 100 },
    { x: 200, y: 200 },
    {
      beforeMouseUp: async () => {
        await page.keyboard.down('Space');
        // Move the selection over to the rect
        await page.mouse.move(300, 300);

        let draggingArea = page.locator('.affine-edgeless-dragging-area');
        const firstBound = await draggingArea.boundingBox();

        await page.keyboard.up('Space');

        await page.mouse.move(400, 400);
        await page.keyboard.down('Space');

        await page.mouse.move(410, 410);
        await page.mouse.move(400, 400);

        draggingArea = page.locator('.affine-edgeless-dragging-area');
        const newBound = await draggingArea.boundingBox();

        expect(firstBound).not.toBe(null);
        expect(newBound).not.toBe(null);

        const { x: fx, y: fy } = firstBound!;
        const { x: nx, y: ny } = newBound!;

        expect([fx, fy]).toStrictEqual([nx, ny]);
      },
    }
  );
});

test('should be able to update selection dragging area after releasing space', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);
  await setEdgelessTool(page, 'default');

  // Click to start the initial dragging area
  await page.mouse.click(100, 100);

  const initialX = 100,
    initialY = 100;
  const finalX = 300,
    finalY = 300;

  await dragBetweenCoords(
    page,
    { x: initialX, y: initialY },
    { x: finalX, y: finalY },
    {
      beforeMouseUp: async () => {
        await page.keyboard.down('Space');

        const dx = 100,
          dy = 100;

        // Move the mouse to simulate dragging with spaceBar held
        await page.mouse.move(finalX + dx, finalY + dy);

        await page.keyboard.up('Space');
        // scale after moving
        const dSx = 100;
        const dSy = 100;

        await page.mouse.move(finalX + dx + dSx, finalY + dy + dSy);

        await assertEdgelessDraggingArea(page, [
          initialX + dx,
          initialY + dy,
          // In the second scale it should scale by dS(.)
          finalX - initialX + dSx,
          finalY - initialY + dSy,
        ]);
      },
    }
  );
});

test('cmd+a should not select doc only note', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  const note2 = await addNote(page, 'note2', 100, 200);
  await addNote(page, 'note3', 200, 300);
  await page.mouse.click(200, 500);
  // assert add note success, there should be 2 notes in edgeless page
  await assertVisibleBlockCount(page, 'edgeless-note', 3);

  // change note display mode to doc only
  await changeNoteDisplayModeWithId(page, note2, NoteDisplayMode.DocOnly);
  // there should still be 2 notes in edgeless page
  await assertVisibleBlockCount(page, 'edgeless-note', 2);

  // cmd+a should not select doc only note
  await selectAllByKeyboard(page);
  // there should be only 2 notes in selection
  await assertEdgelessSelectedElementHandleCount(page, 2);
});
