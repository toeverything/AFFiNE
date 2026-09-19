import { Bound } from '@blocksuite/global/gfx';
import { Viewport, viewportRuntimeConfig } from '@blocksuite/std/gfx';
import { afterEach, describe, expect, test, vi } from 'vitest';

import * as viewportModule from '../../../../../framework/std/src/gfx/viewport.js';
import * as viewportElementModule from '../../../../../framework/std/src/gfx/viewport-element.js';
import * as canvasRendererModule from '../../../../blocks/surface/src/renderer/canvas-renderer.js';
import {
  paintPlaceholder,
  syncCanvasSize,
} from '../../../../gfx/turbo-renderer/src/renderer-utils.js';
import type { ViewportLayoutTree } from '../../../../gfx/turbo-renderer/src/types.js';

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

function createFakeBlockModel(
  id: string,
  x: number,
  y: number,
  w = 10,
  h = 10
) {
  return {
    id,
    elementBound: new Bound(x, y, w, h),
  };
}

type PaintPlaceholderForTest = (
  canvas: HTMLCanvasElement,
  layout: ViewportLayoutTree,
  viewport: {
    zoom: number;
    toViewCoord: (x: number, y: number) => [number, number];
  }
) => void;

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

  test('does not enable canvas placeholders for low-zoom panning without zooming', () => {
    expect('shouldRenderCanvasPlaceholders' in canvasRendererModule).toBe(true);

    const shouldRenderCanvasPlaceholders = (
      canvasRendererModule as {
        shouldRenderCanvasPlaceholders: (params: {
          isIOS: boolean;
          zoom: number;
          isPanning: boolean;
          isZooming: boolean;
          skipRefreshDuringGesture: boolean;
          turboEnabled: boolean;
        }) => boolean;
      }
    ).shouldRenderCanvasPlaceholders;

    expect(
      shouldRenderCanvasPlaceholders({
        isIOS: true,
        zoom: 0.4,
        isPanning: true,
        isZooming: false,
        skipRefreshDuringGesture: true,
        turboEnabled: true,
      })
    ).toBe(false);

    expect(
      shouldRenderCanvasPlaceholders({
        isIOS: true,
        zoom: 0.4,
        isPanning: false,
        isZooming: true,
        skipRefreshDuringGesture: true,
        turboEnabled: true,
      })
    ).toBe(true);
  });

  test('shares one bypass decision for placeholder and render paths only during the low-zoom iOS landscape gesture or recovery window', () => {
    expect('getStackingCanvasBypassState' in canvasRendererModule).toBe(true);
    expect(
      'shouldBypassStackingCanvasesDuringLowZoomGesture' in canvasRendererModule
    ).toBe(true);

    const getStackingCanvasBypassState = (
      canvasRendererModule as {
        getStackingCanvasBypassState: (params: {
          isIOS: boolean;
          zoom: number;
          gestureActive: boolean;
          recoveryActive: boolean;
          viewportWidth: number;
          viewportHeight: number;
        }) => boolean;
      }
    ).getStackingCanvasBypassState;
    const shouldBypassStackingCanvasesDuringLowZoomGesture = (
      canvasRendererModule as {
        shouldBypassStackingCanvasesDuringLowZoomGesture: (params: {
          isIOS: boolean;
          zoom: number;
          gestureActive: boolean;
          recoveryActive: boolean;
          viewportWidth: number;
          viewportHeight: number;
        }) => boolean;
      }
    ).shouldBypassStackingCanvasesDuringLowZoomGesture;

    expect(
      getStackingCanvasBypassState({
        isIOS: true,
        zoom: 0.4,
        gestureActive: true,
        recoveryActive: false,
        viewportWidth: 932,
        viewportHeight: 430,
      })
    ).toBe(true);
    expect(
      getStackingCanvasBypassState({
        isIOS: true,
        zoom: 0.4,
        gestureActive: false,
        recoveryActive: true,
        viewportWidth: 932,
        viewportHeight: 430,
      })
    ).toBe(true);
    expect(
      getStackingCanvasBypassState({
        isIOS: true,
        zoom: 0.4,
        gestureActive: false,
        recoveryActive: false,
        viewportWidth: 932,
        viewportHeight: 430,
      })
    ).toBe(false);
    expect(
      shouldBypassStackingCanvasesDuringLowZoomGesture({
        isIOS: true,
        zoom: 0.4,
        gestureActive: false,
        recoveryActive: false,
        viewportWidth: 932,
        viewportHeight: 430,
      })
    ).toBe(false);
    expect(
      getStackingCanvasBypassState({
        isIOS: true,
        zoom: 0.4,
        gestureActive: true,
        recoveryActive: false,
        viewportWidth: 430,
        viewportHeight: 932,
      })
    ).toBe(false);
    expect(
      getStackingCanvasBypassState({
        isIOS: true,
        zoom: 0.6,
        gestureActive: true,
        recoveryActive: false,
        viewportWidth: 932,
        viewportHeight: 430,
      })
    ).toBe(false);
    expect(
      getStackingCanvasBypassState({
        isIOS: false,
        zoom: 0.4,
        gestureActive: true,
        recoveryActive: false,
        viewportWidth: 932,
        viewportHeight: 430,
      })
    ).toBe(false);
  });

  test('gesture low-zoom landscape bypass detaches stacking canvases through the existing attachment path', () => {
    expect(
      'shouldBypassStackingCanvasesDuringLowZoomGesture' in canvasRendererModule
    ).toBe(true);
    expect('getStackingCanvasAttachmentDiff' in canvasRendererModule).toBe(
      true
    );

    const shouldBypassStackingCanvasesDuringLowZoomGesture = (
      canvasRendererModule as {
        shouldBypassStackingCanvasesDuringLowZoomGesture: (params: {
          isIOS: boolean;
          zoom: number;
          gestureActive: boolean;
          recoveryActive: boolean;
          viewportWidth: number;
          viewportHeight: number;
        }) => boolean;
      }
    ).shouldBypassStackingCanvasesDuringLowZoomGesture;
    const getStackingCanvasAttachmentDiff = (
      canvasRendererModule as {
        getStackingCanvasAttachmentDiff: (params: {
          canvases: HTMLCanvasElement[];
          wasAttached: boolean;
          shouldAttach: boolean;
        }) => {
          added: HTMLCanvasElement[];
          removed: HTMLCanvasElement[];
        };
      }
    ).getStackingCanvasAttachmentDiff;

    const canvases = [document.createElement('canvas')];
    const shouldBypass = shouldBypassStackingCanvasesDuringLowZoomGesture({
      isIOS: true,
      zoom: 0.4,
      gestureActive: true,
      recoveryActive: false,
      viewportWidth: 932,
      viewportHeight: 430,
    });

    expect(shouldBypass).toBe(true);
    expect(
      getStackingCanvasAttachmentDiff({
        canvases,
        wasAttached: true,
        shouldAttach: !shouldBypass,
      })
    ).toEqual({
      added: [],
      removed: canvases,
    });
  });

  test('uses overscan for main-canvas fallback culling and render origin', () => {
    expect('getMainCanvasFallbackBounds' in canvasRendererModule).toBe(true);

    const getMainCanvasFallbackBounds = (
      canvasRendererModule as {
        getMainCanvasFallbackBounds: (params: {
          viewportBounds: Bound;
          overscanViewportBounds: Bound;
        }) => {
          cullBound: Bound;
          renderBound: Bound;
        };
      }
    ).getMainCanvasFallbackBounds;

    const viewportBounds = new Bound(100, 200, 300, 150);
    const overscanViewportBounds = new Bound(40, 170, 420, 210);

    expect(
      getMainCanvasFallbackBounds({
        viewportBounds,
        overscanViewportBounds,
      })
    ).toEqual({
      cullBound: overscanViewportBounds,
      renderBound: overscanViewportBounds,
    });
  });

  test('lays out overscan canvases relative to the exact viewport', () => {
    expect('getCanvasViewportLayout' in canvasRendererModule).toBe(true);

    const getCanvasViewportLayout = (
      canvasRendererModule as {
        getCanvasViewportLayout: (params: {
          bound: Bound;
          viewportBounds: Bound;
          zoom: number;
          viewScale: number;
          dpr: number;
        }) => {
          actualHeight: number;
          actualWidth: number;
          height: number;
          transform: string;
          width: number;
        };
      }
    ).getCanvasViewportLayout;

    expect(
      getCanvasViewportLayout({
        bound: new Bound(40, 170, 420, 210),
        viewportBounds: new Bound(100, 200, 300, 150),
        zoom: 1,
        viewScale: 1,
        dpr: 2,
      })
    ).toEqual({
      actualHeight: 420,
      actualWidth: 840,
      height: 210,
      transform: 'translate(-60px, -30px) scale(1)',
      width: 420,
    });
  });

  test('computes stacking canvas DOM attachment diffs when bypass toggles', () => {
    expect('getStackingCanvasAttachmentDiff' in canvasRendererModule).toBe(
      true
    );

    const getStackingCanvasAttachmentDiff = (
      canvasRendererModule as {
        getStackingCanvasAttachmentDiff: (params: {
          canvases: HTMLCanvasElement[];
          wasAttached: boolean;
          shouldAttach: boolean;
        }) => {
          added: HTMLCanvasElement[];
          removed: HTMLCanvasElement[];
        };
      }
    ).getStackingCanvasAttachmentDiff;

    const canvasA = document.createElement('canvas');
    const canvasB = document.createElement('canvas');
    const canvases = [canvasA, canvasB];

    expect(
      getStackingCanvasAttachmentDiff({
        canvases,
        wasAttached: true,
        shouldAttach: false,
      })
    ).toEqual({
      added: [],
      removed: canvases,
    });

    expect(
      getStackingCanvasAttachmentDiff({
        canvases,
        wasAttached: false,
        shouldAttach: true,
      })
    ).toEqual({
      added: canvases,
      removed: [],
    });

    expect(
      getStackingCanvasAttachmentDiff({
        canvases,
        wasAttached: true,
        shouldAttach: true,
      })
    ).toEqual({
      added: [],
      removed: [],
    });
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

    viewport.panning$.next(true);
    viewport.setZoom(0.4, { x: 0, y: 0 }, false, false, true);

    expect(viewportUpdated).not.toHaveBeenCalled();
    expect(zoomUpdates).toEqual([{ previousZoom: 1, zoom: 0.4 }]);
    expect(budgetSyncCount).toBe(1);

    viewport.dispose();
  });

  test('keeps programmatic setZoom on the normal viewport update path in skip mode', () => {
    const viewport = new Viewport();
    viewport.SKIP_REFRESH_DURING_GESTURE = true;

    const viewportUpdated = vi.fn();
    const zoomUpdated = vi.fn();

    viewport.viewportUpdated.subscribe(viewportUpdated);
    viewport.zoomUpdated.subscribe(zoomUpdated);

    viewport.setZoom(0.4, { x: 0, y: 0 });

    expect(viewportUpdated).toHaveBeenCalledTimes(1);
    expect(zoomUpdated).toHaveBeenCalledWith({ previousZoom: 1, zoom: 0.4 });
    expect(viewport.panning$.value).toBe(false);
    expect(viewport.zooming$.value).toBe(false);

    viewport.dispose();
  });

  test('enables low-zoom block survival only while the gesture is still active', () => {
    expect('shouldUseLowZoomBlockSurvivalMode' in viewportElementModule).toBe(
      true
    );

    const shouldUseLowZoomBlockSurvivalMode = (
      viewportElementModule as {
        shouldUseLowZoomBlockSurvivalMode: (params: {
          zoom: number;
          skipRefreshDuringGesture: boolean;
          gestureActive: boolean;
        }) => boolean;
      }
    ).shouldUseLowZoomBlockSurvivalMode;

    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: 0.4,
        skipRefreshDuringGesture: true,
        gestureActive: true,
      })
    ).toBe(true);
    expect(
      shouldUseLowZoomBlockSurvivalMode({
        zoom: 0.4,
        skipRefreshDuringGesture: true,
        gestureActive: false,
      })
    ).toBe(false);
  });

  test('keeps selected and one nearby viewport block active during low-zoom gesture survival', () => {
    expect('getLowZoomGestureActiveModels' in viewportElementModule).toBe(true);

    const getLowZoomGestureActiveModels = (
      viewportElementModule as {
        getLowZoomGestureActiveModels: (params: {
          selectedModels: Set<{ id: string; elementBound: Bound }>;
          viewportModels: Set<{ id: string; elementBound: Bound }>;
          viewportBounds: Bound;
          nearbyActiveBlockLimit: number;
          nearbyDistanceRatio: number;
        }) => Set<{ id: string; elementBound: Bound }>;
      }
    ).getLowZoomGestureActiveModels;

    const selected = createFakeBlockModel('selected', 10, 10);
    const nearby = createFakeBlockModel('nearby', 28, 12);
    const far = createFakeBlockModel('far', 78, 78);

    const activeModels = getLowZoomGestureActiveModels({
      selectedModels: new Set([selected]),
      viewportModels: new Set([selected, nearby, far]),
      viewportBounds: new Bound(0, 0, 100, 100),
      nearbyActiveBlockLimit: 1,
      nearbyDistanceRatio: 0.35,
    });

    expect([...activeModels].map(model => model.id).sort()).toEqual([
      'nearby',
      'selected',
    ]);
  });

  test('falls back to the nearest viewport block when nothing is selected', () => {
    expect('getLowZoomGestureActiveModels' in viewportElementModule).toBe(true);

    const getLowZoomGestureActiveModels = (
      viewportElementModule as {
        getLowZoomGestureActiveModels: (params: {
          selectedModels: Set<{ id: string; elementBound: Bound }>;
          viewportModels: Set<{ id: string; elementBound: Bound }>;
          viewportBounds: Bound;
          nearbyActiveBlockLimit: number;
          nearbyDistanceRatio: number;
        }) => Set<{ id: string; elementBound: Bound }>;
      }
    ).getLowZoomGestureActiveModels;

    const nearest = createFakeBlockModel('nearest', 46, 46);
    const farther = createFakeBlockModel('farther', 78, 78);

    const activeModels = getLowZoomGestureActiveModels({
      selectedModels: new Set(),
      viewportModels: new Set([nearest, farther]),
      viewportBounds: new Bound(0, 0, 100, 100),
      nearbyActiveBlockLimit: 1,
      nearbyDistanceRatio: 0.35,
    });

    expect([...activeModels].map(model => model.id)).toEqual(['nearest']);
  });

  test('starts post-gesture recovery immediately once gesture signals fully settle', () => {
    expect('getPostGestureRecoveryDelay' in viewportModule).toBe(true);

    const getPostGestureRecoveryDelay = (
      viewportModule as {
        getPostGestureRecoveryDelay: (params: {
          isPanning: boolean;
          isZooming: boolean;
          fallbackDelayMs: number;
        }) => number;
      }
    ).getPostGestureRecoveryDelay;

    expect(
      getPostGestureRecoveryDelay({
        isPanning: false,
        isZooming: false,
        fallbackDelayMs: 220,
      })
    ).toBe(0);
  });

  test('keeps fallback post-gesture delay while a gesture signal is still active', () => {
    expect('getPostGestureRecoveryDelay' in viewportModule).toBe(true);

    const getPostGestureRecoveryDelay = (
      viewportModule as {
        getPostGestureRecoveryDelay: (params: {
          isPanning: boolean;
          isZooming: boolean;
          fallbackDelayMs: number;
        }) => number;
      }
    ).getPostGestureRecoveryDelay;

    expect(
      getPostGestureRecoveryDelay({
        isPanning: true,
        isZooming: false,
        fallbackDelayMs: 220,
      })
    ).toBe(220);
    expect(
      getPostGestureRecoveryDelay({
        isPanning: false,
        isZooming: true,
        fallbackDelayMs: 220,
      })
    ).toBe(220);
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
    const previousTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = 'light';

    try {
      viewportRuntimeConfig.CANVAS_DPR_CAP_BY_ZOOM = [
        [0.5, 1],
        [0.8, 2],
      ];
      setDevicePixelRatio(2);

      const canvas = document.createElement('canvas');
      const fillRect = vi.fn();
      const strokeRect = vi.fn();
      let fillStyle = '';
      let strokeStyle = '';
      vi.spyOn(canvas, 'getContext').mockReturnValue({
        get fillStyle() {
          return fillStyle;
        },
        set fillStyle(value: string) {
          fillStyle = value;
        },
        get strokeStyle() {
          return strokeStyle;
        },
        set strokeStyle(value: string) {
          strokeStyle = value;
        },
        fillRect,
        strokeRect,
      } as unknown as CanvasRenderingContext2D);

      const layout: ViewportLayoutTree = {
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

      const paintPlaceholderForTest =
        paintPlaceholder as unknown as PaintPlaceholderForTest;

      paintPlaceholderForTest(canvas, layout, {
        zoom: 0.4,
        toViewCoord: () => [0, 0],
      });

      expect(fillStyle).toBe('rgba(0, 0, 0, 0.04)');
      expect(strokeStyle).toBe('rgba(0, 0, 0, 0.02)');
      expect(fillRect).toHaveBeenLastCalledWith(0, 0, 20, 8);

      paintPlaceholderForTest(canvas, layout, {
        zoom: 0.95,
        toViewCoord: () => [0, 0],
      });

      expect(fillRect).toHaveBeenLastCalledWith(0, 0, 95, 38);
    } finally {
      document.documentElement.dataset.theme = previousTheme;
    }
  });
});
