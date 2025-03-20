import { expect } from '@playwright/test';

import {
  addBasicConnectorElement,
  changeConnectorStrokeColor,
  changeConnectorStrokeStyle,
  changeConnectorStrokeWidth,
  createConnectorElement,
  createShapeElement,
  dragBetweenViewCoords,
  edgelessCommonSetup as commonSetup,
  pickColorAtPoints,
  rotateElementByHandle,
  Shape,
  toModelCoord,
  toViewCoord,
  triggerComponentToolbarAction,
} from '../../utils/actions/edgeless.js';
import { pressBackspace, waitNextFrame } from '../../utils/actions/index.js';
import {
  assertConnectorPath,
  assertEdgelessNonSelectedRect,
  assertEdgelessSelectedRect,
} from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test('path #1, the upper line is parallel with the lower line of antoher, and anchor from top to bottom of another', async ({
  page,
}) => {
  await commonSetup(page);

  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [200, -100], [300, 0], Shape.Square);
  await createConnectorElement(page, [50, 0], [250, 0]);

  await waitNextFrame(page);
  await assertConnectorPath(page, [
    [50, 0],
    [50, -20],
    [150, -20],
    [150, 20],
    [250, 20],
    [250, 0],
  ]);
});

test('path #2, the top-right point is overlapped with the bottom-left point of another, and anchor from top to bottom of another', async ({
  page,
}) => {
  await commonSetup(page);
  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [100, -100], [200, 0], Shape.Square);
  await createConnectorElement(page, [50, 0], [150, 0]);

  await assertConnectorPath(page, [
    [50, 0],
    [50, -120],
    [220, -120],
    [220, 20],
    [150, 20],
    [150, 0],
  ]);
});

test('path #3, the two shape are parallel in x axis, the anchor from the right to right', async ({
  page,
}) => {
  await commonSetup(page);

  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
  await createConnectorElement(page, [100, 50], [300, 50]);
  await assertConnectorPath(page, [
    [100, 50],
    [150, 50],
    [150, 120],
    [320, 120],
    [320, 50],
    [300, 50],
  ]);
});

test('when element is removed, connector should be deleted too', async ({
  page,
}) => {
  await commonSetup(page);
  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createConnectorElement(page, [100, 50], [200, 0]);

  //select
  await dragBetweenViewCoords(page, [10, -10], [20, 20]);
  await pressBackspace(page);
  await dragBetweenViewCoords(page, [100, 50], [0, 50]);
  await assertEdgelessNonSelectedRect(page);
});

test('connector connects triangle shape', async ({ page }) => {
  await commonSetup(page);
  await createShapeElement(page, [0, 0], [100, 100], Shape.Triangle);
  await createConnectorElement(page, [75, 50], [100, 50]);

  await assertConnectorPath(page, [
    [75, 50],
    [100, 50],
  ]);
});

test('connector connects diamond shape', async ({ page }) => {
  await commonSetup(page);
  await createShapeElement(page, [0, 0], [100, 100], Shape.Diamond);
  await createConnectorElement(page, [100, 50], [200, 50]);

  await assertConnectorPath(page, [
    [100, 50],
    [200, 50],
  ]);
});

test('connector connects rotated Square shape', async ({ page }) => {
  await commonSetup(page);
  await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
  await createConnectorElement(page, [50, 0], [50, -100]);
  await dragBetweenViewCoords(page, [-10, 50], [60, 60]);
  await rotateElementByHandle(page, 30, 'top-left');
  await assertConnectorPath(page, [
    [75, 6.7],
    [75, -46.65],
    [50, -46.65],
    [50, -100],
  ]);
  await rotateElementByHandle(page, 30, 'top-left');
  await assertConnectorPath(page, [
    [93.3, 25],
    [138.3, 25],
    [138.3, -38.3],
    [50, -38.3],
    [50, -100],
  ]);
});

test('change connector line width', async ({ page }) => {
  await commonSetup(page);

  const start = { x: 100, y: 200 };
  const end = { x: 300, y: 300 };
  await addBasicConnectorElement(page, start, end);

  await page.mouse.click(start.x + 5, start.y);
  await triggerComponentToolbarAction(page, 'changeConnectorStrokeStyles');
  await changeConnectorStrokeColor(page, 'MediumGrey');

  await triggerComponentToolbarAction(page, 'changeConnectorStrokeStyles');
  await changeConnectorStrokeWidth(page, 5);

  await waitNextFrame(page);

  await triggerComponentToolbarAction(page, 'changeConnectorStrokeStyles');

  const pickedColor = await pickColorAtPoints(page, [
    [start.x + 5, start.y],
    [start.x + 10, start.y],
  ]);
  expect(pickedColor[0]).toBe(pickedColor[1]);
});

test('change connector stroke style', async ({ page }) => {
  await commonSetup(page);

  const start = { x: 100, y: 200 };
  const end = { x: 300, y: 300 };
  await addBasicConnectorElement(page, start, end);

  await page.mouse.click(start.x + 5, start.y);
  await triggerComponentToolbarAction(page, 'changeConnectorStrokeStyles');
  await changeConnectorStrokeColor(page, 'MediumGrey');

  await triggerComponentToolbarAction(page, 'changeConnectorStrokeStyles');
  await changeConnectorStrokeStyle(page, 'dash');
  await waitNextFrame(page);

  await triggerComponentToolbarAction(page, 'changeConnectorStrokeStyles');

  const pickedColor = await pickColorAtPoints(page, [[start.x + 20, start.y]]);
  expect(pickedColor[0]).toBe('#000000');
});

test.describe('quick connect', () => {
  test('should create a connector when clicking on button', async ({
    page,
  }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    const [x, y] = await toViewCoord(page, [50, 50]);
    await page.mouse.click(x, y);

    const quickConnectBtn = page.getByRole('button', {
      name: 'Draw connector',
    });

    await expect(quickConnectBtn).toBeVisible();
    await quickConnectBtn.click();
    await expect(quickConnectBtn).toBeHidden();

    await assertConnectorPath(page, [
      [100, 50],
      [x, y],
    ]);
  });

  test('should be uncreated if the target is not found after clicking', async ({
    page,
  }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    const [x, y] = await toViewCoord(page, [50, 50]);
    await page.mouse.click(x, y);

    const quickConnectBtn = page.getByRole('button', {
      name: 'Draw connector',
    });

    const bounds = await quickConnectBtn.boundingBox();
    if (!bounds) {
      throw new Error('bounds is not found');
    }

    await quickConnectBtn.click();

    await page.mouse.click(bounds.x, bounds.y);
    await assertEdgelessSelectedRect(page, [x - 50, y - 50, 100, 100]);
  });

  test('should be uncreated if the target is not found after pressing ESC', async ({
    page,
  }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);

    // select shape
    const [x, y] = await toViewCoord(page, [50, 50]);
    await page.mouse.click(x, y);

    // click button
    await triggerComponentToolbarAction(page, 'quickConnect');

    await page.keyboard.press('Escape');

    await assertEdgelessNonSelectedRect(page);
  });

  test('should be connected if the target is found', async ({ page }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);

    // select shape
    const [x, y] = await toViewCoord(page, [50, 50]);
    await page.mouse.click(x, y);

    // click button
    await triggerComponentToolbarAction(page, 'quickConnect');

    // click target
    const [tx, ty] = await toViewCoord(page, [200, 50]);
    await page.mouse.click(tx, ty);

    await assertConnectorPath(page, [
      [100, 50],
      [200, 50],
    ]);
  });

  test('should follow the mouse to automatically select the starting point', async ({
    page,
  }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    const shapeBounds = await toViewCoord(page, [0, 0]);

    // select shape
    const [x, y] = await toViewCoord(page, [50, 50]);
    await page.mouse.click(x, y);

    // click button
    const quickConnectBtn = page.getByRole('button', {
      name: 'Draw connector',
    });
    const bounds = await quickConnectBtn.boundingBox();
    if (!bounds) {
      throw new Error('bounds is not found');
    }
    await quickConnectBtn.click();

    // at right
    let point: [number, number] = [bounds.x, bounds.y];
    let endpoint = await toModelCoord(page, point);
    await assertConnectorPath(page, [[100, 50], endpoint]);

    // at top
    point = [shapeBounds[0] + 50, shapeBounds[1] - 50];
    endpoint = await toModelCoord(page, point);
    await page.mouse.move(...point);
    await waitNextFrame(page);
    await assertConnectorPath(page, [[50, 0], endpoint]);

    // at left
    point = [shapeBounds[0] - 50, shapeBounds[1] + 50];
    endpoint = await toModelCoord(page, point);
    await page.mouse.move(...point);
    await assertConnectorPath(page, [[0, 50], endpoint]);

    // at bottom
    point = [shapeBounds[0] + 50, shapeBounds[1] + 100 + 50];
    endpoint = await toModelCoord(page, point);
    await page.mouse.move(...point);
    await assertConnectorPath(page, [[50, 100], endpoint]);
  });
});
