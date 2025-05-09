import { expect } from '@playwright/test';

import {
  addBasicBrushElement,
  createConnectorElement,
  createFrameElement,
  createNote,
  createShapeElement,
  setEdgelessTool,
  Shape,
  toViewCoord,
  triggerComponentToolbarAction,
} from '../utils/actions/edgeless.js';
import {
  clickView,
  edgelessCommonSetup as commonSetup,
  selectAllByKeyboard,
  type,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertEdgelessSelectedModelRect,
  getSelectedRect,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test.describe('auto arrange align', () => {
  test('arrange shapes', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Diamond);
    await createShapeElement(page, [100, -100], [300, 100], Shape.Ellipse);
    await createShapeElement(page, [200, 300], [300, 400], Shape.Square);
    await createShapeElement(page, [400, 100], [500, 200], Shape.Triangle);
    await createShapeElement(
      page,
      [0, 200],
      [100, 300],
      Shape['Rounded rectangle']
    );

    await page.mouse.click(0, 0);
    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, -100, 500, 500]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 560, 320]);
  });

  test('arrange rotated shapes', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Ellipse);
    await createShapeElement(page, [100, 100], [200, 200], Shape.Square);

    const point = await toViewCoord(page, [100, 100]);
    await page.mouse.click(point[0] + 50, point[1] + 50);
    await page.mouse.move(point[0] - 5, point[1] - 5);
    await page.mouse.down();
    await page.mouse.move(point[0] - 5, point[1] + 45);
    await page.mouse.up();

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 220, 220]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 261, 141]);
  });

  test('arrange connected shapes', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [100, 100], [200, 200], Shape.Ellipse);
    await createConnectorElement(page, [50, 100], [150, 100]);

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 200, 200]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, -21, 220, 141.4]);
  });

  test('arrange connector', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createConnectorElement(page, [200, 200], [300, 200]);

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 300, 200]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 220, 100]);
  });

  test('arrange edgeless text', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);

    const point = await toViewCoord(page, [200, -100]);
    await setEdgelessTool(page, 'default');
    await page.mouse.dblclick(point[0], point[1], {
      delay: 100,
    });
    await waitNextFrame(page);
    await type(page, 'a');
    await page.mouse.click(0, 0);

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, -125, 395, 225]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 340, 100]);
  });

  test('arrange note', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createNote(page, [200, 200], 'Hello World');
    await page.mouse.click(0, 0);

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 668, 252]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 618, 100]);
  });

  test('arrange group', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [200, 300], [300, 400], Shape.Square);
    await createShapeElement(page, [400, 100], [500, 200], Shape.Triangle);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');

    await createShapeElement(page, [0, 0], [100, 100], Shape.Diamond);
    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 500, 400]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 420, 300]);
  });

  test('arrange frame', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [200, 300], [300, 400], Shape.Square);
    await createShapeElement(page, [400, 100], [500, 200], Shape.Triangle);
    await selectAllByKeyboard(page);
    await createFrameElement(page, [150, 50], [550, 450]);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Diamond);

    await page.mouse.click(0, 0);
    await page.mouse.move(75, 395);
    await page.mouse.down();
    await page.mouse.move(900, 900);
    await page.mouse.up();
    await assertEdgelessSelectedModelRect(page, [0, 0, 550, 450]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 520, 400]);
  });

  // TODO mindmap size different on CI
  test('arrange mindmap', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Diamond);
    await page.keyboard.press('m');
    await clickView(page, [500, 200]);

    await selectAllByKeyboard(page);
    const box1 = await getSelectedRect(page);
    expect(box1.width).toBeGreaterThan(700);
    expect(box1.height).toBeGreaterThan(300);

    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    const box2 = await getSelectedRect(page);
    expect(box2.width).toBeLessThan(550);
    expect(box2.height).toBeLessThan(210);
  });

  test('arrange shape, note, connector, brush and edgeless text', async ({
    page,
  }) => {
    await commonSetup(page);
    // shape
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [150, 150], [300, 300], Shape.Ellipse);
    //note
    await createNote(page, [200, 100], 'Hello World');
    // connector
    await createConnectorElement(page, [200, -200], [400, -100]);
    // brush
    const start = { x: 400, y: 400 };
    const end = { x: 480, y: 480 };
    await addBasicBrushElement(page, start, end);
    // edgeless text
    const point = await toViewCoord(page, [-100, -100]);
    await setEdgelessTool(page, 'default');
    await page.mouse.dblclick(point[0], point[1], {
      delay: 100,
    });
    await waitNextFrame(page);
    await type(page, 'edgeless text');

    await page.mouse.click(0, 0);
    await selectAllByKeyboard(page);

    await assertEdgelessSelectedModelRect(page, [-125, -200, 793, 500]);
    // arrange
    await triggerComponentToolbarAction(page, 'autoArrange');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [-125, -125, 668, 270]);
  });
});

test.describe('auto resize align', () => {
  test('resize and arrange shapes', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Diamond);
    await createShapeElement(page, [100, -100], [300, 100], Shape.Ellipse);
    await createShapeElement(page, [200, 300], [300, 400], Shape.Square);
    await createShapeElement(page, [400, 100], [500, 200], Shape.Triangle);
    await createShapeElement(
      page,
      [0, 200],
      [100, 300],
      Shape['Rounded rectangle']
    );

    await page.mouse.click(0, 0);
    await selectAllByKeyboard(page);

    await assertEdgelessSelectedModelRect(page, [0, -100, 500, 500]);
    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 860, 420]);
  });

  test('resize and arrange rotated shapes', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Ellipse);
    await createShapeElement(page, [100, 100], [200, 200], Shape.Square);

    const point = await toViewCoord(page, [100, 100]);
    await page.mouse.click(point[0] + 50, point[1] + 50);
    await page.mouse.move(point[0] - 5, point[1] - 5);
    await page.mouse.down();
    await page.mouse.move(point[0] - 5, point[1] + 45);
    await page.mouse.up();

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 220, 220]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 420, 200]);
  });

  test('resize and arrange connected shapes', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [100, 100], [200, 200], Shape.Ellipse);
    await createConnectorElement(page, [50, 100], [150, 100]);

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 200, 200]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, -16, 420, 232]);
  });

  test('resize and arrange connector', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createConnectorElement(page, [200, 200], [300, 200]);

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 300, 200]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 320, 200]);
  });

  test('resize and arrange edgeless text', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);

    const point = await toViewCoord(page, [200, -100]);
    await setEdgelessTool(page, 'default');
    await page.mouse.dblclick(point[0], point[1], {
      delay: 100,
    });
    await waitNextFrame(page);
    await type(page, 'a');
    await page.mouse.click(0, 0);

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, -125, 395, 225]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 1912.296875, 200]);
  });

  test('resize and arrange note', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createNote(page, [200, 200], 'Hello World');
    await page.mouse.click(0, 0);

    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 668, 252]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 1302.5, 200]);
  });

  test('resize and arrange group', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [200, 300], [300, 400], Shape.Square);
    await createShapeElement(page, [400, 100], [500, 200], Shape.Triangle);
    await selectAllByKeyboard(page);
    await triggerComponentToolbarAction(page, 'addGroup');

    await createShapeElement(page, [0, 0], [100, 100], Shape.Diamond);
    await selectAllByKeyboard(page);
    await assertEdgelessSelectedModelRect(page, [0, 0, 500, 400]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 420, 200]);
  });

  test('resize and arrange frame', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [200, 300], [300, 400], Shape.Square);
    await createShapeElement(page, [400, 100], [500, 200], Shape.Triangle);
    await selectAllByKeyboard(page);
    await createFrameElement(page, [150, 50], [550, 450]);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Diamond);

    await page.mouse.click(0, 0);
    await page.mouse.move(75, 395);
    await page.mouse.down();
    await page.mouse.move(900, 900);
    await page.mouse.up();
    await assertEdgelessSelectedModelRect(page, [0, 0, 550, 450]);

    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 420, 200]);
  });

  // TODO mindmap size different on CI
  test('resize and arrange mindmap', async ({ page }) => {
    await commonSetup(page);
    await createShapeElement(page, [0, 0], [100, 100], Shape.Diamond);
    await page.keyboard.press('m');
    await clickView(page, [500, 200]);

    await selectAllByKeyboard(page);
    const box1 = await getSelectedRect(page);
    expect(box1.width).toBeGreaterThan(700);
    expect(box1.height).toBeGreaterThan(300);

    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    const box2 = await getSelectedRect(page);
    expect(box2.width).toBeLessThan(650);
    expect(box2.height).toBeLessThan(210);
  });

  test('resize and arrange shape, note, connector, brush and text', async ({
    page,
  }) => {
    await commonSetup(page);
    // shape
    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [150, 150], [300, 300], Shape.Ellipse);
    //note
    await createNote(page, [200, 100], 'Hello World');
    // connector
    await createConnectorElement(page, [200, -200], [400, -100]);
    // brush
    const start = { x: 400, y: 400 };
    const end = { x: 480, y: 480 };
    await addBasicBrushElement(page, start, end);
    // edgeless text
    const point = await toViewCoord(page, [-100, -100]);
    await setEdgelessTool(page, 'default');
    await page.mouse.dblclick(point[0], point[1], {
      delay: 100,
    });
    await waitNextFrame(page);
    await type(page, 'edgeless text');

    await page.mouse.click(0, 0);
    await selectAllByKeyboard(page);

    await assertEdgelessSelectedModelRect(page, [-125, -200, 793, 500]);
    // arrange
    await triggerComponentToolbarAction(page, 'autoResize');
    await waitNextFrame(page, 200);
    await assertEdgelessSelectedModelRect(page, [0, 0, 2352.296875, 420]);
  });
});
