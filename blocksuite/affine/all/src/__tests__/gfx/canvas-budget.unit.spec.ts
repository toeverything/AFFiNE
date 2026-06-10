import { Viewport, viewportRuntimeConfig } from '@blocksuite/std/gfx';
import { afterEach, describe, expect, test, vi } from 'vitest';

import * as canvasRendererModule from '../../../../blocks/surface/src/renderer/canvas-renderer.js';
import {
  paintPlaceholder,
  syncCanvasSize,
} from '../../../../gfx/turbo-renderer/src/renderer-utils.js';

const originalCaps = [...viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM];
const originalDevicePixelRatio = Object.getOwnPropertyDescriptor(
  window,
  'devicePixelRatio'
);

function setDevicePixelRatio(value: number) {
  Object.defineProperty(window, 'devicePixelRatio', {
    configurable: true,
    value,
  });
}

function createRect(width: number, height: number): DOMRect {
  return {
    width,
    height,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect;
}

afterEach(() => {
  viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [...originalCaps];

  if (originalDevicePixelRatio) {
    Object.defineProperty(window, 'devicePixelRatio', originalDevicePixelRatio);
  }

  vi.restoreAllMocks();
});

describe('edgeless canvas budget', () => {
  test('requests canvas budget sync when zoom crosses an effective dpr bucket', () => {
    viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [
      [0.5, 1],
      [0.8, 2],
    ];

    expect(
      'shouldSyncCanvasBudgetOnViewportUpdate' in canvasRendererModule
    ).toBe(true);

    const shouldSyncCanvasBudgetOnViewportUpdate = (
      canvasRendererModule as {
        shouldSyncCanvasBudgetOnViewportUpdate: (
          previousZoom: number,
          nextZoom: number,
          rawDpr?: number
        ) => boolean;
      }
    ).shouldSyncCanvasBudgetOnViewportUpdate;

    expect(shouldSyncCanvasBudgetOnViewportUpdate(0.95, 0.4, 2)).toBe(true);
    expect(shouldSyncCanvasBudgetOnViewportUpdate(0.95, 0.75, 2)).toBe(false);
    expect(shouldSyncCanvasBudgetOnViewportUpdate(0.45, 0.4, 2)).toBe(false);
    expect(shouldSyncCanvasBudgetOnViewportUpdate(0.95, 0.4, 1)).toBe(false);
  });

  test('enables low-zoom survival mode only for active iOS gestures', () => {
    expect('shouldUseLowZoomSurvivalMode' in canvasRendererModule).toBe(true);

    const shouldUseLowZoomSurvivalMode = (
      canvasRendererModule as {
        shouldUseLowZoomSurvivalMode: (
          isIOS: boolean,
          zoom: number,
          gestureActive: boolean
        ) => boolean;
      }
    ).shouldUseLowZoomSurvivalMode;

    expect(shouldUseLowZoomSurvivalMode(true, 0.4, true)).toBe(true);
    expect(shouldUseLowZoomSurvivalMode(true, 0.6, true)).toBe(false);
    expect(shouldUseLowZoomSurvivalMode(true, 0.4, false)).toBe(false);
    expect(shouldUseLowZoomSurvivalMode(false, 0.4, true)).toBe(false);
  });

  test('emits a lightweight zoom signal during gesture-skipped zoom updates so canvas budgets can shrink', () => {
    viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [
      [0.5, 1],
      [0.8, 2],
    ];

    const viewport = new Viewport();
    viewport.SKIP_REFRESH_DURING_GESTURE = true;

    const viewportUpdated = vi.fn();
    const zoomUpdates: Array<{ previousZoom: number; zoom: number }> = [];
    let lastCanvasBudgetZoom = viewport.zoom;
    let budgetSyncCount = 0;

    viewport.viewportUpdated.subscribe(viewportUpdated);

    expect('zoomUpdated' in viewport).toBe(true);
    const zoomUpdated = (
      viewport as unknown as {
        zoomUpdated: {
          subscribe: (
            callback: (update: { previousZoom: number; zoom: number }) => void
          ) => void;
        };
      }
    ).zoomUpdated;

    zoomUpdated.subscribe(update => {
      zoomUpdates.push(update);
      if (
        (
          canvasRendererModule as {
            shouldSyncCanvasBudgetOnViewportUpdate: (
              previousZoom: number,
              nextZoom: number,
              rawDpr?: number
            ) => boolean;
          }
        ).shouldSyncCanvasBudgetOnViewportUpdate(
          lastCanvasBudgetZoom,
          update.zoom,
          2
        )
      ) {
        budgetSyncCount += 1;
      }
      lastCanvasBudgetZoom = update.zoom;
    });

    viewport.setZoom(0.4, { x: 0, y: 0 }, false, false);

    expect(viewportUpdated).not.toHaveBeenCalled();
    expect(zoomUpdates).toEqual([{ previousZoom: 1, zoom: 0.4 }]);
    expect(budgetSyncCount).toBe(1);

    viewport.dispose();
  });

  test('sizes turbo renderer canvas with effective dpr at low zoom', () => {
    viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [
      [0.5, 1],
      [0.8, 2],
    ];
    setDevicePixelRatio(2);

    const canvas = document.createElement('canvas');
    const host = document.createElement('div');
    vi.spyOn(host, 'getBoundingClientRect').mockReturnValue(
      createRect(200, 100)
    );

    (
      syncCanvasSize as unknown as (
        canvas: HTMLCanvasElement,
        host: HTMLElement,
        zoom: number
      ) => void
    )(canvas, host, 0.4);

    expect(canvas.width).toBe(200);
    expect(canvas.height).toBe(100);

    (
      syncCanvasSize as unknown as (
        canvas: HTMLCanvasElement,
        host: HTMLElement,
        zoom: number
      ) => void
    )(canvas, host, 0.95);

    expect(canvas.width).toBe(400);
    expect(canvas.height).toBe(200);
  });

  test('paints turbo placeholders with effective dpr at low zoom', () => {
    viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [
      [0.5, 1],
      [0.8, 2],
    ];
    setDevicePixelRatio(2);

    const canvas = document.createElement('canvas');
    const fillRect = vi.fn();
    const strokeRect = vi.fn();
    vi.spyOn(canvas, 'getContext').mockReturnValue({
      fillStyle: '',
      strokeStyle: '',
      fillRect,
      strokeRect,
    } as unknown as CanvasRenderingContext2D);

    const layout = {
      roots: [
        {
          blockId: 'root',
          type: 'affine:page',
          layout: {
            blockId: 'root',
            type: 'affine:page',
            rect: { x: 0, y: 0, w: 50, h: 20 },
          },
          children: [],
        },
      ],
      overallRect: { x: 0, y: 0, w: 50, h: 20 },
    };

    (
      paintPlaceholder as unknown as (
        canvas: HTMLCanvasElement,
        layout: typeof layout,
        viewport: {
          zoom: number;
          toViewCoord: (x: number, y: number) => [number, number];
        }
      ) => void
    )(canvas, layout, {
      zoom: 0.4,
      toViewCoord: () => [0, 0],
    });

    expect(fillRect).toHaveBeenLastCalledWith(0, 0, 20, 8);

    (
      paintPlaceholder as unknown as (
        canvas: HTMLCanvasElement,
        layout: typeof layout,
        viewport: {
          zoom: number;
          toViewCoord: (x: number, y: number) => [number, number];
        }
      ) => void
    )(canvas, layout, {
      zoom: 0.95,
      toViewCoord: () => [0, 0],
    });

    expect(fillRect).toHaveBeenLastCalledWith(0, 0, 95, 38);
  });
});
