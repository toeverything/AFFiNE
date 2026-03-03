import { expect } from '@playwright/test';

import {
  edgelessCommonSetup,
  selectElementsByService,
} from '../utils/actions/edgeless.js';
import { expectConsoleMessage } from '../utils/actions/misc.js';
import { test } from '../utils/playwright.js';

type SelectedRectSnapshot = {
  width: number;
  height: number;
  translateX: number;
  translateY: number;
  determinant: number;
  rotation: number;
  rect: { left: number; top: number; right: number; bottom: number };
  handles: Record<string, { x: number; y: number } | null>;
};

async function getSelectedRectSnapshot(
  page: Parameters<typeof test>[0]['page']
) {
  await page.waitForSelector('edgeless-selected-rect', { state: 'attached' });
  await page.waitForFunction(() => {
    const host = document.querySelector(
      'edgeless-selected-rect'
    ) as HTMLElement | null;
    return Boolean(
      host?.shadowRoot?.querySelector('.affine-edgeless-selected-rect')
    );
  });
  return page.evaluate(() => {
    const host = document.querySelector(
      'edgeless-selected-rect'
    ) as HTMLElement | null;
    const rect = host?.shadowRoot?.querySelector(
      '.affine-edgeless-selected-rect'
    ) as HTMLElement | null;
    if (!rect) throw new Error('selected rect not found');
    const style = getComputedStyle(rect);
    const matrix = new DOMMatrixReadOnly(
      style.transform === 'none' ? undefined : style.transform
    );
    const width = Number.parseFloat(style.width || '0');
    const height = Number.parseFloat(style.height || '0');
    const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
    const rotation = Math.round(
      (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
    );
    const rectBox = rect.getBoundingClientRect();
    const handles: Record<string, { x: number; y: number } | null> = {};
    ['left', 'right', 'top', 'bottom'].forEach(label => {
      const handle = host?.shadowRoot?.querySelector(
        `.affine-edgeless-selected-rect .handle[aria-label="${label}"]`
      ) as HTMLElement | null;
      if (!handle) {
        handles[label] = null;
        return;
      }
      const box = handle.getBoundingClientRect();
      handles[label] = {
        x: box.left + box.width / 2,
        y: box.top + box.height / 2,
      };
    });
    return {
      width,
      height,
      translateX: matrix.m41,
      translateY: matrix.m42,
      determinant,
      rotation,
      rect: {
        left: rectBox.left,
        top: rectBox.top,
        right: rectBox.right,
        bottom: rectBox.bottom,
      },
      handles,
    } as SelectedRectSnapshot;
  });
}

async function getShapeViewBounds(
  page: Parameters<typeof test>[0]['page'],
  id: string
) {
  return page.evaluate(shapeId => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const model = root.service.crud.getElementById(shapeId);
    if (!model) throw new Error('shape not found');
    const [x, y, w, h] = JSON.parse(model.xywh);
    const [vx, vy] = root.service.viewport.toViewCoord(x, y);
    return {
      viewX: vx,
      viewY: vy,
      viewW: w * root.service.viewport.zoom,
      viewH: h * root.service.viewport.zoom,
      rotate: model.rotate ?? 0,
    };
  }, id);
}

async function getCanvasShapeBounds(
  page: Parameters<typeof test>[0]['page'],
  rect: { left: number; top: number; right: number; bottom: number },
  color: string
) {
  return page.evaluate(
    ({ rect, color }) => {
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
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('canvas ctx not found');

      const toCanvas = (x: number, y: number) => [
        Math.max(
          0,
          Math.min(canvas.width - 1, Math.round((x - box.left) * scaleX))
        ),
        Math.max(
          0,
          Math.min(canvas.height - 1, Math.round((y - box.top) * scaleY))
        ),
      ];

      const [left, top] = toCanvas(rect.left - 10, rect.top - 10);
      const [right, bottom] = toCanvas(rect.right + 10, rect.bottom + 10);
      const w = Math.max(1, right - left + 1);
      const h = Math.max(1, bottom - top + 1);
      const data = ctx.getImageData(left, top, w, h).data;

      const target = color.replace('#', '');
      const r = parseInt(target.slice(0, 2), 16);
      const g = parseInt(target.slice(2, 4), 16);
      const b = parseInt(target.slice(4, 6), 16);
      const tolerance = 16;

      let minX = Number.POSITIVE_INFINITY;
      let minY = Number.POSITIVE_INFINITY;
      let maxX = Number.NEGATIVE_INFINITY;
      let maxY = Number.NEGATIVE_INFINITY;

      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          const idx = (y * w + x) * 4;
          const alpha = data[idx + 3];
          if (alpha === 0) continue;
          const dr = Math.abs(data[idx] - r);
          const dg = Math.abs(data[idx + 1] - g);
          const db = Math.abs(data[idx + 2] - b);
          if (dr + dg + db > tolerance) continue;
          const px = left + x;
          const py = top + y;
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }
      }

      if (!Number.isFinite(minX)) return null;

      return {
        left: box.left + minX / scaleX,
        top: box.top + minY / scaleY,
        right: box.left + maxX / scaleX,
        bottom: box.top + maxY / scaleY,
      };
    },
    { rect, color }
  ) as Promise<{
    left: number;
    top: number;
    right: number;
    bottom: number;
  } | null>;
}

test.describe('shape selection flip', () => {
  test('selected rect mirrors flip while staying aligned', async ({ page }) => {
    expectConsoleMessage(
      page,
      /^Canvas2D: Multiple readback operations/,
      'warning'
    );
    await edgelessCommonSetup(page);

    const { shapeId, connectorId } = await page.evaluate(() => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');
      const shapeId = root.service.crud.addElement('shape', {
        shapeType: 'rect',
        xywh: JSON.stringify([100, 120, 220, 150]),
        filled: true,
        fillColor: '#ff00ff',
        strokeStyle: 'none',
        text: 'Flip',
        textDisplay: true,
      });
      const connectorId = root.service.crud.addElement('connector', {
        source: { id: shapeId, position: [1, 0.5] },
        target: { position: [420, 195] },
      });
      return { shapeId, connectorId };
    });

    await selectElementsByService(page, [shapeId]);
    const before = await getSelectedRectSnapshot(page);
    const bounds = await getShapeViewBounds(page, shapeId);
    const canvasBounds = await getCanvasShapeBounds(
      page,
      before.rect,
      '#ff00ff'
    );
    expect(canvasBounds).not.toBeNull();
    if (canvasBounds) {
      expect(Math.abs(canvasBounds.left - before.rect.left)).toBeLessThan(3);
      expect(Math.abs(canvasBounds.top - before.rect.top)).toBeLessThan(3);
      expect(Math.abs(canvasBounds.right - before.rect.right)).toBeLessThan(3);
      expect(Math.abs(canvasBounds.bottom - before.rect.bottom)).toBeLessThan(
        3
      );
    }

    expect(Math.abs(before.width - bounds.viewW)).toBeLessThan(1);
    expect(Math.abs(before.height - bounds.viewH)).toBeLessThan(1);
    expect(Math.abs(before.translateX - bounds.viewX)).toBeLessThan(1);
    expect(Math.abs(before.translateY - bounds.viewY)).toBeLessThan(1);

    await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      root.service.crud.updateElement(id, { flipX: true });
    }, shapeId);

    const flipped = await getSelectedRectSnapshot(page);
    const flippedBounds = await getShapeViewBounds(page, shapeId);
    const flippedCanvasBounds = await getCanvasShapeBounds(
      page,
      flipped.rect,
      '#ff00ff'
    );
    expect(flippedCanvasBounds).not.toBeNull();
    if (flippedCanvasBounds) {
      expect(
        Math.abs(flippedCanvasBounds.left - flipped.rect.left)
      ).toBeLessThan(3);
      expect(Math.abs(flippedCanvasBounds.top - flipped.rect.top)).toBeLessThan(
        3
      );
      expect(
        Math.abs(flippedCanvasBounds.right - flipped.rect.right)
      ).toBeLessThan(3);
      expect(
        Math.abs(flippedCanvasBounds.bottom - flipped.rect.bottom)
      ).toBeLessThan(3);
    }

    expect(Math.abs(flipped.width - flippedBounds.viewW)).toBeLessThan(1);
    expect(Math.abs(flipped.height - flippedBounds.viewH)).toBeLessThan(1);
    expect(Math.abs(flipped.translateX - flippedBounds.viewX)).toBeLessThan(1);
    expect(Math.abs(flipped.translateY - flippedBounds.viewY)).toBeLessThan(1);
    expect(flipped.determinant).toBeLessThan(0);

    const rectCenterX = (flipped.rect.left + flipped.rect.right) / 2;
    expect(flipped.handles.left).not.toBeNull();
    expect(flipped.handles.right).not.toBeNull();
    if (flipped.handles.left && flipped.handles.right) {
      expect(flipped.handles.left.x).toBeGreaterThan(rectCenterX);
      expect(flipped.handles.right.x).toBeLessThan(rectCenterX);
    }

    const connectorInfo = await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      const connector = root.service.crud.getElementById(id);
      return {
        sourceId: connector?.source?.id ?? null,
        sourcePosition: connector?.source?.position ?? null,
      };
    }, connectorId);
    expect(connectorInfo.sourceId).toBe(shapeId);
    expect(connectorInfo.sourcePosition).toEqual([1, 0.5]);

    await page.evaluate(id => {
      const root = document.querySelector('affine-edgeless-root') as any;
      root.service.crud.updateElement(id, { rotate: 30 });
    }, shapeId);
    const rotated = await getSelectedRectSnapshot(page);
    const normalized = ((rotated.rotation % 360) + 360) % 360;
    const diffA = Math.abs(normalized - 30);
    const diffB = Math.abs(normalized - 210);
    expect(Math.min(diffA, diffB)).toBeLessThan(2);

    const rotatedCanvasBounds = await getCanvasShapeBounds(
      page,
      rotated.rect,
      '#ff00ff'
    );
    expect(rotatedCanvasBounds).not.toBeNull();
    if (rotatedCanvasBounds) {
      expect(
        Math.abs(rotatedCanvasBounds.left - rotated.rect.left)
      ).toBeLessThan(3);
      expect(Math.abs(rotatedCanvasBounds.top - rotated.rect.top)).toBeLessThan(
        3
      );
      expect(
        Math.abs(rotatedCanvasBounds.right - rotated.rect.right)
      ).toBeLessThan(3);
      expect(
        Math.abs(rotatedCanvasBounds.bottom - rotated.rect.bottom)
      ).toBeLessThan(3);
    }

    const within = (value: number, min: number, max: number, margin = 2) =>
      value >= min - margin && value <= max + margin;
    Object.values(rotated.handles).forEach(handle => {
      if (!handle) return;
      expect(within(handle.x, rotated.rect.left, rotated.rect.right)).toBe(
        true
      );
      expect(within(handle.y, rotated.rect.top, rotated.rect.bottom)).toBe(
        true
      );
    });
  });
});
