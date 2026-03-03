import { expect, type Page } from '@playwright/test';

import {
  edgelessCommonSetup,
  setEdgelessTool,
  setViewportCenter,
} from '../utils/actions/edgeless.js';
import { expectConsoleMessage } from '../utils/actions/misc.js';
import { test } from '../utils/playwright.js';

type ShapeSpec = {
  shapeType: string;
  stencilName?: string;
  label: string;
};

type ShapeInstance = {
  id: string;
  label: string;
  shapeType: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

type GridSample = {
  gridX: number[];
  gridY: number[];
  values: Map<string, PickedColor>;
};

async function openShapeBrowser(page: Page) {
  await setEdgelessTool(page, 'shape');
  const shapeMenu = page.locator('edgeless-shape-menu');
  await expect(shapeMenu).toBeVisible();
  const moreButton = shapeMenu.locator('.more-shapes-button');
  await expect(moreButton).toBeVisible();
  await moreButton.click();
  const browserPanel = page.locator('edgeless-shape-browser-panel');
  await expect(browserPanel).toBeVisible();
  return browserPanel;
}

async function getAllKnownShapeSpecs(page: Page): Promise<ShapeSpec[]> {
  await openShapeBrowser(page);
  return page.evaluate(() => {
    const panel = document.querySelector('edgeless-shape-browser-panel') as any;
    if (!panel) throw new Error('shape browser panel not found');

    const categories = panel._getAvailableCategories?.() ?? [];
    const deduped = new Map<string, ShapeSpec>();
    categories.forEach((category: { id: string }) => {
      const shapes = panel._getShapesForCategory?.(category.id) ?? [];
      shapes.forEach((shape: any) => {
        const shapeType = shape.name;
        const stencilName = shape.stencilName;
        const label = shape.tooltip;
        const key = `${shapeType}:${stencilName ?? ''}`;
        if (!deduped.has(key)) {
          deduped.set(key, { shapeType, stencilName, label });
        }
      });
    });
    return [...deduped.values()];
  });
}

function colorsClose(a: string, b: string, tolerance = 24) {
  const parse = (value: string) =>
    value
      .replace('#', '')
      .match(/.{2}/g)
      ?.map(v => parseInt(v, 16)) ?? [0, 0, 0];
  const [ar, ag, ab] = parse(a);
  const [br, bg, bb] = parse(b);
  return Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb) <= tolerance;
}

async function createShapes(
  page: Page,
  specs: ShapeSpec[],
  gradientDirection: 'E' | 'S'
) {
  const size = { w: 180, h: 140 };
  const gap = { x: 220, y: 190 };
  const columns = Math.max(1, Math.ceil(Math.sqrt(specs.length)));
  const layout = specs.map((spec, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = 80 + col * gap.x;
    const y = 80 + row * gap.y;
    return {
      ...spec,
      x,
      y,
      w: size.w,
      h: size.h,
    };
  });

  return page.evaluate(
    ({ shapes, gradientDirection }) => {
      const root = document.querySelector('affine-edgeless-root') as any;
      if (!root) throw new Error('edgeless root not found');

      return shapes.map(shape => ({
        id: root.service.crud.addElement('shape', {
          shapeType:
            shape.shapeType === 'roundedRect' ? 'rect' : shape.shapeType,
          stencilName: shape.stencilName,
          xywh: JSON.stringify([shape.x, shape.y, shape.w, shape.h]),
          radius: shape.shapeType === 'roundedRect' ? 0.2 : 0,
          filled: true,
          fillColor: '#fcd34d',
          gradientFinal: '#1f6feb',
          gradientDirection,
          strokeStyle: 'solid',
          strokeWidth: 6,
          shapeStyle: 'General',
        }),
        label: shape.label,
        shapeType: shape.shapeType,
        x: shape.x,
        y: shape.y,
        w: shape.w,
        h: shape.h,
      }));
    },
    { shapes: layout, gradientDirection }
  ) as Promise<ShapeInstance[]>;
}

type PickedColor = { color: string; alpha: number };

async function pickCanvasColors(page: Page, modelPoints: number[][]) {
  return page.evaluate(points => {
    const root = document.querySelector('affine-edgeless-root') as any;
    if (!root) throw new Error('edgeless root not found');
    const viewport = root.service.viewport;
    const canvases = Array.from(
      document.querySelectorAll(
        '.affine-edgeless-surface-block-container canvas'
      )
    ) as HTMLCanvasElement[];
    const sorted = canvases.sort((a, b) => {
      const za = Number(getComputedStyle(a).zIndex || 0);
      const zb = Number(getComputedStyle(b).zIndex || 0);
      return zb - za;
    });

    const canvasData = sorted.map(canvas => {
      const rect = canvas.getBoundingClientRect();
      const scaleX = canvas.width / rect.width;
      const scaleY = canvas.height / rect.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const data = ctx
        ? ctx.getImageData(0, 0, canvas.width, canvas.height).data
        : null;
      return { canvas, rect, scaleX, scaleY, data };
    });

    const pick = (viewX: number, viewY: number): PickedColor => {
      for (const entry of canvasData) {
        const { canvas, rect, scaleX, scaleY, data } = entry;
        if (!data) continue;
        const px = Math.round((viewX - rect.left) * scaleX);
        const py = Math.round((viewY - rect.top) * scaleY);
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
          continue;
        }
        const start = (py * canvas.width + px) * 4;
        if (data[start + 3] > 0) {
          return {
            color:
              '#' +
              (
                (1 << 24) +
                (data[start] << 16) +
                (data[start + 1] << 8) +
                data[start + 2]
              )
                .toString(16)
                .slice(1),
            alpha: data[start + 3],
          };
        }
      }
      return { color: '#000000', alpha: 0 };
    };

    return points.map(([x, y]) => {
      const [vx, vy] = viewport.toViewCoord(x, y);
      return pick(vx, vy);
    });
  }, modelPoints) as Promise<PickedColor[]>;
}

async function findHorizontalSamplePair(page: Page, shape: ShapeInstance) {
  const offsetsX = [0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1];
  const offsetsY = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const offsetX of offsetsX) {
    for (const offsetY of offsetsY) {
      const left = [shape.x + shape.w * offsetX, shape.y + shape.h * offsetY];
      const right = [
        shape.x + shape.w * (1 - offsetX),
        shape.y + shape.h * offsetY,
      ];
      const [leftColor, rightColor] = await pickCanvasColors(page, [
        left,
        right,
      ]);
      if (leftColor.alpha > 0 && rightColor.alpha > 0) {
        return {
          left,
          right,
          leftColor: leftColor.color,
          rightColor: rightColor.color,
        };
      }
    }
  }
  return null;
}

async function findVerticalSamplePair(page: Page, shape: ShapeInstance) {
  const offsetsY = [0.45, 0.4, 0.35, 0.3, 0.25, 0.2, 0.15, 0.1];
  const offsetsX = [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8];
  for (const offsetY of offsetsY) {
    for (const offsetX of offsetsX) {
      const top = [shape.x + shape.w * offsetX, shape.y + shape.h * offsetY];
      const bottom = [
        shape.x + shape.w * offsetX,
        shape.y + shape.h * (1 - offsetY),
      ];
      const [topColor, bottomColor] = await pickCanvasColors(page, [
        top,
        bottom,
      ]);
      if (topColor.alpha > 0 && bottomColor.alpha > 0) {
        return {
          top,
          bottom,
          topColor: topColor.color,
          bottomColor: bottomColor.color,
        };
      }
    }
  }
  return null;
}

async function sampleShapeGrid(
  page: Page,
  shape: ShapeInstance
): Promise<GridSample> {
  const gridX = [0.2, 0.35, 0.5, 0.65, 0.8];
  const gridY = [0.2, 0.4, 0.5, 0.6, 0.8];
  const points: number[][] = [];
  const keys: string[] = [];
  gridY.forEach(y => {
    gridX.forEach(x => {
      points.push([shape.x + shape.w * x, shape.y + shape.h * y]);
      keys.push(`${x}:${y}`);
    });
  });
  const colors = await pickCanvasColors(page, points);
  const values = new Map<string, PickedColor>();
  keys.forEach((key, index) => {
    values.set(key, colors[index]);
  });
  return { gridX, gridY, values };
}

test.describe('shape flipping', () => {
  test.setTimeout(120000);
  test('flipX mirrors gradient across all shapes', async ({ page }) => {
    expectConsoleMessage(
      page,
      /^Canvas2D: Multiple readback operations/,
      'warning'
    );
    await edgelessCommonSetup(page);

    const specs = await getAllKnownShapeSpecs(page);
    const shapes = await createShapes(page, specs, 'E');
    await page.waitForTimeout(200);

    const baselineFailures: string[] = [];
    const baseline = new Map<
      string,
      {
        left?: number[];
        right?: number[];
        leftColor?: string;
        rightColor?: string;
        grid?: GridSample;
      }
    >();

    for (const shape of shapes) {
      await setViewportCenter(page, [
        shape.x + shape.w / 2,
        shape.y + shape.h / 2,
      ]);
      await page.waitForTimeout(10);
      const sample = await findHorizontalSamplePair(page, shape);
      if (sample && !colorsClose(sample.leftColor, sample.rightColor, 16)) {
        baseline.set(shape.id, {
          left: sample.left,
          right: sample.right,
          leftColor: sample.leftColor,
          rightColor: sample.rightColor,
        });
        continue;
      }
      const grid = await sampleShapeGrid(page, shape);
      const hasAlpha = [...grid.values.values()].some(value => value.alpha > 0);
      if (!hasAlpha) {
        baselineFailures.push(`${shape.label} (gradient not detected)`);
        continue;
      }
      baseline.set(shape.id, { grid });
    }

    await page.evaluate(
      ids => {
        const root = document.querySelector('affine-edgeless-root') as any;
        ids.forEach((id: string) =>
          root.service.crud.updateElement(id, { flipX: true })
        );
      },
      shapes.map(shape => shape.id)
    );

    await page.waitForTimeout(200);

    const failures = [...baselineFailures];

    for (const shape of shapes) {
      await setViewportCenter(page, [
        shape.x + shape.w / 2,
        shape.y + shape.h / 2,
      ]);
      await page.waitForTimeout(10);
      const start = baseline.get(shape.id);
      if (!start) continue;
      if (start.left && start.right && start.leftColor && start.rightColor) {
        const [leftColor, rightColor] = await pickCanvasColors(page, [
          start.left,
          start.right,
        ]);
        if (
          !colorsClose(start.leftColor, rightColor.color) ||
          !colorsClose(start.rightColor, leftColor.color)
        ) {
          failures.push(shape.label);
        }
        continue;
      }
      if (start.grid) {
        const grid = start.grid;
        const after = await sampleShapeGrid(page, shape);
        let mismatch = 0;
        grid.gridY.forEach(y => {
          grid.gridX.forEach(x => {
            const key = `${x}:${y}`;
            const mirrorKey = `${1 - x}:${y}`;
            const beforeValue = grid.values.get(mirrorKey);
            const afterValue = after.values.get(key);
            if (!beforeValue || !afterValue) return;
            const beforeVisible = beforeValue.alpha > 0;
            const afterVisible = afterValue.alpha > 0;
            if (beforeVisible !== afterVisible) {
              mismatch += 1;
              return;
            }
            if (
              beforeVisible &&
              afterVisible &&
              !colorsClose(beforeValue.color, afterValue.color, 48)
            ) {
              mismatch += 1;
            }
          });
        });
        if (mismatch > 2) {
          failures.push(shape.label);
        }
      }
    }

    expect(failures, `FlipX failures: ${failures.join(', ')}`).toEqual([]);
  });

  test('flipY mirrors gradient across all shapes', async ({ page }) => {
    expectConsoleMessage(
      page,
      /^Canvas2D: Multiple readback operations/,
      'warning'
    );
    await edgelessCommonSetup(page);

    const specs = await getAllKnownShapeSpecs(page);
    const shapes = await createShapes(page, specs, 'S');
    await page.waitForTimeout(200);

    const baselineFailures: string[] = [];
    const baseline = new Map<
      string,
      {
        top?: number[];
        bottom?: number[];
        topColor?: string;
        bottomColor?: string;
        grid?: GridSample;
      }
    >();

    for (const shape of shapes) {
      await setViewportCenter(page, [
        shape.x + shape.w / 2,
        shape.y + shape.h / 2,
      ]);
      await page.waitForTimeout(10);
      const sample = await findVerticalSamplePair(page, shape);
      if (sample && !colorsClose(sample.topColor, sample.bottomColor, 16)) {
        baseline.set(shape.id, {
          top: sample.top,
          bottom: sample.bottom,
          topColor: sample.topColor,
          bottomColor: sample.bottomColor,
        });
        continue;
      }
      const grid = await sampleShapeGrid(page, shape);
      const hasAlpha = [...grid.values.values()].some(value => value.alpha > 0);
      if (!hasAlpha) {
        baselineFailures.push(`${shape.label} (gradient not detected)`);
        continue;
      }
      baseline.set(shape.id, { grid });
    }

    await page.evaluate(
      ids => {
        const root = document.querySelector('affine-edgeless-root') as any;
        ids.forEach((id: string) =>
          root.service.crud.updateElement(id, { flipY: true })
        );
      },
      shapes.map(shape => shape.id)
    );

    await page.waitForTimeout(200);

    const failures = [...baselineFailures];

    for (const shape of shapes) {
      await setViewportCenter(page, [
        shape.x + shape.w / 2,
        shape.y + shape.h / 2,
      ]);
      await page.waitForTimeout(10);
      const start = baseline.get(shape.id);
      if (!start) continue;
      if (start.top && start.bottom && start.topColor && start.bottomColor) {
        const [topColor, bottomColor] = await pickCanvasColors(page, [
          start.top,
          start.bottom,
        ]);
        if (
          !colorsClose(start.topColor, bottomColor.color) ||
          !colorsClose(start.bottomColor, topColor.color)
        ) {
          failures.push(shape.label);
        }
        continue;
      }
      if (start.grid) {
        const grid = start.grid;
        const after = await sampleShapeGrid(page, shape);
        let mismatch = 0;
        grid.gridY.forEach(y => {
          grid.gridX.forEach(x => {
            const key = `${x}:${y}`;
            const mirrorKey = `${x}:${1 - y}`;
            const beforeValue = grid.values.get(mirrorKey);
            const afterValue = after.values.get(key);
            if (!beforeValue || !afterValue) return;
            const beforeVisible = beforeValue.alpha > 0;
            const afterVisible = afterValue.alpha > 0;
            if (beforeVisible !== afterVisible) {
              mismatch += 1;
              return;
            }
            if (
              beforeVisible &&
              afterVisible &&
              !colorsClose(beforeValue.color, afterValue.color, 48)
            ) {
              mismatch += 1;
            }
          });
        });
        if (mismatch > 2) {
          failures.push(shape.label);
        }
      }
    }

    expect(failures, `FlipY failures: ${failures.join(', ')}`).toEqual([]);
  });
});
