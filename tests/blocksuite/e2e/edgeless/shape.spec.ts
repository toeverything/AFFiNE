import { expect, type Page } from '@playwright/test';
import { lightThemeV2 } from '@toeverything/theme/v2';

import {
  assertEdgelessShapeType,
  assertEdgelessTool,
  changeShapeFillColor,
  changeShapeFillColorToTransparent,
  changeShapeStrokeColor,
  changeShapeStrokeStyle,
  changeShapeStrokeWidth,
  clickComponentToolbarMoreMenuButton,
  dragBetweenViewCoords,
  getEdgelessSelectedRect,
  getSelectedBoundCount,
  locatorComponentToolbar,
  locatorEdgelessToolButton,
  locatorShapeStrokeStyleButton,
  openComponentToolbarMoreMenu,
  pickColorAtPoints,
  resizeElementByHandle,
  rotateElementByHandle,
  setEdgelessTool,
  switchEditorMode,
  triggerComponentToolbarAction,
  zoomResetByKeyboard,
} from '../utils/actions/edgeless.js';
import {
  addBasicBrushElement,
  addBasicRectShapeElement,
  clickView,
  copyByKeyboard,
  dblclickView,
  dragBetweenCoords,
  enterPlaygroundRoom,
  focusRichText,
  initEmptyEdgelessState,
  pasteByKeyboard,
  pressBackspace,
  pressEscape,
  selectAllBlocksByKeyboard,
  type,
  waitNextFrame,
} from '../utils/actions/index.js';
import {
  assertEdgelessCanvasText,
  assertEdgelessColorSameWithHexColor,
  assertEdgelessNonSelectedRect,
  assertEdgelessSelectedRect,
  assertRichTexts,
  assertSelectedBound,
} from '../utils/asserts.js';
import { test } from '../utils/playwright.js';

test.describe('add shape', () => {
  test('without holding shift key', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicRectShapeElement(page, start0, end0);

    await assertEdgelessTool(page, 'default');
    await assertEdgelessSelectedRect(page, [100, 100, 50, 100]);

    const start1 = { x: 100, y: 100 };
    const end1 = { x: 200, y: 150 };
    await addBasicRectShapeElement(page, start1, end1);

    await assertEdgelessTool(page, 'default');
    await assertEdgelessSelectedRect(page, [100, 100, 100, 50]);
  });

  test('with holding shift key', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);

    await page.keyboard.down('Shift');

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 150, y: 200 };
    await addBasicRectShapeElement(page, start0, end0);

    await page.keyboard.up('Shift');

    await assertEdgelessTool(page, 'default');
    await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);

    await page.keyboard.down('Shift');

    const start1 = { x: 100, y: 100 };
    const end1 = { x: 200, y: 150 };
    await addBasicRectShapeElement(page, start1, end1);

    await assertEdgelessTool(page, 'default');
    await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);
  });
  test('with holding space bar', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 200, y: 200 };
    await setEdgelessTool(page, 'shape');
    await dragBetweenCoords(page, start0, end0, {
      steps: 50,
      beforeMouseUp: async () => {
        // move the shape
        await page.keyboard.down('Space');
        await page.mouse.move(300, 300);
        await page.keyboard.up('Space');

        await page.mouse.move(500, 600);
      },
    });

    await assertEdgelessSelectedRect(page, [200, 200, 300, 400]);
  });

  test('with holding space bar + shift', async ({ page }) => {
    await enterPlaygroundRoom(page);
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);

    const start0 = { x: 100, y: 100 };
    const end0 = { x: 200, y: 200 };
    await setEdgelessTool(page, 'shape');
    await page.keyboard.down('Shift');
    await dragBetweenCoords(page, start0, end0, {
      steps: 50,
      beforeMouseUp: async () => {
        // move the shape
        await page.keyboard.down('Space');
        await page.mouse.move(300, 300);
        await page.keyboard.up('Space');

        await page.mouse.move(500, 600);
      },
    });

    await assertEdgelessSelectedRect(page, [200, 200, 400, 400]);
  });
});

test('delete shape by component-toolbar', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const start = { x: 100, y: 100 };
  const end = { x: 200, y: 200 };
  await addBasicBrushElement(page, start, end);

  await page.mouse.click(110, 110);
  await openComponentToolbarMoreMenu(page);
  await clickComponentToolbarMoreMenuButton(page, 'delete');
  await assertEdgelessNonSelectedRect(page);
});

test('flip shape horizontally and vertically via more menu', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const start = { x: 100, y: 100 };
  const end = { x: 240, y: 220 };
  await addBasicRectShapeElement(page, start, end);

  await page.mouse.click(120, 120);
  await openComponentToolbarMoreMenu(page);
  await page
    .locator('editor-menu-action')
    .filter({ hasText: 'Flip Horizontal' })
    .click();

  const flipX = await page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    const [selected] = root.service.selection.selectedElements;
    const shape = root.service.crud.getElementById(selected?.id);
    return Boolean(shape?.flipX);
  });
  expect(flipX).toBe(true);

  await openComponentToolbarMoreMenu(page);
  await page
    .locator('editor-menu-action')
    .filter({ hasText: 'Flip Vertical' })
    .click();

  const flipY = await page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    const [selected] = root.service.selection.selectedElements;
    const shape = root.service.crud.getElementById(selected?.id);
    return Boolean(shape?.flipY);
  });
  expect(flipY).toBe(true);
});

test('rotation direction reverses when flip parity is odd', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const shapeId = await page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    return root.service.crud.addElement('shape', {
      shapeType: 'triangle',
      xywh: JSON.stringify([220, 180, 220, 160]),
      filled: true,
      fillColor: '#22aa55',
      strokeStyle: 'solid',
      strokeWidth: 2,
    });
  });

  await page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    root.service.selection.set({ elements: [id], editing: false });
  }, shapeId);

  const toSignedAngle = (deg: number) => {
    const normalized = ((deg % 360) + 360) % 360;
    return normalized > 180 ? normalized - 360 : normalized;
  };

  await rotateElementByHandle(page, 20, 'top-right', 8);
  const beforeFlip = await page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    return Number(root.service.crud.getElementById(id)?.rotate ?? 0);
  }, shapeId);

  await page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    root.service.crud.updateElement(id, {
      rotate: 0,
      flipX: true,
      flipY: false,
    });
    root.service.selection.set({ elements: [id], editing: false });
  }, shapeId);

  await rotateElementByHandle(page, 20, 'top-right', 8);
  const afterFlipX = await page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    return Number(root.service.crud.getElementById(id)?.rotate ?? 0);
  }, shapeId);

  expect(Math.sign(toSignedAngle(afterFlipX))).toBe(
    -Math.sign(toSignedAngle(beforeFlip))
  );
  expect(
    Math.abs(
      Math.abs(toSignedAngle(afterFlipX)) - Math.abs(toSignedAngle(beforeFlip))
    )
  ).toBeLessThanOrEqual(8);

  await page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    root.service.crud.updateElement(id, {
      rotate: 0,
      flipX: true,
      flipY: true,
    });
    root.service.selection.set({ elements: [id], editing: false });
  }, shapeId);

  await rotateElementByHandle(page, 20, 'top-right', 8);
  const afterFlipXY = await page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    return Number(root.service.crud.getElementById(id)?.rotate ?? 0);
  }, shapeId);

  expect(Math.sign(toSignedAngle(afterFlipXY))).toBe(
    Math.sign(toSignedAngle(beforeFlip))
  );
  expect(
    Math.abs(
      Math.abs(toSignedAngle(afterFlipXY)) - Math.abs(toSignedAngle(beforeFlip))
    )
  ).toBeLessThanOrEqual(8);
});

test('vertical flip reflects rotated triangle rendering (10deg)', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const shapeId = await page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    return root.service.crud.addElement('shape', {
      shapeType: 'triangle',
      xywh: JSON.stringify([180, 160, 220, 160]),
      rotate: 10,
      filled: true,
      fillColor: '#22aa55',
      strokeStyle: 'none',
      strokeWidth: 2,
    });
  });

  const samplePair = async () => {
    const pickAtModelPoints = async (points: number[][]) => {
      return page.evaluate(modelPoints => {
        const root = document.querySelector('affine-edgeless-root') as any;
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

        const pick = (mx: number, my: number) => {
          const [vx, vy] = viewport.toViewCoord(mx, my);
          for (const canvas of sorted) {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const px = Math.round((vx - rect.left) * scaleX);
            const py = Math.round((vy - rect.top) * scaleY);
            if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
              continue;
            }
            const data = canvas
              .getContext('2d', { willReadFrequently: true })
              ?.getImageData(px, py, 1, 1).data;
            if (!data) continue;
            if (data[3] > 0) {
              return {
                color:
                  '#' +
                  ((1 << 24) + (data[0] << 16) + (data[1] << 8) + data[2])
                    .toString(16)
                    .slice(1),
                alpha: data[3],
              };
            }
          }
          return { color: '#000000', alpha: 0 };
        };

        return modelPoints.map(([mx, my]) => pick(mx, my));
      }, points) as Promise<{ color: string; alpha: number }[]>;
    };

    const xValues = [0.18, 0.24, 0.3, 0.36];
    const yValues = [0.2, 0.25, 0.3, 0.35, 0.4];

    for (const xFactor of xValues) {
      for (const yFactor of yValues) {
        const topPoint: [number, number] = [
          Math.round(180 + 220 * xFactor),
          Math.round(160 + 160 * yFactor),
        ];
        const bottomPoint: [number, number] = [
          Math.round(180 + 220 * xFactor),
          Math.round(160 + 160 * (1 - yFactor)),
        ];
        const samples = await pickAtModelPoints([topPoint, bottomPoint]);
        if (
          Math.abs(samples[0].alpha - samples[1].alpha) > 40 ||
          !close(samples[0].color, samples[1].color)
        ) {
          return {
            topPoint,
            bottomPoint,
            topColor: samples[0].color,
            bottomColor: samples[1].color,
          };
        }
      }
    }

    return null;
  };

  const close = (a: string, b: string) => {
    const parse = (value: string) =>
      value
        .replace('#', '')
        .match(/.{2}/g)
        ?.map(v => parseInt(v, 16)) ?? [0, 0, 0];
    const [ar, ag, ab] = parse(a);
    const [br, bg, bb] = parse(b);
    return Math.abs(ar - br) + Math.abs(ag - bg) + Math.abs(ab - bb) < 36;
  };

  const before = await samplePair();
  expect(before).not.toBeNull();
  if (!before) return;

  await page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    root.service.crud.updateElement(id, { flipY: true });
  }, shapeId);

  await page.waitForTimeout(100);

  const afterSamples = await page.evaluate(
    modelPoints => {
      const root = document.querySelector('affine-edgeless-root') as any;
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
      const pick = (mx: number, my: number) => {
        const [vx, vy] = viewport.toViewCoord(mx, my);
        for (const canvas of sorted) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const px = Math.round((vx - rect.left) * scaleX);
          const py = Math.round((vy - rect.top) * scaleY);
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
            continue;
          }
          const data = canvas
            .getContext('2d', { willReadFrequently: true })
            ?.getImageData(px, py, 1, 1).data;
          if (!data) continue;
          if (data[3] > 0) {
            return (
              '#' +
              ((1 << 24) + (data[0] << 16) + (data[1] << 8) + data[2])
                .toString(16)
                .slice(1)
            );
          }
        }
        return '#000000';
      };
      return modelPoints.map(([mx, my]) => pick(mx, my));
    },
    [before.topPoint, before.bottomPoint]
  );

  expect(close(before.topColor, afterSamples[1])).toBe(true);
  expect(close(before.bottomColor, afterSamples[0])).toBe(true);
});

test('flip horizontal on rotated diamond keeps connector attached and mirrored', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const { shapeId, connectorId } = await page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    const shapeId = root.service.crud.addElement('shape', {
      shapeType: 'diamond',
      xywh: JSON.stringify([220, 180, 180, 140]),
      rotate: 10,
      filled: true,
      fillColor: '#1f6feb',
      strokeStyle: 'solid',
      strokeWidth: 2,
    });
    const connectorId = root.service.crud.addElement('connector', {
      source: { id: shapeId, position: [1, 0.5] },
      target: { position: [520, 250] },
    });
    return { shapeId, connectorId };
  });

  const before = await page.evaluate(
    ([sid, cid]) => {
      const root = document.querySelector('affine-edgeless-root') as any;
      const shape = root.service.crud.getElementById(sid);
      const connector = root.service.crud.getElementById(cid);
      const [x, y, w, h] = JSON.parse(shape.xywh);
      const center = [x + w / 2, y + h / 2];
      const start = connector.absolutePath?.[0] ?? [0, 0];
      const rad = (shape.rotate * Math.PI) / 180;
      const localX = [Math.cos(rad), Math.sin(rad)];
      const projection =
        (start[0] - center[0]) * localX[0] + (start[1] - center[1]) * localX[1];

      return {
        flipX: Boolean(shape?.flipX),
        projection,
      };
    },
    [shapeId, connectorId]
  );

  await page.evaluate(id => {
    const root = document.querySelector('affine-edgeless-root') as any;
    root.service.selection.set({ elements: [id], editing: false });
  }, shapeId);
  await openComponentToolbarMoreMenu(page);
  await page
    .locator('editor-menu-action')
    .filter({ hasText: 'Flip Horizontal' })
    .click();

  const after = await page.evaluate(
    ([sid, cid]) => {
      const root = document.querySelector('affine-edgeless-root') as any;
      const shape = root.service.crud.getElementById(sid);
      const connector = root.service.crud.getElementById(cid);
      const [x, y, w, h] = JSON.parse(shape.xywh);
      const center = [x + w / 2, y + h / 2];
      const start = connector.absolutePath?.[0] ?? [0, 0];
      const rad = (shape.rotate * Math.PI) / 180;
      const localX = [Math.cos(rad), Math.sin(rad)];
      const projection =
        (start[0] - center[0]) * localX[0] + (start[1] - center[1]) * localX[1];

      return {
        shapeType: shape?.shapeType,
        flipX: Boolean(shape?.flipX),
        rotate: Number(shape?.rotate ?? 0),
        source: connector?.source,
        projection,
      };
    },
    [shapeId, connectorId]
  );

  expect(after.shapeType).toBe('diamond');
  expect(before.flipX).toBe(false);
  expect(after.flipX).toBe(true);
  expect(Math.abs(after.rotate - 10)).toBeLessThan(0.01);
  expect(after.source?.id).toBe(shapeId);
  expect(after.source?.position).toEqual([1, 0.5]);
  expect(Math.sign(after.projection)).toBe(-Math.sign(before.projection));

  const selectionMatrix = await page.evaluate(() => {
    const host = document.querySelector(
      'edgeless-selected-rect'
    ) as HTMLElement | null;
    const rect = host?.shadowRoot?.querySelector(
      '.affine-edgeless-selected-rect'
    ) as HTMLElement | null;
    if (!rect) return null;
    const matrix = new DOMMatrixReadOnly(getComputedStyle(rect).transform);
    return {
      determinant: matrix.a * matrix.d - matrix.b * matrix.c,
    };
  });
  expect(selectionMatrix).not.toBeNull();
  expect((selectionMatrix as { determinant: number }).determinant).toBeLessThan(
    0
  );
});

test('flip horizontal mirrors extended asymmetric shapes', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const shapeIds = await page.evaluate(() => {
    const root = document.querySelector('affine-edgeless-root') as any;
    const defs = [
      {
        shapeType: 'parallelogram',
        xywh: [100, 120, 180, 120],
      },
      {
        shapeType: 'triangleRight',
        xywh: [340, 120, 180, 120],
      },
      {
        shapeType: 'flowchartAnnotation1',
        xywh: [100, 320, 220, 140],
      },
      {
        shapeType: 'arrowBentLeft',
        xywh: [380, 320, 220, 140],
      },
    ];

    return defs.map(def =>
      root.service.crud.addElement('shape', {
        shapeType: def.shapeType,
        xywh: JSON.stringify(def.xywh),
        filled: true,
        fillColor: '#1f6feb',
        strokeStyle: 'none',
        strokeWidth: 2,
      })
    );
  });

  const samplePair = async (id: string) => {
    return page.evaluate(shapeId => {
      const root = document.querySelector('affine-edgeless-root') as any;
      const viewport = root.service.viewport;
      const shape = root.service.crud.getElementById(shapeId);
      if (!shape) throw new Error('shape not found');
      const [x, y, w, h] = JSON.parse(shape.xywh);
      const points: [number, number][] = [
        [x + w * 0.2, y + h * 0.5],
        [x + w * 0.8, y + h * 0.5],
      ];

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

      const pickAlpha = (mx: number, my: number) => {
        const [vx, vy] = viewport.toViewCoord(mx, my);
        for (const canvas of sorted) {
          const rect = canvas.getBoundingClientRect();
          const scaleX = canvas.width / rect.width;
          const scaleY = canvas.height / rect.height;
          const px = Math.round((vx - rect.left) * scaleX);
          const py = Math.round((vy - rect.top) * scaleY);
          if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) {
            continue;
          }
          const data = canvas
            .getContext('2d', { willReadFrequently: true })
            ?.getImageData(px, py, 1, 1).data;
          if (!data) continue;
          if (data[3] > 0) return data[3];
        }
        return 0;
      };

      return points.map(([mx, my]) => pickAlpha(mx, my));
    }, id) as Promise<number[]>;
  };

  for (const id of shapeIds) {
    const before = await samplePair(id);

    await page.evaluate(shapeId => {
      const root = document.querySelector('affine-edgeless-root') as any;
      root.service.crud.updateElement(shapeId, { flipX: true, flipY: false });
    }, id);

    const after = await samplePair(id);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  }
});
//FIXME: need a way to test hand-drawn-like style
test.skip('change shape fill color', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const rect = {
    start: { x: 100, y: 100 },
    end: { x: 200, y: 200 },
  };
  await addBasicRectShapeElement(page, rect.start, rect.end);

  await page.mouse.click(rect.start.x + 5, rect.start.y + 5);
  await triggerComponentToolbarAction(page, 'changeShapeFillColor');
  await changeShapeFillColor(page, 'MediumGrey');
  await page.waitForTimeout(50);
  const [picked] = await pickColorAtPoints(page, [
    [rect.start.x + 20, rect.start.y + 20],
  ]);

  await assertEdgelessColorSameWithHexColor(
    page,
    lightThemeV2['edgeless/palette/medium/greyMedium'],
    picked
  );
});

test('change shape stroke color', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const rect = {
    start: { x: 100, y: 100 },
    end: { x: 200, y: 200 },
  };
  await addBasicRectShapeElement(page, rect.start, rect.end);

  await page.mouse.click(rect.start.x + 5, rect.start.y + 5);
  await triggerComponentToolbarAction(page, 'changeShapeStrokeColor');
  await changeShapeStrokeColor(page, 'HeavyYellow');
  await page.waitForTimeout(50);
  const [picked] = await pickColorAtPoints(page, [
    [rect.start.x + 1, rect.start.y + 1],
  ]);

  await assertEdgelessColorSameWithHexColor(
    page,
    lightThemeV2['edgeless/palette/heavy/yellow'],
    picked
  );
});

test('the tooltip of shape tool button should be hidden when the shape menu is shown', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const shapeTool = await locatorEdgelessToolButton(page, 'shape');
  const shapeToolBox = await shapeTool.boundingBox();
  const tooltip = page.locator('.affine-tooltip');

  if (!shapeToolBox) {
    throw new Error('shapeToolBox is not found');
  }

  await page.mouse.move(shapeToolBox.x + 2, shapeToolBox.y + 2);
  await expect(tooltip).toBeVisible();

  await page.mouse.click(shapeToolBox.x + 2, shapeToolBox.y + 2);
  await expect(tooltip).toBeHidden();

  await page.mouse.click(shapeToolBox.x + 2, shapeToolBox.y + 2);
  await expect(tooltip).toBeVisible();
});

test('delete shape block by keyboard', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);

  await switchEditorMode(page);
  await setEdgelessTool(page, 'shape');
  await dragBetweenCoords(page, { x: 100, y: 100 }, { x: 200, y: 200 });

  await setEdgelessTool(page, 'default');
  const startPoint = await page.evaluate(() => {
    const hitbox = document.querySelector('[data-block-id="3"]');
    if (!hitbox) {
      throw new Error('hitbox is null');
    }
    const rect = hitbox.getBoundingClientRect();
    if (rect == null) {
      throw new Error('rect is null');
    }
    return {
      x: rect.x,
      y: rect.y,
    };
  });
  await page.mouse.click(startPoint.x + 2, startPoint.y + 2);
  await waitNextFrame(page);
  await page.keyboard.press('Backspace');
  const exist = await page.evaluate(() => {
    return document.querySelector('[data-block-id="3"]') != null;
  });
  expect(exist).toBe(false);
});

test('edgeless toolbar shape menu shows up and close normally', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const toolbarLocator = page.locator('.edgeless-toolbar-container');
  await expect(toolbarLocator).toBeVisible();

  const shapeTool = await locatorEdgelessToolButton(page, 'shape');
  const shapeToolBox = await shapeTool.boundingBox();

  if (!shapeToolBox) {
    throw new Error('shapeToolBox is not found');
  }

  await page.mouse.click(shapeToolBox.x + 2, shapeToolBox.y + 2);

  const shapeMenu = page.locator('edgeless-shape-menu');
  await expect(shapeMenu).toBeVisible();
  await page.waitForTimeout(500);

  await page.mouse.click(shapeToolBox.x + 2, shapeToolBox.y + 2);
  await page.waitForTimeout(500);
  await expect(shapeMenu).toBeHidden();
});

test('hovering on shape should not have effect on underlying block', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await focusRichText(page);

  await type(page, 'hello');
  await assertRichTexts(page, ['hello']);

  await switchEditorMode(page);

  const block = page.locator('affine-edgeless-note');
  const blockBox = await block.boundingBox();
  if (blockBox === null) throw new Error('Unexpected box value: box is null');

  const { x, y } = blockBox;

  await setEdgelessTool(page, 'shape');
  await dragBetweenCoords(page, { x, y }, { x: x + 100, y: y + 100 });
  await setEdgelessTool(page, 'default');

  await page.mouse.click(x + 10, y + 10);
  await assertEdgelessSelectedRect(page, [x, y, 100, 100]);
});

test('shape element should not move when the selected state is inactive', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  await setEdgelessTool(page, 'shape');
  await dragBetweenCoords(page, { x: 100, y: 100 }, { x: 200, y: 200 });
  await setEdgelessTool(page, 'default');
  await dragBetweenCoords(
    page,
    { x: 50, y: 50 },
    { x: 110, y: 110 },
    { steps: 2 }
  );

  await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);
});

test('change shape stroke width', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const start = { x: 100, y: 150 };
  const end = { x: 200, y: 250 };
  await addBasicRectShapeElement(page, start, end);

  await page.mouse.click(start.x + 5, start.y + 5);
  await triggerComponentToolbarAction(page, 'changeShapeColor');
  await changeShapeStrokeColor(page, 'MediumMagenta');

  await changeShapeStrokeWidth(page);
  await page.mouse.click(start.x + 5, start.y + 5);
  await assertEdgelessSelectedRect(page, [100, 150, 100, 100]);

  await waitNextFrame(page);

  await triggerComponentToolbarAction(page, 'changeShapeColor');
});

test('change shape stroke style', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const start = { x: 100, y: 150 };
  const end = { x: 200, y: 250 };
  await addBasicRectShapeElement(page, start, end);

  await page.mouse.click(start.x + 5, start.y + 5);
  await triggerComponentToolbarAction(page, 'changeShapeColor');
  await changeShapeStrokeColor(page, 'MediumBlue');

  await changeShapeStrokeStyle(page, 'dash');
  await waitNextFrame(page);

  const activeButton = locatorShapeStrokeStyleButton(page, 'dash');
  const className = await activeButton.evaluate(ele => ele.className);
  expect(className.includes(' active')).toBeTruthy();

  const pickedColor = await pickColorAtPoints(page, [[start.x + 20, start.y]]);
  expect(pickedColor[0]).toBe('#000000');
});

test('click to add shape', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  await setEdgelessTool(page, 'shape');
  await waitNextFrame(page, 500);

  await page.mouse.move(400, 400);
  await page.mouse.move(200, 200);
  await page.mouse.click(200, 200, { button: 'left', delay: 300 });

  await assertEdgelessTool(page, 'default');
  await assertEdgelessSelectedRect(page, [200, 200, 100, 100]);
});

test('dbclick to add text in shape', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  await setEdgelessTool(page, 'shape');
  await waitNextFrame(page, 500);

  await page.mouse.click(200, 150);
  await waitNextFrame(page);
  await page.mouse.dblclick(250, 200);
  await waitNextFrame(page);

  await type(page, 'hello');
  await assertEdgelessCanvasText(page, 'hello');
  await assertEdgelessTool(page, 'default');

  // test select, copy, paste
  const select = async () => {
    await page.mouse.move(245, 205);
    await page.mouse.down();

    await page.mouse.move(245, 205);
    await page.mouse.down();
    await page.mouse.move(262, 205, {
      steps: 10,
    });
    await page.mouse.up();
  };
  await select();
  // h|ell|o
  await waitNextFrame(page);
  await copyByKeyboard(page);
  await waitNextFrame(page);

  // FIXME(@Flrande): this is a workaround, we should keep selection
  await select();

  await waitNextFrame(page);
  await type(page, 'ddd', 50);
  await waitNextFrame(page);
  await assertEdgelessCanvasText(page, 'hdddo');

  await pasteByKeyboard(page);
  await assertEdgelessCanvasText(page, 'hdddello');
});

test('should show selected rect after exiting editing by pressing Escape', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  await setEdgelessTool(page, 'shape');
  await waitNextFrame(page, 500);

  await dragBetweenCoords(page, { x: 100, y: 100 }, { x: 200, y: 200 });

  await waitNextFrame(page);
  await page.mouse.dblclick(150, 150);
  await waitNextFrame(page);

  await type(page, 'hello');
  await assertEdgelessCanvasText(page, 'hello');

  await pressEscape(page);
  await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);
});

test('auto wrap text in shape', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  await setEdgelessTool(page, 'shape');
  await waitNextFrame(page, 500);

  await page.mouse.click(200, 150);
  await waitNextFrame(page);
  await page.mouse.dblclick(250, 200);
  await waitNextFrame(page);

  await type(page, 'aaaa\nbbbb\n');
  await assertEdgelessCanvasText(page, 'aaaa\nbbbb\n');
  await assertEdgelessTool(page, 'default');

  // blur to finish typing
  await page.mouse.click(150, 150);
  // select shape
  await page.mouse.click(200, 150);
  // the height of shape should be increased because of \n
  let selectedRect = await getEdgelessSelectedRect(page);
  let lastWidth = selectedRect.width;
  let lastHeight = selectedRect.height;

  await page.mouse.dblclick(250, 200);
  await waitNextFrame(page);
  // type long text
  await type(page, '\ncccccccc');
  await assertEdgelessCanvasText(page, 'aaaa\nbbbb\ncccccccc');

  // blur to finish typing
  await page.mouse.click(150, 150);
  // select shape
  await page.mouse.click(200, 150);
  // the height of shape should be increased because of long text
  // cccccccc -- wrap --> cccccc\ncc
  selectedRect = await getEdgelessSelectedRect(page);
  expect(selectedRect.width).toBe(lastWidth);
  expect(selectedRect.height).toBeGreaterThan(lastHeight);
  lastWidth = selectedRect.width;
  lastHeight = selectedRect.height;

  // try to decrease height
  await resizeElementByHandle(page, { x: 0, y: -50 }, 'bottom-right');
  // you can't decrease height because of min height to fit text
  selectedRect = await getEdgelessSelectedRect(page);
  expect(selectedRect.width).toBe(lastWidth);
  expect(selectedRect.height).toBeGreaterThanOrEqual(lastHeight);
  lastWidth = selectedRect.width;
  lastHeight = selectedRect.height;

  // increase width to make text not wrap
  await resizeElementByHandle(page, { x: 50, y: -10 }, 'bottom-right');
  // the height of shape should be decreased because of long text not wrap
  selectedRect = await getEdgelessSelectedRect(page);
  expect(selectedRect.width).toBeGreaterThan(lastWidth);
  expect(selectedRect.height).toBeLessThan(lastHeight);

  // try to decrease width
  await resizeElementByHandle(page, { x: -140, y: 0 }, 'bottom-right');
  // you can't decrease width after text can't wrap (each line just has 1 char)
  await assertEdgelessSelectedRect(page, [200, 150, 52, 404]);
});

test('change shape style', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  const start = { x: 100, y: 150 };
  const end = { x: 200, y: 250 };
  await addBasicRectShapeElement(page, start, end);

  await page.mouse.click(start.x + 5, start.y + 5);
  await triggerComponentToolbarAction(page, 'changeShapeColor');
  // The style switching feature has been removed.
  //await changeShapeStyle(page, 'general');
  await waitNextFrame(page);

  await page.mouse.click(start.x + 5, start.y + 5);
  const color = 'LightPurple';
  await changeShapeStrokeColor(page, color);
  await page.waitForTimeout(50);
  const [picked] = await pickColorAtPoints(page, [[start.x + 1, start.y + 1]]);

  await assertEdgelessColorSameWithHexColor(
    page,
    lightThemeV2['edgeless/palette/light/purpleLight'],
    picked
  );
});

test('shape adds text by button', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  await setEdgelessTool(page, 'shape');
  await waitNextFrame(page, 500);

  await page.mouse.click(200, 150);
  await waitNextFrame(page);

  await triggerComponentToolbarAction(page, 'addText');
  await type(page, 'hello');
  await assertEdgelessCanvasText(page, 'hello');
});

test('should reset shape text when text is empty', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await zoomResetByKeyboard(page);

  await setEdgelessTool(page, 'shape');
  await waitNextFrame(page, 500);

  await page.mouse.click(200, 150);
  await waitNextFrame(page);

  await triggerComponentToolbarAction(page, 'addText');
  await type(page, ' a ');
  await assertEdgelessCanvasText(page, ' a ');

  await page.mouse.click(0, 0);
  await waitNextFrame(page);
  await page.mouse.click(200, 150);

  const addTextBtn = locatorComponentToolbar(page).getByRole('button', {
    name: 'Add text',
  });
  await expect(addTextBtn).toBeHidden();

  await page.mouse.dblclick(250, 200);
  await assertEdgelessCanvasText(page, 'a');

  await page.keyboard.press('Backspace');
  await assertEdgelessCanvasText(page, '');

  await page.mouse.click(0, 0);
  await waitNextFrame(page);
  await page.mouse.click(200, 150);

  await expect(addTextBtn).toBeVisible();
});

test.describe('shape hit test', () => {
  async function addTransparentRect(
    page: Page,
    start: { x: number; y: number },
    end: { x: number; y: number }
  ) {
    const rect = {
      start,
      end,
    };
    await addBasicRectShapeElement(page, rect.start, rect.end);

    await page.mouse.click(rect.start.x + 5, rect.start.y + 5);
    // opens color picker
    await triggerComponentToolbarAction(page, 'changeShapeColor');
    await changeShapeFillColorToTransparent(page);
    // closes color picker
    await triggerComponentToolbarAction(page, 'changeShapeColor');
    await page.waitForTimeout(50);
  }

  test.beforeEach(async ({ page }) => {
    await enterPlaygroundRoom(page);
    await page.evaluate(() => {
      window.doc
        .get(window.$blocksuite.services.FeatureFlagService)
        .setFlag('enable_edgeless_text', false);
    });
    await initEmptyEdgelessState(page);
    await switchEditorMode(page);
  });

  const rect = {
    start: { x: 100, y: 100 },
    end: { x: 200, y: 200 },
  };

  test('can select hollow shape by clicking center area', async ({ page }) => {
    await addTransparentRect(page, rect.start, rect.end);
    await page.mouse.click(rect.start.x - 20, rect.start.y - 20);
    await assertEdgelessNonSelectedRect(page);

    await page.mouse.click(rect.start.x + 50, rect.start.y + 50);
    await assertEdgelessSelectedRect(page, [100, 100, 100, 100]);
  });

  test('double click can add text in shape hollow area', async ({ page }) => {
    await addTransparentRect(page, rect.start, rect.end);
    await page.mouse.click(rect.start.x - 20, rect.start.y - 20);
    await assertEdgelessNonSelectedRect(page);

    await assertEdgelessTool(page, 'default');
    await page.mouse.dblclick(rect.start.x + 20, rect.start.y + 20);
    await waitNextFrame(page);

    await type(page, 'hello');
    await assertEdgelessCanvasText(page, 'hello');
  });

  // FIXME(@flrande): This is broken by recent changes
  // In Playwright, we can't add text in shape hollow area
  test.fixme('using text tool to add text in shape hollow area', async ({
    page,
  }) => {
    await addTransparentRect(page, rect.start, rect.end);
    await page.mouse.click(rect.start.x - 20, rect.start.y - 20);
    await assertEdgelessNonSelectedRect(page);

    await assertEdgelessTool(page, 'default');
    await setEdgelessTool(page, 'text');
    await page.mouse.click(rect.start.x + 50, rect.start.y + 50);
    await waitNextFrame(page);

    await type(page, 'hello');
    await assertEdgelessCanvasText(page, 'hello');
  });

  test('should enter edit mode when double-clicking a text area in a shape with a transparent background', async ({
    page,
  }) => {
    await addTransparentRect(page, rect.start, rect.end);
    await page.mouse.click(rect.start.x - 20, rect.start.y - 20);
    await assertEdgelessNonSelectedRect(page);

    await assertEdgelessTool(page, 'default');
    await page.mouse.dblclick(rect.start.x + 50, rect.start.y + 50);
    await waitNextFrame(page);
    await type(page, 'hello');

    await pressEscape(page);
    await waitNextFrame(page);

    const alignmentMenu =
      locatorComponentToolbar(page).getByLabel('alignment-menu');

    const textAlignBtn = alignmentMenu.getByRole('button', {
      name: 'Alignment',
    });
    await textAlignBtn.click();

    await alignmentMenu.getByRole('button', { name: 'Left' }).click();

    // creates an edgeless-text
    await page.mouse.dblclick(rect.start.x + 80, rect.start.y + 20);
    await waitNextFrame(page);
    await page.locator('edgeless-text-editor').isVisible();

    await pressEscape(page);
    await waitNextFrame(page);

    // enters edit mode
    await page.mouse.dblclick(rect.start.x + 20, rect.start.y + 50);
    await page.locator('edgeless-shape-text-editor').isVisible();
    await type(page, ' world');
    await assertEdgelessCanvasText(page, 'hello world');
  });
});

test('should create a shape when press s and click on canvas', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await clickView(page, [0, 0]);
  await zoomResetByKeyboard(page);
  await selectAllBlocksByKeyboard(page);
  await pressBackspace(page);

  await page.keyboard.press('s');
  await assertEdgelessTool(page, 'shape');
  await clickView(page, [100, 100]);
  await selectAllBlocksByKeyboard(page);
  expect(await getSelectedBoundCount(page)).toBe(1);
  await assertSelectedBound(page, [100, 100, 100, 100]);
});

test('shape should be editable when re-enter canvas', async ({ page }) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);
  await clickView(page, [0, 0]);
  await zoomResetByKeyboard(page);
  await selectAllBlocksByKeyboard(page);
  await pressBackspace(page);

  await page.keyboard.press('s');
  await dragBetweenViewCoords(page, [0, 0], [100, 100]);
  await dblclickView(page, [50, 50]);
  await type(page, 'hello');
  await expect(page.locator('edgeless-shape-text-editor')).toBeAttached();
  await assertEdgelessCanvasText(page, 'hello');

  await switchEditorMode(page);
  await switchEditorMode(page);

  await dblclickView(page, [50, 50]);
  await expect(page.locator('edgeless-shape-text-editor')).toBeAttached();
});

test('shape tool should not be changed after adding new shape', async ({
  page,
}) => {
  await enterPlaygroundRoom(page);
  await initEmptyEdgelessState(page);
  await switchEditorMode(page);

  await setEdgelessTool(page, 'shape');
  await page.keyboard.press('s');
  await waitNextFrame(page);
  await assertEdgelessShapeType(page, 'ellipse');
  await clickView(page, [0, 0]);

  await page.keyboard.press('s');
  await waitNextFrame(page);
  await assertEdgelessShapeType(page, 'ellipse');
});
