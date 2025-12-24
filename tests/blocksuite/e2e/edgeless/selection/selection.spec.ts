import { expect } from '@playwright/test';

import * as actions from '../../utils/actions/edgeless.js';
import {
  getNoteBoundBoxInEdgeless,
  setEdgelessTool,
  switchEditorMode,
} from '../../utils/actions/edgeless.js';
import {
  addBasicBrushElement,
  addBasicRectShapeElement,
  click,
  clickInCenter,
  clickView,
  dragBetweenCoords,
  enterPlaygroundRoom,
  getBoundingRect,
  initEmptyEdgelessState,
  initThreeParagraphs,
  pressEnter,
  pressEscape,
  undoByKeyboard,
  waitNextFrame,
} from '../../utils/actions/index.js';
import {
  assertBlockCount,
  assertEdgelessRemoteSelectedModelRect,
  assertEdgelessRemoteSelectedRect,
  assertEdgelessSelectedModelRect,
  assertEdgelessSelectedRect,
  assertRectExist,
  assertSelectionInNote,
} from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test('should update rect of selection when resizing viewport', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await actions.switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);

  await addBasicRectShapeElement(page, { x: 100, y: 100 }, { x: 200, y: 200 });
  await dragBetweenCoords(page, { x: 120, y: 90 }, { x: 220, y: 130 });

  const selectedRectClass = '.affine-edgeless-selected-rect';

  await actions.zoomResetByKeyboard(page);

  await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);

  await actions.decreaseZoomLevel(page);
  await waitNextFrame(page);
  await actions.decreaseZoomLevel(page);
  await waitNextFrame(page);
  const selectedRectInZoom = await getBoundingRect(page, selectedRectClass);
  await assertEdgelessSelectedRect(page, [
    selectedRectInZoom.x,
    selectedRectInZoom.y,
    50,
    50,
  ]);

  await actions.switchEditorEmbedMode(page);
  await waitNextFrame(page);
  const selectedRectInEmbed = await getBoundingRect(page, selectedRectClass);
  await assertEdgelessSelectedRect(page, [
    selectedRectInEmbed.x,
    selectedRectInEmbed.y,
    50,
    50,
  ]);

  await actions.switchEditorEmbedMode(page);
  await actions.increaseZoomLevel(page);
  await waitNextFrame(page);
  await actions.increaseZoomLevel(page);
  await waitNextFrame(page);
  await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);
});

test('should update react of remote selection when resizing viewport', async ({
  context,
  page: pageA,
}) => {
  const room = await enterPlaygroundRoom(pageA);
  await initEmptyEdgelessState(pageA);
  await actions.switchEditorMode(pageA);
  await actions.zoomResetByKeyboard(pageA);

  const pageB = await context.newPage();
  await enterPlaygroundRoom(pageB, {
    room,
    noInit: true,
  });
  await actions.switchEditorMode(pageB);
  await actions.zoomResetByKeyboard(pageB);

  await actions.createShapeElement(
    pageA,
    [0, 0],
    [100, 100],
    actions.Shape.Square
  );
  const point = await actions.toViewCoord(pageA, [50, 50]);
  await click(pageA, { x: point[0], y: point[1] });
  await click(pageB, { x: point[0], y: point[1] });

  await assertEdgelessSelectedModelRect(pageB, [0, 0, 100, 100]);
  await assertEdgelessRemoteSelectedModelRect(pageB, [0, 0, 100, 100]);

  // to 50%
  await actions.decreaseZoomLevel(pageB);
  await waitNextFrame(pageB);
  await actions.decreaseZoomLevel(pageB);
  await waitNextFrame(pageB);

  const selectedRectInZoom = await getBoundingRect(
    pageB,
    '.affine-edgeless-selected-rect'
  );
  await assertEdgelessRemoteSelectedRect(pageB, [
    selectedRectInZoom.x,
    selectedRectInZoom.y,
    50,
    50,
  ]);
});

test('select multiple shapes and translate', async ({ page }) => {
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

  await dragBetweenCoords(page, { x: 120, y: 90 }, { x: 220, y: 130 });
  await assertEdgelessSelectedRect(page, [98, 98, 212, 112]);

  await dragBetweenCoords(page, { x: 120, y: 120 }, { x: 150, y: 150 });
  await assertEdgelessSelectedRect(page, [125, 128, 212, 112]);

  await page.mouse.click(160, 160);
  await assertEdgelessSelectedRect(page, [125, 128, 104, 104]);

  await page.mouse.click(250, 150);
  await assertEdgelessSelectedRect(page, [237, 140, 100, 100]);
});

test('selection box of shape element sync on fast dragging', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);

  await setEdgelessTool(page, 'shape');
  await dragBetweenCoords(page, { x: 100, y: 100 }, { x: 200, y: 200 });
  await setEdgelessTool(page, 'default');
  await dragBetweenCoords(
    page,
    { x: 110, y: 110 },
    { x: 660, y: 460 },
    { click: true }
  );

  await assertEdgelessSelectedRect(page, [650, 450, 100, 100]);
});

test('when the selection is always a note, it should remain in an active state', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  const ids = await initEmptyEdgelessState(page);
  await initThreeParagraphs(page);

  await switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);
  const bound = await getNoteBoundBoxInEdgeless(page, ids.noteId);

  await setEdgelessTool(page, 'note');
  const newNoteX = bound.x;
  const newNoteY = bound.y + bound.height + 100;
  // add text
  await page.mouse.click(newNoteX, newNoteY);
  await waitNextFrame(page);
  await page.keyboard.type('hello');
  await pressEnter(page);
  // should wait for inline editor update and resizeObserver callback
  await waitNextFrame(page);
  // assert add text success
  await assertBlockCount(page, 'edgeless-note', 2);

  await clickInCenter(page, bound);
  await clickInCenter(page, bound);
  await waitNextFrame(page);
  await assertSelectionInNote(page, ids.noteId, 'affine-edgeless-note');
});

test('should auto panning when selection rectangle reaches viewport edges', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);

  await addBasicRectShapeElement(page, { x: 200, y: 100 }, { x: 300, y: 200 });
  await page.mouse.click(210, 110);
  await assertEdgelessSelectedRect(page, [200, 100, 100, 100]);

  const selectedRectClass = '.affine-edgeless-selected-rect';

  // Panning to the left
  await setEdgelessTool(page, 'pan');
  await dragBetweenCoords(
    page,
    {
      x: 600,
      y: 200,
    },
    {
      x: 200,
      y: 200,
    }
  );
  await setEdgelessTool(page, 'default');
  await page.mouse.click(210, 110);
  let selectedRect = page.locator(selectedRectClass);
  await page.waitForTimeout(300);
  await expect(selectedRect).toBeHidden();
  // Click to start selection and hold the mouse to trigger auto panning to the left
  await page.mouse.move(210, 110);
  await page.mouse.down();
  await page.mouse.move(0, 210, { steps: 20 });
  await page.waitForTimeout(500);
  await page.mouse.up();

  // Expect to select the shape element
  selectedRect = page.locator(selectedRectClass);
  await page.waitForTimeout(300);
  await expect(selectedRect).toBeVisible();

  // Panning to the top
  await page.mouse.click(400, 600);
  await setEdgelessTool(page, 'pan');
  await dragBetweenCoords(
    page,
    {
      x: 400,
      y: 600,
    },
    {
      x: 400,
      y: 100,
    }
  );
  await setEdgelessTool(page, 'default');
  await page.mouse.click(600, 100);
  selectedRect = page.locator(selectedRectClass);
  await page.waitForTimeout(300);
  await expect(selectedRect).toBeHidden();
  // Click to start selection and hold the mouse to trigger auto panning to the top
  await page.mouse.move(600, 100);
  await page.mouse.down();
  await page.mouse.move(400, 0, { steps: 20 });
  await page.waitForTimeout(500);
  await page.mouse.up();

  // Expect to select the empty note
  selectedRect = page.locator(selectedRectClass);
  await page.waitForTimeout(300);
  await expect(selectedRect).toBeVisible();

  // Panning to the right
  await page.mouse.click(100, 600);
  await setEdgelessTool(page, 'pan');
  await dragBetweenCoords(
    page,
    {
      x: 20,
      y: 600,
    },
    {
      x: 1000,
      y: 600,
    }
  );
  await setEdgelessTool(page, 'default');
  await page.mouse.click(800, 600);
  selectedRect = page.locator(selectedRectClass);
  await page.waitForTimeout(100);
  await expect(selectedRect).toBeHidden();
  // Click to start selection and hold the mouse to trigger auto panning to the right
  await dragBetweenCoords(
    page,
    {
      x: 800,
      y: 600,
    },
    {
      x: 1000,
      y: 200,
    },
    {
      beforeMouseUp: async () => {
        await page.waitForTimeout(600);
      },
    }
  );

  // Expect to select the empty note
  selectedRect = page.locator(selectedRectClass);
  await page.waitForTimeout(300);
  await expect(selectedRect).toBeVisible();

  // Panning to the bottom
  await page.mouse.click(400, 100);
  await setEdgelessTool(page, 'pan');
  await dragBetweenCoords(
    page,
    {
      x: 400,
      y: 100,
    },
    {
      x: 400,
      y: 850,
    },
    {
      click: true,
    }
  );
  await setEdgelessTool(page, 'default');
  await waitNextFrame(page, 500);
  await page.mouse.click(400, 400);
  selectedRect = page.locator(selectedRectClass);
  await page.waitForTimeout(100);
  await expect(selectedRect).toBeHidden();

  // Click to start selection and hold the mouse to trigger auto panning to the right
  await dragBetweenCoords(
    page,
    {
      x: 800,
      y: 300,
    },
    {
      x: 820,
      y: 1150,
    },
    {
      click: true,
      beforeMouseUp: async () => {
        await page.waitForTimeout(500);
      },
    }
  );

  // Expect to select the empty note
  selectedRect = page.locator(selectedRectClass);
  await page.waitForTimeout(300);
  await expect(selectedRect).toBeVisible();
});

test('should also update dragging area when viewport changes', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);

  // Panning to the top
  await page.mouse.click(400, 600);
  await setEdgelessTool(page, 'pan');
  await dragBetweenCoords(
    page,
    {
      x: 400,
      y: 600,
    },
    {
      x: 400,
      y: 100,
    }
  );
  await setEdgelessTool(page, 'default');
  await page.mouse.click(200, 300);

  const selectedRectClass = '.affine-edgeless-selected-rect';
  let selectedRect = page.locator(selectedRectClass);
  await expect(selectedRect).toBeHidden();
  // set up initial dragging area
  await page.mouse.move(200, 300);
  await page.mouse.down();
  await page.mouse.move(600, 200, { steps: 20 });
  await page.waitForTimeout(300);

  // wheel the viewport to the top
  await page.mouse.wheel(0, -300);
  await page.waitForTimeout(300);
  await page.mouse.up();

  // Expect to select the empty note
  selectedRect = page.locator(selectedRectClass);
  await page.waitForTimeout(300);
  await expect(selectedRect).toBeVisible();
  await page.waitForTimeout(300);
});

test('should select shapes while moving selection', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await actions.zoomResetByKeyboard(page);

  await addBasicRectShapeElement(page, { x: 100, y: 100 }, { x: 200, y: 200 });

  // Make the selection out side the rect and move the selection to the rect
  await dragBetweenCoords(
    page,
    // Make the selection not selecting the rect
    { x: 70, y: 70 },
    { x: 90, y: 90 },
    {
      beforeMouseUp: async () => {
        await page.keyboard.down('Space');
        // Move the selection over to the rect
        await page.mouse.move(120, 120);
        await page.keyboard.up('Space');
      },
    }
  );

  await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);

  await addBasicBrushElement(page, { x: 210, y: 100 }, { x: 310, y: 300 });
  await page.mouse.click(211, 101);

  // Make a wide selection and move it to select both of the shapes
  await dragBetweenCoords(
    page,
    // Make the selection above the spaces
    { x: 70, y: 70 },
    { x: 400, y: 90 },
    {
      beforeMouseUp: async () => {
        await page.keyboard.down('Space');
        // Move the selection over both of the shapes
        await page.mouse.move(400, 120);
        await page.keyboard.up('Space');
      },
    }
  );

  await assertEdgelessSelectedRect(page, [100, 98, 212, 204]);
});

test('should the selected rect be below the edgeless element toolbar', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const toolbar = page.locator('.edgeless-toolbar-container');
  const toolbarRect = await toolbar.boundingBox();
  assertRectExist(toolbarRect);

  await actions.addNote(page, 'hello', toolbarRect.x, toolbarRect.y - 20);
  await pressEscape(page, 3);

  await page.mouse.click(toolbarRect.x, toolbarRect.y - 20);

  const selectedRect = page.locator('.affine-edgeless-selected-rect');
  await expect(selectedRect).toBeVisible();

  const brHandle = selectedRect.getByLabel('bottom-right');
  const brHandleRect = await brHandle.boundingBox();
  assertRectExist(brHandleRect);

  // make sure the position of br handle is inside the toolbar
  expect(
    brHandleRect.x > toolbarRect.x &&
      brHandleRect.x < toolbarRect.x + toolbarRect.width &&
      brHandleRect.y > toolbarRect.y &&
      brHandleRect.y < toolbarRect.y + toolbarRect.height
  ).toBe(true);

  const brHandleCenter = [
    brHandleRect.x + brHandleRect.width / 2,
    brHandleRect.y + brHandleRect.height / 2,
  ];

  // get element from the center of br handle
  const topElement = await page.evaluate(brHandleCenter => {
    const element = document.elementFromPoint(
      brHandleCenter[0],
      brHandleCenter[1]
    );
    if (!element) {
      throw new Error('element not found');
    }
    return element.tagName;
  }, brHandleCenter);

  expect(topElement).toBe('EDGELESS-TOOLBAR-WIDGET');
});

test('should the block selectable after undo drag a block from canvas to note', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  await actions.createNote(page, [0, 200], 'hello\nworld');
  await pressEscape(page, 3);
  await clickView(page, [0, 200]);
  const toolbar = actions.locatorComponentToolbar(page);
  await toolbar.getByLabel('More menu').click();
  await toolbar.getByTestId('turn-into-linked-doc').click();

  await page.dragAndDrop(
    '.affine-drag-handle-grabber.dots',
    'affine-edgeless-note[data-block-id="2"]'
  );
  await waitNextFrame(page);
  await undoByKeyboard(page);
  await page.locator('affine-embed-edgeless-synced-doc-block').click();
  expect(await actions.getSelectedBoundCount(page)).toBe(1);
});
