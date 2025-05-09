import { expect } from '@playwright/test';

import {
  createShapeElement,
  decreaseZoomLevel,
  deleteAll,
  edgelessCommonSetup,
  increaseZoomLevel,
  locatorEdgelessComponentToolButton,
  multiTouchDown,
  multiTouchMove,
  multiTouchUp,
  optionMouseDrag,
  Shape,
  shiftClickView,
  switchEditorMode,
  ZOOM_BAR_RESPONSIVE_SCREEN_WIDTH,
  zoomByMouseWheel,
  zoomResetByKeyboard,
} from '../utils/actions/edgeless.js';
import {
  addBasicBrushElement,
  addBasicRectShapeElement,
  captureHistory,
  clickView,
  enterPlaygroundRoom,
  focusRichText,
  initEmptyEdgelessState,
  redoByClick,
  switchReadonly,
  type,
  undoByClick,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertEdgelessNonSelectedRect,
  assertEdgelessSelectedModelRect,
  assertEdgelessSelectedRect,
  assertNoteXYWH,
  assertRichTextInlineRange,
  assertRichTexts,
  assertSelectedBound,
  assertZoomLevel,
} from '../utils/asserts.js';
import {
  DEFAULT_NOTE_HEIGHT,
  DEFAULT_NOTE_WIDTH,
} from '../utils/bs-alternative.js';
import { test } from '../utils/playwright.js';

const CENTER_X = 450;
const CENTER_Y = 450;

test('switch to edgeless mode', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await focusRichText(page);
  await type(page, 'hello');
  await assertRichTexts(page, ['hello']);
  await assertRichTextInlineRange(page, 0, 5, 0);

  await switchEditorMode(page);
  const locator = page.locator('affine-edgeless-root gfx-viewport');
  await expect(locator).toHaveCount(1);
  await assertRichTexts(page, ['hello']);
  await waitNextFrame(page);

  // FIXME: got very flaky result on cursor keeping
  // await assertNativeSelectionRangeCount(page, 1);
});

test('can zoom viewport', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  await assertNoteXYWH(page, [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT]);

  await page.mouse.click(CENTER_X, CENTER_Y);
  const original = [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT];
  await assertEdgelessSelectedModelRect(page, original);
  await assertZoomLevel(page, 100);

  await decreaseZoomLevel(page);
  await assertZoomLevel(page, 75);
  await decreaseZoomLevel(page);
  await assertZoomLevel(page, 50);

  const zoomed = [0, 0, original[2] * 0.5, original[3] * 0.5];
  await assertEdgelessSelectedModelRect(page, zoomed);

  await increaseZoomLevel(page);
  await assertZoomLevel(page, 75);
  await increaseZoomLevel(page);
  await assertZoomLevel(page, 100);
  await assertEdgelessSelectedModelRect(page, original);
});

test('zoom by mouse', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  await assertZoomLevel(page, 100);

  await assertNoteXYWH(page, [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT]);

  await page.mouse.click(CENTER_X, CENTER_Y);
  const original = [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT];
  await assertEdgelessSelectedModelRect(page, original);

  await zoomByMouseWheel(page, 0, 125);
  await assertZoomLevel(page, 90);

  const zoomed = [0, 0, original[2] * 0.9, original[3] * 0.9];
  await assertEdgelessSelectedModelRect(page, zoomed);
});

test('zoom by mouse without ctrl pressed when edgelessScrollZoom is enabled', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  await assertZoomLevel(page, 100);

  await assertNoteXYWH(page, [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT]);

  await page.mouse.click(CENTER_X, CENTER_Y);
  const original = [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT];
  await assertEdgelessSelectedModelRect(page, original);

  // enable edgelessScrollZoom
  await page.evaluate(() => {
    // @ts-expect-error set a setting
    window.editorSetting$.value = {
      // @ts-expect-error set a setting
      ...window.editorSetting$.value,
      edgelessScrollZoom: true,
    };
  });

  // can zoom without ctrl pressed
  await zoomByMouseWheel(page, 0, 125, false);
  await assertZoomLevel(page, 90);

  const zoomed = [0, 0, original[2] * 0.9, original[3] * 0.9];
  await assertEdgelessSelectedModelRect(page, zoomed);

  // disable edgelessScrollZoom
  await page.evaluate(() => {
    // @ts-expect-error set a setting
    window.editorSetting$.value = {
      // @ts-expect-error set a setting
      ...window.editorSetting$.value,
      edgelessScrollZoom: false,
    };
  });

  // can't zoom without ctrl pressed
  await zoomByMouseWheel(page, 0, 125, false);
  await assertZoomLevel(page, 90);
});

test('zoom by pinch', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  await assertZoomLevel(page, 100);

  await assertNoteXYWH(page, [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT]);

  await page.mouse.click(CENTER_X, CENTER_Y);
  const original = [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT];
  await assertEdgelessSelectedModelRect(page, original);

  const from = [
    { x: CENTER_X - 100, y: CENTER_Y },
    { x: CENTER_X + 100, y: CENTER_Y },
  ];
  const to = [
    { x: CENTER_X - 50, y: CENTER_Y - 35 },
    { x: CENTER_X + 50, y: CENTER_Y + 35 },
  ];
  await multiTouchDown(page, from);
  await multiTouchMove(page, from, to);
  await multiTouchUp(page, to);

  await assertZoomLevel(page, 50);
  const zoomed = [0, 0, 0.5 * DEFAULT_NOTE_WIDTH, 46];
  await assertEdgelessSelectedModelRect(page, zoomed);
});

test('zoom by pinch when edgeless is readonly', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  await assertZoomLevel(page, 100);

  await switchReadonly(page);

  const from = [
    { x: CENTER_X - 100, y: CENTER_Y },
    { x: CENTER_X + 100, y: CENTER_Y },
  ];
  const to = [
    { x: CENTER_X - 50, y: CENTER_Y - 35 },
    { x: CENTER_X + 50, y: CENTER_Y + 35 },
  ];
  await multiTouchDown(page, from);
  await multiTouchMove(page, from, to);
  await multiTouchUp(page, to);

  await switchReadonly(page, false);
  await waitNextFrame(page);
  await assertZoomLevel(page, 50);
});

test('move by pan', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  await assertZoomLevel(page, 100);

  await assertNoteXYWH(page, [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT]);

  await page.mouse.click(CENTER_X, CENTER_Y);
  const original = [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT];
  await assertEdgelessSelectedModelRect(page, original);

  const from = [
    { x: CENTER_X - 100, y: CENTER_Y },
    { x: CENTER_X + 100, y: CENTER_Y },
  ];
  const to = [
    { x: CENTER_X - 50, y: CENTER_Y + 50 },
    { x: CENTER_X + 150, y: CENTER_Y + 50 },
  ];

  await multiTouchDown(page, from);
  await multiTouchMove(page, from, to);
  await multiTouchUp(page, to);

  const moved = [0, 0, DEFAULT_NOTE_WIDTH, DEFAULT_NOTE_HEIGHT];
  await assertEdgelessSelectedModelRect(page, moved);
});

test('option/alt mouse drag duplicate a new element', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  await deleteAll(page);

  const start = [0, 0];
  const end = [100, 100];
  await createShapeElement(page, start, end, Shape.Square);
  await optionMouseDrag(page, [50, 50], [150, 50]);
  await assertSelectedBound(page, [100, 0, 100, 100]);

  await captureHistory(page);
  await undoByClick(page);
  await assertSelectedBound(page, [0, 0, 100, 100]);

  await redoByClick(page);
  await assertSelectedBound(page, [100, 0, 100, 100]);
});

test('should cancel select when the selected point is outside the current selected element', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  const firstStart = { x: 100, y: 100 };
  const firstEnd = { x: 200, y: 200 };
  await addBasicRectShapeElement(page, firstStart, firstEnd);

  const secondStart = { x: 300, y: 300 };
  const secondEnd = { x: 400, y: 400 };
  await addBasicRectShapeElement(page, secondStart, secondEnd);

  // select the first rect
  await page.mouse.click(110, 150);
  await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);

  // click outside the selected rect
  await page.mouse.click(200, 200);
  await assertEdgelessNonSelectedRect(page);
});

test('the tooltip of more button should be hidden when the action menu is shown', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const start = { x: 100, y: 100 };
  const end = { x: 200, y: 200 };
  await addBasicBrushElement(page, start, end);

  await page.mouse.click(start.x + 5, start.y + 5);
  await assertEdgelessSelectedRect(page, [98, 98, 104, 104]);

  const moreButton = locatorEdgelessComponentToolButton(page, 'more');
  await expect(moreButton).toBeVisible();

  const moreButtonBox = await moreButton.boundingBox();
  const tooltip = page.locator('.affine-tooltip');

  if (!moreButtonBox) {
    throw new Error('moreButtonBox is not found');
  }

  // need to wait for previous tooltip to be hidden
  await page.waitForTimeout(100);
  await page.mouse.move(moreButtonBox.x + 10, moreButtonBox.y + 10);
  await expect(tooltip).toBeVisible();

  await page.mouse.click(moreButtonBox.x + 10, moreButtonBox.y + 10);
  await expect(tooltip).toBeHidden();

  await page.mouse.click(moreButtonBox.x + 10, moreButtonBox.y + 10);
  await expect(tooltip).toBeVisible();
});

test('shift click multi select and de-select', async ({ page }) => {
  await edgelessCommonSetup(page);
  const start = [0, 0];
  const end = [100, 100];
  await createShapeElement(page, start, end, Shape.Square);
  start[0] = 100;
  end[0] = 200;
  await createShapeElement(page, start, end, Shape.Square);

  await clickView(page, [50, 0]);
  await assertEdgelessSelectedModelRect(page, [0, 0, 100, 100]);

  await shiftClickView(page, [150, 50]);
  await assertEdgelessSelectedModelRect(page, [0, 0, 200, 100]);

  // we will try to write text on a shape element when we dbclick it

  await waitNextFrame(page, 500);
  await shiftClickView(page, [150, 50]);
  await assertEdgelessSelectedModelRect(page, [0, 0, 100, 100]);
});

test('Before and after switching to Edgeless, the previous zoom ratio and position when Edgeless was opened should be remembered', async ({
  page,
}) => {
  test.info().annotations.push({
    type: 'issue',
    description: 'https://github.com/toeverything/blocksuite/issues/2479',
  });
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);
  await assertZoomLevel(page, 100);
  await increaseZoomLevel(page);
  await assertZoomLevel(page, 125);
  await switchEditorMode(page);
  await switchEditorMode(page);
  await assertZoomLevel(page, 125);
});

test('should close zoom bar when click blank area', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const screenWidth = page.viewportSize()?.width ?? 0;
  if (screenWidth > ZOOM_BAR_RESPONSIVE_SCREEN_WIDTH) {
    await page.setViewportSize({
      width: 1000,
      height: 1000,
    });
  }

  await zoomResetByKeyboard(page);
  await assertZoomLevel(page, 100);
  await increaseZoomLevel(page);
  await assertZoomLevel(page, 125);

  const verticalZoomBar = '.edgeless-zoom-toolbar-container.vertical';
  const zoomBar = page.locator(verticalZoomBar);
  await expect(zoomBar).toBeVisible();

  // Click Blank Area
  await page.mouse.click(10, 100);
  await expect(zoomBar).toBeHidden();
});
