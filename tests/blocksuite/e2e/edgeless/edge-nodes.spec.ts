import { expect } from '@playwright/test';

import {
  edgelessCommonSetup,
  getEdgelessElementBound,
  toViewCoord,
} from '../utils/actions/edgeless.js';
import { test } from '../utils/playwright.js';

async function createRectShape(page: Parameters<typeof test>[0]['page']) {
  return page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    return root.service.crud.addElement('shape', {
      shapeType: 'rect',
      xywh: JSON.stringify([100, 120, 200, 140]),
      filled: false,
      strokeStyle: 'none',
    });
  });
}

async function getAnchorViewPoint(
  page: Parameters<typeof test>[0]['page'],
  shapeId: string,
  position: [number, number]
) {
  return page.evaluate(
    ({ id, pos }) => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      const model = root.service.crud.getElementById(id);
      if (!model) throw new Error('shape not found');
      const [x, y, w, h] = JSON.parse(model.xywh);
      const anchor = [x + pos[0] * w, y + pos[1] * h];
      const [vx, vy] = root.service.viewport.toViewCoord(anchor[0], anchor[1]);
      return { x: vx, y: vy };
    },
    { id: shapeId, pos: position }
  );
}

async function getCanvasAlphaAt(
  page: Parameters<typeof test>[0]['page'],
  x: number,
  y: number
) {
  return page.evaluate(
    ({ x, y }) => {
      const canvases = Array.from(
        document.querySelectorAll(
          '.affine-edgeless-surface-block-container canvas'
        )
      ) as HTMLCanvasElement[];
      if (canvases.length === 0) throw new Error('canvas not found');
      const canvas = canvases[canvases.length - 1];
      const box = canvas.getBoundingClientRect();
      const scaleX = canvas.width / box.width;
      const scaleY = canvas.height / box.height;
      const px = Math.max(
        0,
        Math.min(canvas.width - 1, Math.round((x - box.left) * scaleX))
      );
      const py = Math.max(
        0,
        Math.min(canvas.height - 1, Math.round((y - box.top) * scaleY))
      );
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('canvas ctx not found');
      const data = ctx.getImageData(px, py, 1, 1).data;
      return data[3];
    },
    { x, y }
  );
}

test.describe('edge nodes', () => {
  const rectangleAnchorLocations: Array<[number, number]> = [
    [0.25, 0],
    [0.5, 0],
    [0.75, 0],
    [1, 0],
    [1, 0.25],
    [1, 0.5],
    [1, 0.75],
    [1, 1],
    [0.75, 1],
    [0.5, 1],
    [0.25, 1],
    [0, 1],
    [0, 0.75],
    [0, 0.5],
    [0, 0.25],
    [0, 0],
  ];
  test('hover exposes edge nodes on desktop', async ({ page }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createRectShape(page);
    if (!shapeId) throw new Error('shapeId is not found');

    const center = await getAnchorViewPoint(page, shapeId, [0.5, 0.5]);
    await page.mouse.move(center.x, center.y);
    await page.waitForTimeout(150);

    const topAnchor = await getAnchorViewPoint(page, shapeId, [0.5, 0]);
    const alpha = await getCanvasAlphaAt(page, topAnchor.x, topAnchor.y);
    expect(alpha).toBeGreaterThan(0);
  });

  test('clicking an edge node starts a connector', async ({ page }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createRectShape(page);
    if (!shapeId) throw new Error('shapeId is not found');

    const anchor = await getAnchorViewPoint(page, shapeId, [0.5, 0]);
    await page.mouse.move(anchor.x, anchor.y);
    await page.waitForTimeout(150);

    await page.mouse.down();
    await page.mouse.move(anchor.x + 120, anchor.y + 80);
    await page.mouse.up();

    const connector = await page.evaluate(() => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      const connectors = root.service.crud.getElementsByType('connector');
      const model = connectors[0];
      if (!model) return null;
      return {
        id: model.id,
        source: model.source,
      };
    });

    expect(connector).toBeTruthy();
    if (connector) {
      expect(connector.source?.id).toBe(shapeId);
    }
  });

  test('long-press exposes edge nodes on touch', async ({ page }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createRectShape(page);
    if (!shapeId) throw new Error('shapeId is not found');

    const center = await getAnchorViewPoint(page, shapeId, [0.5, 0.5]);
    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!target) throw new Error('target not found');
      target.dispatchEvent(
        new PointerEvent('pointerdown', {
          clientX: x,
          clientY: y,
          pointerType: 'touch',
          pointerId: 1,
          isPrimary: true,
          bubbles: true,
        })
      );
    }, center);

    await page.waitForTimeout(450);

    const topAnchor = await getAnchorViewPoint(page, shapeId, [0.5, 0]);
    const alpha = await getCanvasAlphaAt(page, topAnchor.x, topAnchor.y);
    expect(alpha).toBeGreaterThan(0);

    await page.evaluate(({ x, y }) => {
      const target = document.elementFromPoint(x, y) as HTMLElement | null;
      if (!target) throw new Error('target not found');
      target.dispatchEvent(
        new PointerEvent('pointerup', {
          clientX: x,
          clientY: y,
          pointerType: 'touch',
          pointerId: 1,
          isPrimary: true,
          bubbles: true,
        })
      );
    }, center);
  });

  test('edge nodes align with shape edges', async ({ page }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createRectShape(page);
    if (!shapeId) throw new Error('shapeId is not found');

    const center = await getAnchorViewPoint(page, shapeId, [0.5, 0.5]);
    await page.mouse.move(center.x, center.y);
    await page.waitForTimeout(150);

    const top = await getAnchorViewPoint(page, shapeId, [0.5, 0]);
    const right = await getAnchorViewPoint(page, shapeId, [1, 0.5]);
    const topAlpha = await getCanvasAlphaAt(page, top.x, top.y);
    const rightAlpha = await getCanvasAlphaAt(page, right.x, right.y);
    expect(topAlpha).toBeGreaterThan(0);
    expect(rightAlpha).toBeGreaterThan(0);
  });

  test('edge node count matches rectangle anchors', async ({ page }) => {
    await edgelessCommonSetup(page);
    const shapeId = await createRectShape(page);
    if (!shapeId) throw new Error('shapeId is not found');

    const center = await getAnchorViewPoint(page, shapeId, [0.5, 0.5]);
    await page.mouse.move(center.x, center.y);
    await page.waitForTimeout(150);

    const [x, y, w, h] = await getEdgelessElementBound(page, shapeId);
    const anchorPoints = await Promise.all(
      rectangleAnchorLocations.map(async ([rx, ry]) => {
        const [vx, vy] = await toViewCoord(page, [x + rx * w, y + ry * h]);
        return { x: vx, y: vy };
      })
    );

    const alphas = await Promise.all(
      anchorPoints.map(point => getCanvasAlphaAt(page, point.x, point.y))
    );
    expect(alphas.filter(alpha => alpha > 0)).toHaveLength(
      rectangleAnchorLocations.length
    );
  });
});
