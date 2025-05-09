import {
  switchEditorMode,
  zoomResetByKeyboard,
} from '../utils/actions/edgeless.js';
import {
  addBasicBrushElement,
  addBasicRectShapeElement,
  dragBetweenCoords,
  enterPlaygroundRoom,
  initEmptyEdgelessState,
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
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await zoomResetByKeyboard(page);

    await addBasicBrushElement(page, { x: 100, y: 100 }, { x: 200, y: 200 });
    await page.mouse.click(110, 110);
    await assertEdgelessSelectedRect(page, [98, 98, 104, 104]);

    await addBasicRectShapeElement(
      page,
      { x: 210, y: 110 },
      { x: 310, y: 210 }
    );
    await page.mouse.click(220, 120);
    await assertEdgelessSelectedRect(page, [210, 110, 100, 100]);

    await dragBetweenCoords(page, { x: 120, y: 90 }, { x: 220, y: 130 });
    await assertEdgelessSelectedRect(page, [98, 98, 212, 112]);

    await resizeElementByHandle(page, { x: 50, y: 50 });
    await assertEdgelessSelectedRect(page, [148, 124.19, 162, 85.81]);

    await page.mouse.move(160, 160);
    await assertEdgelessSelectedRect(page, [148, 124.19, 162, 85.81]);

    await page.mouse.move(260, 160);
    await assertEdgelessSelectedRect(page, [148, 124.19, 162, 85.81]);
  });

  test('negative adjustment', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);
    await zoomResetByKeyboard(page);

    await addBasicBrushElement(page, { x: 100, y: 100 }, { x: 200, y: 200 });
    await page.mouse.click(110, 110);
    await assertEdgelessSelectedRect(page, [98, 98, 104, 104]);

    await addBasicRectShapeElement(
      page,
      { x: 210, y: 110 },
      { x: 310, y: 210 }
    );
    await page.mouse.click(220, 120);
    await assertEdgelessSelectedRect(page, [210, 110, 100, 100]);

    await dragBetweenCoords(page, { x: 120, y: 90 }, { x: 220, y: 130 });
    await assertEdgelessSelectedRect(page, [98, 98, 212, 112]);

    await resizeElementByHandle(page, { x: 400, y: 300 }, 'top-left', 30);
    await assertEdgelessSelectedRect(page, [310, 210, 356, 188]);

    await page.mouse.move(450, 300);
    await assertEdgelessSelectedRect(page, [310, 210, 356, 188]);

    await page.mouse.move(320, 220);
    await assertEdgelessSelectedRect(page, [310, 210, 356, 188]);
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
