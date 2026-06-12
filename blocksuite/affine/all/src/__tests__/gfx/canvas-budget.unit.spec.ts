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

  test('shares one bypass decision for placeholder and render paths across the low-zoom iOS landscape danger window and idle steady state', () => {
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
    ).toBe(true);
    expect(
      shouldBypassStackingCanvasesDuringLowZoomGesture({
        isIOS: true,
        zoom: 0.4,
        gestureActive: false,
        recoveryActive: false,
        viewportWidth: 932,
        viewportHeight: 430,
      })
    ).toBe(true);
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

  test('idle low-zoom landscape bypass detaches stacking canvases through the existing attachment path', () => {
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
      gestureActive: false,
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

  test('uses overscan only for main-canvas fallback culling while keeping the render origin on the exact viewport', () => {
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
      renderBound: viewportBounds,
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

  test('records surface canvas diagnostic maxima for AFFiNE-DIAG windows', () => {
    expect('recordSurfaceCanvasDiagCounters' in canvasRendererModule).toBe(
      true
    );

    const recordSurfaceCanvasDiagCounters = (
      canvasRendererModule as {
        recordSurfaceCanvasDiagCounters: (
          counters: Record<string, number>,
          metrics: {
            placeholderElementCount: number;
            fallbackElementCount: number;
            visibleStackingCanvasCount: number;
            dirtyLayerRenderCount: number;
          }
        ) => void;
      }
    ).recordSurfaceCanvasDiagCounters;

    const counters: Record<string, number> = {};

    recordSurfaceCanvasDiagCounters(counters, {
      placeholderElementCount: 4,
      fallbackElementCount: 2,
      visibleStackingCanvasCount: 3,
      dirtyLayerRenderCount: 1,
    });
    recordSurfaceCanvasDiagCounters(counters, {
      placeholderElementCount: 0,
      fallbackElementCount: 5,
      visibleStackingCanvasCount: 1,
      dirtyLayerRenderCount: 4,
    });

    expect(counters.surfaceCanvasRenderCount).toBe(2);
    expect(counters.surfaceCanvasPlaceholderPassCount).toBe(1);
    expect(counters.surfaceCanvasPlaceholderElementCountMax).toBe(4);
    expect(counters.surfaceCanvasFallbackElementCountMax).toBe(5);
    expect(counters.surfaceCanvasVisibleStackingCanvasCountMax).toBe(3);
    expect(counters.surfaceCanvasDirtyLayerRenderCountMax).toBe(4);
  });

  test('records surface canvas refresh-gap counters for AFFiNE-DIAG windows', () => {
    expect('recordSurfaceCanvasRefreshGapCounter' in canvasRendererModule).toBe(
      true
    );

    const recordSurfaceCanvasRefreshGapCounter = (
      canvasRendererModule as {
        recordSurfaceCanvasRefreshGapCounter: (
          counters: Record<string, number>,
          event:
            | 'viewport-skip-refresh'
            | 'deferred-refresh-scheduled'
            | 'deferred-refresh-rescheduled'
        ) => void;
      }
    ).recordSurfaceCanvasRefreshGapCounter;

    const counters: Record<string, number> = {};

    recordSurfaceCanvasRefreshGapCounter(counters, 'viewport-skip-refresh');
    recordSurfaceCanvasRefreshGapCounter(counters, 'viewport-skip-refresh');
    recordSurfaceCanvasRefreshGapCounter(
      counters,
      'deferred-refresh-scheduled'
    );
    recordSurfaceCanvasRefreshGapCounter(
      counters,
      'deferred-refresh-rescheduled'
    );
    recordSurfaceCanvasRefreshGapCounter(
      counters,
      'deferred-refresh-scheduled'
    );

    expect(counters.surfaceCanvasViewportSkipRefreshCount).toBe(2);
    expect(counters.surfaceCanvasDeferredRefreshScheduledCount).toBe(2);
    expect(counters.surfaceCanvasDeferredRefreshRescheduledCount).toBe(1);
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

    expect(fillStyle).toBe('rgba(0, 0, 0, 0.04)');
    expect(strokeStyle).toBe('rgba(0, 0, 0, 0.02)');
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
