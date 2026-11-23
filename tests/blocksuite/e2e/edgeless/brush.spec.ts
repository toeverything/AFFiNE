import { expect } from '@playwright/test';
import { lightThemeV2 } from '@toeverything/theme/v2';

import {
  assertEdgelessTool,
  deleteAll,
  pickColorAtPoints,
  rotateElementByHandle,
  selectBrushColor,
  selectBrushSize,
  setEdgelessTool,
  switchEditorMode,
  updateExistedBrushElementSize,
  zoomResetByKeyboard,
} from '../utils/actions/edgeless.js';
import {
  addBasicBrushElement,
  click,
  dragBetweenCoords,
  enterPlaygroundRoom,
  initEmptyEdgelessState,
  resizeElementByHandle,
} from '../utils/actions/index.js';
import {
  assertEdgelessColorSameWithHexColor,
  assertEdgelessSelectedRect,
  assertSameColor,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test('change editor mode when brush color palette opening', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await setEdgelessTool(page, 'brush');

  const penMenu = page.locator('edgeless-pen-menu');
  const colorPalettes = penMenu.locator('edgeless-color-panel');
  await expect(colorPalettes).toBeVisible();

  await switchEditorMode(page);
  await expect(colorPalettes).toBeHidden();
});

test('add brush element', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const start = { x: 100, y: 100 };
  const end = { x: 200, y: 200 };
  await addBasicBrushElement(page, start, end, false);

  await assertEdgelessTool(page, 'brush');
});

test('resize brush element', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const start = { x: 100, y: 100 };
  const end = { x: 200, y: 200 };
  await addBasicBrushElement(page, start, end);

  await page.mouse.click(start.x + 5, start.y + 5);
  await assertEdgelessSelectedRect(page, [98, 98, 104, 104]);

  await page.mouse.click(start.x + 5, start.y + 5);
  const delta = { x: 20, y: 40 };
  await resizeElementByHandle(page, delta, 'top-left', 10);

  await page.mouse.click(start.x + 25, start.y + 45);
  await assertEdgelessSelectedRect(page, [118, 138, 84, 64]);
});

test('add brush element with color', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  await setEdgelessTool(page, 'brush');
  await selectBrushColor(page, 'Blue');

  const start = { x: 100, y: 100 };
  const end = { x: 200, y: 200 };
  await dragBetweenCoords(page, start, end, { steps: 100 });

  const [pickedColor] = await pickColorAtPoints(page, [[110, 110]]);
  const color = lightThemeV2['edgeless/palette/medium/blueMedium'];
  await assertEdgelessColorSameWithHexColor(page, color, pickedColor);
});

test('keep same color when mouse mode switched back to brush', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await deleteAll(page);

  await setEdgelessTool(page, 'brush');
  await selectBrushColor(page, 'Blue');

  const start = { x: 200, y: 200 };
  const end = { x: 300, y: 300 };
  await dragBetweenCoords(page, start, end, { steps: 100 });

  await setEdgelessTool(page, 'default');
  await click(page, { x: 50, y: 50 });

  await setEdgelessTool(page, 'brush');
  const origin = { x: 100, y: 100 };
  await dragBetweenCoords(page, origin, start, { steps: 100 });

  const [pickedColor] = await pickColorAtPoints(page, [[110, 110]]);
  const color = lightThemeV2['edgeless/palette/medium/blueMedium'];
  await assertEdgelessColorSameWithHexColor(page, color, pickedColor);
});

test('add brush element with different size', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  await setEdgelessTool(page, 'brush');
  await selectBrushSize(page, 'ten');
  await selectBrushColor(page, 'Blue');

  const start = { x: 100, y: 100 };
  const end = { x: 200, y: 100 };
  await dragBetweenCoords(page, start, end, { steps: 100 });

  const [topEdge, bottomEdge, nearTopEdge, nearBottomEdge] =
    await pickColorAtPoints(page, [
      // Select two points on the top and bottom border of the line,
      // their color should be the same as the specified color
      [110, 95],
      [110, 104],
      // Select two points close to the upper and lower boundaries of the line,
      // their color should be different from the specified color
      [110, 94],
      [110, 105],
    ]);

  const color = lightThemeV2['edgeless/palette/medium/blueMedium'];
  await assertEdgelessColorSameWithHexColor(page, color, topEdge);
  await assertEdgelessColorSameWithHexColor(page, color, bottomEdge);
  assertSameColor(nearTopEdge, '#84cfff');
  assertSameColor(nearBottomEdge, '#84cfff');
});

test('change brush element size by component-toolbar', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  const start = { x: 100, y: 100 };
  const end = { x: 200, y: 200 };
  await addBasicBrushElement(page, start, end);

  // wait for menu hide animation
  await page.waitForTimeout(500);

  // change to line width 12
  await page.mouse.click(110, 110);
  await updateExistedBrushElementSize(page, 6);
  await assertEdgelessSelectedRect(page, [94, 94, 112, 112]);

  // change to line width 10
  await page.mouse.click(110, 110);
  await updateExistedBrushElementSize(page, 5);
  await assertEdgelessSelectedRect(page, [95, 95, 110, 110]);

  // change to line width 8
  await page.mouse.click(110, 110);
  await updateExistedBrushElementSize(page, 4);
  await assertEdgelessSelectedRect(page, [96, 96, 108, 108]);

  // change to line width 6
  await page.mouse.click(110, 110);
  await updateExistedBrushElementSize(page, 3);
  await assertEdgelessSelectedRect(page, [97, 97, 106, 106]);

  // change to line width 4
  await page.mouse.click(110, 110);
  await updateExistedBrushElementSize(page, 2);
  await assertEdgelessSelectedRect(page, [98, 98, 104, 104]);

  // change to line width 2
  await page.mouse.click(110, 110);
  await updateExistedBrushElementSize(page, 1);
  await assertEdgelessSelectedRect(page, [99, 99, 102, 102]);
});

test('rotate brush element and then change size', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  const start = { x: 100, y: 100 };
  const end = { x: 200, y: 200 };
  await addBasicBrushElement(page, start, end);

  await page.mouse.click(110, 110);
  await rotateElementByHandle(page, 45, 'bottom-right');

  // change to line width 12
  await updateExistedBrushElementSize(page, 6);
  await assertEdgelessSelectedRect(page, [70.8, 70.8, 158.4, 158.4]);
});
