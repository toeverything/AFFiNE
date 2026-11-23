import { expect, type Page } from '@playwright/test';

import {
  addBasicConnectorElement,
  createConnectorElement,
  createShapeElement,
  dragBetweenViewCoords,
  edgelessCommonSetup as commonSetup,
  getConnectorLabel,
  locatorComponentToolbar,
  setEdgelessTool,
  Shape,
  SHORT_KEY,
  toViewCoord,
  triggerComponentToolbarAction,
  type,
  waitNextFrame,
} from '../../utils/actions/index.js';
import {
  assertConnectorPath,
  assertEdgelessCanvasText,
  assertPointAlmostEqual,
} from '../../utils/asserts.js';
import { test } from '../../utils/playwright.js';

test.describe('connector label with straight shape', () => {
  async function getEditorCenter(page: Page) {
    const bounds = await page
      .locator('edgeless-connector-label-editor rich-text')
      .boundingBox();
    if (!bounds) {
      throw new Error('bounds is not found');
    }
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    return [cx, cy];
  }

  function calcOffsetDistance(s: number[], e: number[], p: number[]) {
    const p1 = Math.hypot(s[1] - p[1], s[0] - p[0]);
    const f1 = Math.hypot(s[1] - e[1], s[0] - e[0]);
    return p1 / f1;
  }

  test('should insert in the middle of the path when clicking on the button', async ({
    page,
  }) => {
    await commonSetup(page);
    const start = { x: 100, y: 200 };
    const end = { x: 300, y: 300 };
    await addBasicConnectorElement(page, start, end);
    await page.mouse.click(105, 200);

    await triggerComponentToolbarAction(page, 'addText');
    await type(page, ' a ');
    await assertEdgelessCanvasText(page, ' a ');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);
    await page.mouse.click(105, 200);

    const addTextBtn = locatorComponentToolbar(page).getByRole('button', {
      name: 'Add text',
    });
    await expect(addTextBtn).toBeHidden();

    await page.mouse.dblclick(200, 250);
    await assertEdgelessCanvasText(page, 'a');

    await page.keyboard.press('Backspace');
    await assertEdgelessCanvasText(page, '');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);
    await page.mouse.click(200, 250);

    await expect(addTextBtn).toBeVisible();
  });

  test('should insert at the place when double clicking on the path', async ({
    page,
  }) => {
    await commonSetup(page);
    await setEdgelessTool(page, 'connector');

    await page.mouse.move(0, 0);

    const menu = page.locator('edgeless-connector-menu');
    await expect(menu).toBeVisible();

    const straightBtn = menu.locator('edgeless-tool-icon-button', {
      hasText: 'Straight',
    });
    await expect(straightBtn).toBeVisible();
    await straightBtn.click();

    const start = { x: 250, y: 250 };
    const end = { x: 500, y: 250 };
    await addBasicConnectorElement(page, start, end);

    await page.mouse.dblclick(300, 250);
    await type(page, 'a');
    await assertEdgelessCanvasText(page, 'a');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.dblclick(300, 250);
    await waitNextFrame(page);

    await page.keyboard.press('ArrowRight');
    await type(page, 'b');
    await assertEdgelessCanvasText(page, 'ab');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.dblclick(300, 250);
    await waitNextFrame(page);

    await type(page, 'c');
    await assertEdgelessCanvasText(page, 'c');
    await waitNextFrame(page);

    const [cx, cy] = await getEditorCenter(page);
    assertPointAlmostEqual([cx, cy], [300, 250]);
    expect((cx - 250) / (500 - 250)).toBeCloseTo(50 / 250);
  });

  test('should move alone the path', async ({ page }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    await createConnectorElement(page, [100, 50], [200, 50]);

    await dragBetweenViewCoords(page, [140, 40], [160, 60]);
    await triggerComponentToolbarAction(page, 'changeConnectorShape');
    const straightBtn = locatorComponentToolbar(page).getByRole('button', {
      name: 'Straight',
    });
    await straightBtn.click();

    await assertConnectorPath(page, [
      [100, 50],
      [200, 50],
    ]);

    const [x, y] = await toViewCoord(page, [150, 50]);
    await page.mouse.dblclick(x, y);
    await type(page, 'label');
    await assertEdgelessCanvasText(page, 'label');
    await waitNextFrame(page);

    let [cx, cy] = await getEditorCenter(page);
    assertPointAlmostEqual([cx, cy], [x, y]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await dragBetweenViewCoords(page, [150, 50], [130, 30]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.dblclick(x - 20, y);
    await waitNextFrame(page);

    [cx, cy] = await getEditorCenter(page);
    assertPointAlmostEqual([cx, cy], [x - 20, y]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await dragBetweenViewCoords(page, [130, 50], [170, 70]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.dblclick(x + 20, y);
    await waitNextFrame(page);

    [cx, cy] = await getEditorCenter(page);
    assertPointAlmostEqual([cx, cy], [x + 20, y]);
  });

  test('should only move within constraints', async ({ page }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    await createConnectorElement(page, [100, 50], [200, 50]);

    await assertConnectorPath(page, [
      [100, 50],
      [200, 50],
    ]);

    const [x, y] = await toViewCoord(page, [150, 50]);
    await page.mouse.dblclick(x, y);
    await type(page, 'label');
    await assertEdgelessCanvasText(page, 'label');
    await waitNextFrame(page);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await dragBetweenViewCoords(page, [150, 50], [300, 110]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.dblclick(x + 55, y);
    await waitNextFrame(page);

    let [cx, cy] = await getEditorCenter(page);
    assertPointAlmostEqual([cx, cy], [x + 50, y]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await dragBetweenViewCoords(page, [200, 50], [0, 50]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.dblclick(x - 55, y);
    await waitNextFrame(page);

    [cx, cy] = await getEditorCenter(page);
    assertPointAlmostEqual([cx, cy], [x - 50, y]);
  });

  test('should automatically adjust position via offset distance', async ({
    page,
  }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    await createConnectorElement(page, [100, 50], [200, 50]);

    await dragBetweenViewCoords(page, [140, 40], [160, 60]);
    await triggerComponentToolbarAction(page, 'changeConnectorShape');
    const straightBtn = locatorComponentToolbar(page).getByRole('button', {
      name: 'Straight',
    });
    await straightBtn.click();

    const point = [170, 50];
    const offsetDistance = calcOffsetDistance([100, 50], [200, 50], point);
    let [x, y] = await toViewCoord(page, point);
    await page.mouse.dblclick(x, y);
    await type(page, 'label');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.dblclick(x, y);
    await waitNextFrame(page);

    let [cx, cy] = await getEditorCenter(page);
    assertPointAlmostEqual([cx, cy], [x, y]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.click(50, 50);
    await waitNextFrame(page);
    await dragBetweenViewCoords(page, [50, 50], [-50, 50]);
    await waitNextFrame(page);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.click(250, 50);
    await waitNextFrame(page);
    await dragBetweenViewCoords(page, [250, 50], [350, 50]);
    await waitNextFrame(page);

    const start = [0, 50];
    const end = [300, 50];
    const mx = start[0] + offsetDistance * (end[0] - start[0]);
    const my = start[1] + offsetDistance * (end[1] - start[1]);
    [x, y] = await toViewCoord(page, [mx, my]);

    await page.mouse.dblclick(x, y);
    await waitNextFrame(page);

    [cx, cy] = await getEditorCenter(page);
    assertPointAlmostEqual([cx, cy], [x, y]);
  });

  test('should enter the label editing state when pressing `Enter`', async ({
    page,
  }) => {
    await commonSetup(page);
    const start = { x: 100, y: 200 };
    const end = { x: 300, y: 300 };
    await addBasicConnectorElement(page, start, end);
    await page.mouse.click(105, 200);

    await page.keyboard.press('Enter');
    await type(page, ' a ');
    await assertEdgelessCanvasText(page, ' a ');
  });

  test('should exit the label editing state when pressing `Mod-Enter` or `Escape`', async ({
    page,
  }) => {
    await commonSetup(page);
    const start = { x: 100, y: 200 };
    const end = { x: 300, y: 300 };
    await addBasicConnectorElement(page, start, end);
    await page.mouse.click(105, 200);

    await page.keyboard.press('Enter');
    await waitNextFrame(page);
    await type(page, ' a ');
    await assertEdgelessCanvasText(page, ' a ');

    await page.keyboard.press(`${SHORT_KEY}+Enter`);

    await page.keyboard.press('Enter');
    await waitNextFrame(page);
    await type(page, 'b');
    await assertEdgelessCanvasText(page, 'b');

    await page.keyboard.press('Escape');

    await page.keyboard.press('Enter');
    await waitNextFrame(page);
    await type(page, 'c');
    await assertEdgelessCanvasText(page, 'c');
  });

  test('should enter the correct label', async ({ page }) => {
    await commonSetup(page);
    const connector1 = await addBasicConnectorElement(
      page,
      { x: 100, y: 200 },
      { x: 300, y: 300 }
    );
    const connector2 = await addBasicConnectorElement(
      page,
      { x: 300, y: 200 },
      { x: 100, y: 300 }
    );

    await page.mouse.dblclick(155, 207);
    await type(page, 'Connector 1');
    await page.keyboard.press('Escape');

    expect(await getConnectorLabel(page, connector1)).toBe('Connector 1');

    await page.mouse.dblclick(245, 207);
    await type(page, 'Connector 2');
    await page.keyboard.press('Escape');

    await expect(await getConnectorLabel(page, connector2)).toBe('Connector 2');
  });
});
