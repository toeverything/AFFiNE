import {
  selectElementInEdgeless,
  switchEditorMode,
  zoomResetByKeyboard,
} from '../utils/actions/edgeless.js';
import {
  addBasicBrushElement,
  addBasicRectShapeElement,
  clickView,
  dragBetweenCoords,
  enterPlaygroundRoom,
  initEmptyEdgelessState,
  pressBackspace,
  resizeElementByHandle,
} from '../utils/actions/index.js';
import {
  assertEdgelessSelectedReactCursor,
  assertEdgelessSelectedRect,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test.describe('resizing shapes and aspect ratio will be maintained', () => {
  test('positive adjustment', async ({ page }) => {
    await enterPlaygroundRoom(page);
    const { noteId } = await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await zoomResetByKeyboard(page);

    // delete note to avoid snapping to it
    await clickView(page, [0, 0]);
    await selectElementInEdgeless(page, [noteId]);
    await pressBackspace(page);

    await addBasicBrushElement(page, { x: 100, y: 100 }, { x: 200, y: 200 });
    await page.mouse.click(110, 110);
    await assertEdgelessSelectedRect(page, [98, 98, 104, 104]);

    await addBasicRectShapeElement(
      page,
      { x: 210, y: 210 },
      { x: 310, y: 310 }
    );
    await page.mouse.click(220, 220);

    await dragBetweenCoords(page, { x: 120, y: 90 }, { x: 220, y: 220 });
    await assertEdgelessSelectedRect(page, [98, 98, 212, 212]);

    await resizeElementByHandle(page, { x: 50, y: 50 });
    await assertEdgelessSelectedRect(page, [148, 148, 162, 162]);
  });

  test('negative adjustment', async ({ page }) => {
    await enterPlaygroundRoom(page);
    const { noteId } = await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await zoomResetByKeyboard(page);

    // delete note to avoid snapping to it
    await clickView(page, [0, 0]);
    await selectElementInEdgeless(page, [noteId]);
    await pressBackspace(page);

    await addBasicBrushElement(page, { x: 100, y: 100 }, { x: 200, y: 200 });
    await page.mouse.click(110, 110);
    await assertEdgelessSelectedRect(page, [98, 98, 104, 104]);

    await addBasicRectShapeElement(
      page,
      { x: 210, y: 210 },
      { x: 310, y: 310 }
    );
    await page.mouse.click(220, 220);

    await dragBetweenCoords(page, { x: 120, y: 90 }, { x: 220, y: 220 });
    await assertEdgelessSelectedRect(page, [98, 98, 212, 212]);

    await resizeElementByHandle(page, { x: 50, y: 50 }, 'bottom-right', 30);
    await assertEdgelessSelectedRect(page, [98, 98, 262, 262]);
  });
});

test.describe('cursor style', () => {
  test('editor is aligned at the start of viewport', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await zoomResetByKeyboard(page);

    await addBasicRectShapeElement(
      page,
      { x: 200, y: 200 },
      { x: 300, y: 300 }
    );
    await page.mouse.click(250, 250);
    await assertEdgelessSelectedRect(page, [200, 200, 100, 100]);

    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'top',
      cursor: 'ns-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'right',
      cursor: 'ew-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'bottom',
      cursor: 'ns-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'left',
      cursor: 'ew-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'top-left',
      cursor: 'nwse-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'top-right',
      cursor: 'nesw-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'bottom-left',
      cursor: 'nesw-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'bottom-right',
      cursor: 'nwse-resize',
    });
  });

  test('editor is not aligned at the start of viewport', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await zoomResetByKeyboard(page);

    await page.addStyleTag({
      content: 'body { padding: 100px 150px; }',
    });

    await addBasicRectShapeElement(
      page,
      { x: 200, y: 200 },
      { x: 300, y: 300 }
    );
    await page.mouse.click(250, 250);
    await assertEdgelessSelectedRect(page, [200, 200, 100, 100]);

    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'top',
      cursor: 'ns-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'right',
      cursor: 'ew-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'bottom',
      cursor: 'ns-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'left',
      cursor: 'ew-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'top-left',
      cursor: 'nwse-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'top-right',
      cursor: 'nesw-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'bottom-left',
      cursor: 'nesw-resize',
    });
    await assertEdgelessSelectedReactCursor(page, {
      mode: 'resize',
      handle: 'bottom-right',
      cursor: 'nwse-resize',
    });
  });
});
