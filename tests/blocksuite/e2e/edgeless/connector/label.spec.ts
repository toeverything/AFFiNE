import { expect, type Page } from '@playwright/test';

import {
  addBasicConnectorElement,
  createConnectorElement,
  createShapeElement,
  dragBetweenViewCoords,
  edgelessCommonSetup as commonSetup,
  getConnectorLabel,
  getConnectorPath,
  locatorComponentToolbar,
  selectElementsByService,
  setEdgelessTool,
  Shape,
  SHORT_KEY,
  toViewCoord,
  triggerComponentToolbarAction,
  type,
  waitNextFrame,
} from '../../utils/actions/index.js';
import { test } from '../../utils/playwright.js';

test.describe('connector label with straight shape', () => {
  const labelEditorSelector = 'edgeless-connector-label-editor rich-text';

  async function waitForLabelEditor(page: Page) {
    const editor = page.locator(labelEditorSelector);
    await expect(editor).toBeVisible();
    return editor;
  }

  async function getEditorCenter(page: Page) {
    const bounds = await (await waitForLabelEditor(page)).boundingBox();
    if (!bounds) {
      throw new Error('bounds is not found');
    }
    const cx = bounds.x + bounds.width / 2;
    const cy = bounds.y + bounds.height / 2;
    return [cx, cy];
  }

  function expectPointNear(
    actual: number[],
    expected: number[],
    tolerance = 2
  ) {
    expect(Math.abs(actual[0] - expected[0])).toBeLessThanOrEqual(tolerance);
    expect(Math.abs(actual[1] - expected[1])).toBeLessThanOrEqual(tolerance);
  }

  async function getConnectorMidpoint(page: Page, index = 0) {
    const path = await getConnectorPath(page, index);
    const start = path[0];
    const end = path[path.length - 1];
    return [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
  }

  async function getConnectorLabelCenter(
    page: Page,
    connectorId: string
  ): Promise<number[] | null> {
    return page.evaluate(id => {
      const container = document.querySelector('affine-edgeless-root');
      if (!container) throw new Error('container not found');
      const connector = container.service.crud.getElementById(id);
      if (!connector) throw new Error(`connector not found: ${id}`);
      const label = connector.labelXYWH;
      if (!label) return null;
      return [label[0] + label[2] / 2, label[1] + label[3] / 2];
    }, connectorId);
  }

  async function getConnectorLabelCenterView(page: Page, connectorId: string) {
    const center = await getConnectorLabelCenter(page, connectorId);
    if (!center) {
      throw new Error(`label center not found: ${connectorId}`);
    }
    return toViewCoord(page, center);
  }

  test('should insert in the middle of the path when clicking on the button', async ({
    page,
  }) => {
    await commonSetup(page);
    const start = { x: 100, y: 200 };
    const end = { x: 300, y: 300 };
    const connectorId = await addBasicConnectorElement(page, start, end);
    await selectElementsByService(page, [connectorId]);

    await triggerComponentToolbarAction(page, 'addText');
    await type(page, ' a ');
    await page.keyboard.press('Escape');
    expect((await getConnectorLabel(page, connectorId)).trim()).toBe('a');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);
    await selectElementsByService(page, [connectorId]);

    const addTextBtn = locatorComponentToolbar(page).getByRole('button', {
      name: 'Add text',
    });
    await expect(addTextBtn).toBeHidden();

    await selectElementsByService(page, [connectorId]);
    await page.keyboard.press('Enter');
    await waitForLabelEditor(page);
    await page.keyboard.press('Backspace');
    await page.keyboard.press('Escape');
    expect(await getConnectorLabel(page, connectorId)).toBe('');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);
    await selectElementsByService(page, [connectorId]);

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
    const connectorId = await addBasicConnectorElement(page, start, end);

    const [midX, midY] = await toViewCoord(
      page,
      await getConnectorMidpoint(page)
    );
    await page.mouse.dblclick(midX, midY);
    await waitForLabelEditor(page);
    await type(page, 'a');
    await page.keyboard.press('Escape');
    expect(await getConnectorLabel(page, connectorId)).toBe('a');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.dblclick(midX, midY);
    await waitForLabelEditor(page);
    await page.keyboard.press('ArrowRight');
    await type(page, 'b');
    await page.keyboard.press('Escape');
    expect(await getConnectorLabel(page, connectorId)).toBe('ab');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await page.mouse.dblclick(midX, midY);
    await waitForLabelEditor(page);
    await type(page, 'c');
    const [cx, cy] = await getEditorCenter(page);
    expectPointNear([cx, cy], [midX, midY]);
    await page.keyboard.press('Escape');
    expect(await getConnectorLabel(page, connectorId)).toBe('c');
  });

  test('should move alone the path', async ({ page }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    const connectorId = await createConnectorElement(
      page,
      [100, 50],
      [200, 50]
    );

    await dragBetweenViewCoords(page, [140, 40], [160, 60]);
    await selectElementsByService(page, [connectorId]);
    await triggerComponentToolbarAction(page, 'changeConnectorShape');
    const straightBtn = locatorComponentToolbar(page).getByRole('button', {
      name: 'Straight',
    });
    await straightBtn.click();
    await waitNextFrame(page);

    await selectElementsByService(page, [connectorId]);
    await triggerComponentToolbarAction(page, 'addText');
    await waitForLabelEditor(page);
    await type(page, 'label');
    await page.keyboard.press('Escape');
    expect(await getConnectorLabel(page, connectorId)).toBe('label');

    const initialCenter = await getConnectorLabelCenter(page, connectorId);
    expect(initialCenter).not.toBeNull();

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    const [dragX, dragY] = await toViewCoord(
      page,
      await getConnectorMidpoint(page)
    );
    await dragBetweenViewCoords(page, [dragX, dragY], [dragX - 20, dragY - 20]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    const centerAfterFirstDrag = await getConnectorLabelCenter(
      page,
      connectorId
    );
    expect(centerAfterFirstDrag).not.toBeNull();
    if (centerAfterFirstDrag) {
      const path = await getConnectorPath(page);
      const start = path[0];
      const end = path[path.length - 1];
      const minX = Math.min(start[0], end[0]);
      const maxX = Math.max(start[0], end[0]);
      const minY = Math.min(start[1], end[1]);
      const maxY = Math.max(start[1], end[1]);
      expect(centerAfterFirstDrag[0]).toBeGreaterThanOrEqual(minX - 2);
      expect(centerAfterFirstDrag[0]).toBeLessThanOrEqual(maxX + 2);
      expect(centerAfterFirstDrag[1]).toBeGreaterThanOrEqual(minY - 2);
      expect(centerAfterFirstDrag[1]).toBeLessThanOrEqual(maxY + 2);
    }

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    const [dragX2, dragY2] = await toViewCoord(
      page,
      await getConnectorMidpoint(page)
    );
    await dragBetweenViewCoords(
      page,
      [dragX2, dragY2],
      [dragX2 + 20, dragY2 + 20]
    );

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    const centerAfterSecondDrag = await getConnectorLabelCenter(
      page,
      connectorId
    );
    expect(centerAfterSecondDrag).not.toBeNull();
    if (centerAfterSecondDrag) {
      const path = await getConnectorPath(page);
      const start = path[0];
      const end = path[path.length - 1];
      const minX = Math.min(start[0], end[0]);
      const maxX = Math.max(start[0], end[0]);
      const minY = Math.min(start[1], end[1]);
      const maxY = Math.max(start[1], end[1]);
      expect(centerAfterSecondDrag[0]).toBeGreaterThanOrEqual(minX - 2);
      expect(centerAfterSecondDrag[0]).toBeLessThanOrEqual(maxX + 2);
      expect(centerAfterSecondDrag[1]).toBeGreaterThanOrEqual(minY - 2);
      expect(centerAfterSecondDrag[1]).toBeLessThanOrEqual(maxY + 2);
    }
  });

  test('should only move within constraints', async ({ page }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    const connectorId = await createConnectorElement(
      page,
      [100, 50],
      [200, 50]
    );
    await selectElementsByService(page, [connectorId]);

    await triggerComponentToolbarAction(page, 'changeConnectorShape');
    const straightBtn = locatorComponentToolbar(page).getByRole('button', {
      name: 'Straight',
    });
    await straightBtn.click();
    await waitNextFrame(page);

    let [x, y] = await toViewCoord(page, await getConnectorMidpoint(page));
    await selectElementsByService(page, [connectorId]);
    await triggerComponentToolbarAction(page, 'addText');
    await waitForLabelEditor(page);
    await type(page, 'label');
    await page.keyboard.press('Escape');
    expect(await getConnectorLabel(page, connectorId)).toBe('label');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    await dragBetweenViewCoords(page, [x, y], [x + 150, y + 60]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    let path = await getConnectorPath(page);
    const start = path[0];
    const end = path[path.length - 1];
    const maxX = Math.max(start[0], end[0]);
    const minX = Math.min(start[0], end[0]);
    const labelCenter = await getConnectorLabelCenter(page, connectorId);
    expect(labelCenter).not.toBeNull();
    if (labelCenter) {
      const centerX = labelCenter[0];
      expect(centerX).toBeLessThanOrEqual(maxX + 2);
      expect(centerX).toBeGreaterThanOrEqual(minX - 2);
    }

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    [x, y] = await toViewCoord(page, await getConnectorMidpoint(page));
    await dragBetweenViewCoords(page, [x, y], [x - 150, y]);

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    path = await getConnectorPath(page);
    const start2 = path[0];
    const end2 = path[path.length - 1];
    const maxX2 = Math.max(start2[0], end2[0]);
    const minX2 = Math.min(start2[0], end2[0]);
    const labelCenter2 = await getConnectorLabelCenter(page, connectorId);
    expect(labelCenter2).not.toBeNull();
    if (labelCenter2) {
      const centerX = labelCenter2[0];
      expect(centerX).toBeLessThanOrEqual(maxX2 + 2);
      expect(centerX).toBeGreaterThanOrEqual(minX2 - 2);
    }
  });

  test('should automatically adjust position via offset distance', async ({
    page,
  }) => {
    await commonSetup(page);

    await createShapeElement(page, [0, 0], [100, 100], Shape.Square);
    await createShapeElement(page, [200, 0], [300, 100], Shape.Square);
    const connectorId = await createConnectorElement(
      page,
      [100, 50],
      [200, 50]
    );

    await dragBetweenViewCoords(page, [140, 40], [160, 60]);
    await selectElementsByService(page, [connectorId]);
    await triggerComponentToolbarAction(page, 'changeConnectorShape');
    const straightBtn = locatorComponentToolbar(page).getByRole('button', {
      name: 'Straight',
    });
    await straightBtn.click();
    await waitNextFrame(page);

    let path = await getConnectorPath(page);
    let start = path[0];
    let end = path[path.length - 1];
    const offsetDistance = 0.7;
    let point = [
      start[0] + offsetDistance * (end[0] - start[0]),
      start[1] + offsetDistance * (end[1] - start[1]),
    ];
    let [x, y] = await toViewCoord(page, point);
    await page.mouse.dblclick(x, y);
    await waitForLabelEditor(page);
    await type(page, 'label');
    await page.keyboard.press('Escape');
    expect(await getConnectorLabel(page, connectorId)).toBe('label');

    await page.mouse.click(0, 0);
    await waitNextFrame(page);

    const [startX, startY] = await toViewCoord(page, start);
    const [endX, endY] = await toViewCoord(page, end);
    await dragBetweenViewCoords(page, [startX, startY], [startX - 50, startY]);
    await dragBetweenViewCoords(page, [endX, endY], [endX + 50, endY]);
    await waitNextFrame(page);

    path = await getConnectorPath(page);
    start = path[0];
    end = path[path.length - 1];
    point = [
      start[0] + offsetDistance * (end[0] - start[0]),
      start[1] + offsetDistance * (end[1] - start[1]),
    ];
    [x, y] = await toViewCoord(page, point);

    const labelCenter = await getConnectorLabelCenter(page, connectorId);
    expect(labelCenter).not.toBeNull();
    if (labelCenter) {
      const [cx, cy] = await toViewCoord(page, labelCenter);
      expectPointNear([cx, cy], [x, y], 30);
    }
  });

  test('should enter the label editing state when pressing `Enter`', async ({
    page,
  }) => {
    await commonSetup(page);
    const start = { x: 100, y: 200 };
    const end = { x: 300, y: 300 };
    const connectorId = await addBasicConnectorElement(page, start, end);
    await selectElementsByService(page, [connectorId]);
    await page.keyboard.press('Enter');
    await waitForLabelEditor(page);
    await type(page, ' a ');
    await page.keyboard.press('Escape');
    expect((await getConnectorLabel(page, connectorId)).trim()).toBe('a');
  });

  test('should exit the label editing state when pressing `Mod-Enter` or `Escape`', async ({
    page,
  }) => {
    await commonSetup(page);
    const start = { x: 100, y: 200 };
    const end = { x: 300, y: 300 };
    const connectorId = await addBasicConnectorElement(page, start, end);
    await selectElementsByService(page, [connectorId]);

    await page.keyboard.press('Enter');
    await waitNextFrame(page);
    await type(page, ' a ');
    await page.keyboard.press('Escape');
    expect((await getConnectorLabel(page, connectorId)).trim()).toBe('a');

    await page.keyboard.press(`${SHORT_KEY}+Enter`);

    await selectElementsByService(page, [connectorId]);
    await page.keyboard.press('Enter');
    await waitNextFrame(page);
    await type(page, 'b');
    await page.keyboard.press('Escape');
    expect(await getConnectorLabel(page, connectorId)).toBe('b');

    await page.keyboard.press('Escape');

    await selectElementsByService(page, [connectorId]);
    await page.keyboard.press('Enter');
    await waitNextFrame(page);
    await type(page, 'c');
    await page.keyboard.press('Escape');
    expect(await getConnectorLabel(page, connectorId)).toBe('c');
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
