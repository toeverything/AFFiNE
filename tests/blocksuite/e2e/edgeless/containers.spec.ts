import { expect, type Page } from '@playwright/test';

import {
  createConnectorElement,
  dragBetweenViewCoords,
  edgelessCommonSetup,
  getConnectorPath,
  getEdgelessElementBound,
  selectElementsByService,
  toViewCoord,
} from '../utils/actions/edgeless.js';
import { test } from '../utils/playwright.js';

const COLLAPSE_BUTTON_SIZE = 22;
const COLLAPSE_BUTTON_PADDING = 10;

async function createContainer(
  page: Page,
  xywh: [number, number, number, number]
) {
  return page.evaluate(coords => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    return root.service.crud.addElement('shape', {
      shapeType: 'container',
      xywh: JSON.stringify(coords),
      radius: 0,
    });
  }, xywh);
}

async function createRectShape(
  page: Page,
  xywh: [number, number, number, number]
) {
  return page.evaluate(coords => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    return root.service.crud.addElement('shape', {
      shapeType: 'rect',
      xywh: JSON.stringify(coords),
      radius: 0,
    });
  }, xywh);
}

async function toggleContainerCollapse(page: Page, id: string) {
  const [x, y] = await getEdgelessElementBound(page, id);
  const buttonCenter: [number, number] = [
    x + COLLAPSE_BUTTON_PADDING + COLLAPSE_BUTTON_SIZE / 2,
    y + COLLAPSE_BUTTON_PADDING + COLLAPSE_BUTTON_SIZE / 2,
  ];
  const [vx, vy] = await toViewCoord(page, buttonCenter);
  await page.mouse.click(vx, vy);
}

async function isHidden(page: Page, id: string) {
  return page.evaluate(elementId => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const model = root.service.crud.getElementById(elementId);
    if (!model) throw new Error('element not found');
    return Boolean(model.hidden);
  }, id);
}

test.describe('containers', () => {
  test('container shapes collapse and expand', async ({ page }) => {
    await edgelessCommonSetup(page);
    const containerId = await createContainer(page, [100, 100, 260, 180]);
    const insideId = await createRectShape(page, [160, 160, 80, 60]);

    await selectElementsByService(page, [containerId]);
    expect(await isHidden(page, insideId)).toBe(false);

    await toggleContainerCollapse(page, containerId);
    expect(await isHidden(page, insideId)).toBe(true);

    await toggleContainerCollapse(page, containerId);
    expect(await isHidden(page, insideId)).toBe(false);
  });

  test('dragging shapes into container works', async ({ page }) => {
    await edgelessCommonSetup(page);
    const containerId = await createContainer(page, [100, 100, 260, 180]);
    const shapeId = await createRectShape(page, [420, 140, 80, 60]);

    const [sx, sy, sw, sh] = await getEdgelessElementBound(page, shapeId);
    const [cx, cy, cw, ch] = await getEdgelessElementBound(page, containerId);
    const start = [sx + sw / 2, sy + sh / 2];
    const target = [cx + cw / 2, cy + ch / 2];
    await dragBetweenViewCoords(page, start, target, {
      steps: 10,
      click: true,
    });

    await toggleContainerCollapse(page, containerId);
    expect(await isHidden(page, shapeId)).toBe(true);
  });

  test('dragging shapes out of container works', async ({ page }) => {
    await edgelessCommonSetup(page);
    const containerId = await createContainer(page, [100, 100, 260, 180]);
    const shapeId = await createRectShape(page, [160, 160, 80, 60]);

    const [sx, sy, sw, sh] = await getEdgelessElementBound(page, shapeId);
    const start = [sx + sw / 2, sy + sh / 2];
    const target = [420, 140];
    await dragBetweenViewCoords(page, start, target, {
      steps: 10,
      click: true,
    });

    await toggleContainerCollapse(page, containerId);
    expect(await isHidden(page, shapeId)).toBe(false);
  });

  test('connector routing updates on container collapse', async ({ page }) => {
    await edgelessCommonSetup(page);
    const containerId = await createContainer(page, [100, 100, 260, 180]);
    const insideId = await createRectShape(page, [160, 160, 80, 60]);
    const outsideId = await createRectShape(page, [460, 160, 80, 60]);

    const [ix, iy, iw, ih] = await getEdgelessElementBound(page, insideId);
    const [ox, oy, , oh] = await getEdgelessElementBound(page, outsideId);
    await createConnectorElement(
      page,
      [ix + iw, iy + ih / 2],
      [ox, oy + oh / 2]
    );
    const beforePath = await getConnectorPath(page);

    await toggleContainerCollapse(page, containerId);
    const afterPath = await getConnectorPath(page);
    expect(afterPath).not.toEqual(beforePath);

    const [cx, cy, cw, ch] = await getEdgelessElementBound(page, containerId);
    const start = afterPath[0];
    const end = afterPath[afterPath.length - 1];
    const isOnContainer = ([px, py]: number[]) =>
      px >= cx - 1 && px <= cx + cw + 1 && py >= cy - 1 && py <= cy + ch + 1;
    expect(isOnContainer(start) || isOnContainer(end)).toBe(true);
  });
});
