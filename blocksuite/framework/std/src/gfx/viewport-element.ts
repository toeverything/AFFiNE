import { WithDisposable } from '@blocksuite/global/lit';
import { batch } from '@preact/signals-core';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';

import {
  type EditorHost,
  isGfxBlockComponent,
  ShadowlessElement,
} from '../view';
import { PropTypes, requiredProperties } from '../view/decorators/required';
import { GfxControllerIdentifier } from './identifiers';
import { GfxBlockElementModel } from './model/gfx-block-model';
import { Viewport, viewportRuntimeConfig } from './viewport';

/**
 * A wrapper around `requestConnectedFrame` that only calls at most once in one frame
 */
export function requestThrottledConnectedFrame<
  T extends (...args: unknown[]) => void,
>(func: T, element?: HTMLElement): T {
  let raqId: number | undefined = undefined;
  let latestArgs: unknown[] = [];

  return ((...args: unknown[]) => {
    latestArgs = args;

    if (raqId === undefined) {
      raqId = requestAnimationFrame(() => {
        raqId = undefined;

        if (!element || element.isConnected) {
          func(...latestArgs);
        }
      });
    }
  }) as T;
}

export function getGestureTransformMinInterval({
  isPureTranslate,
  zoom,
}: {
  isPureTranslate: boolean;
  zoom: number;
}) {
  if (!isPureTranslate) {
    return 32;
  }

  return zoom <= 0.5 ? 32 : 0;
}

export function shouldSkipGestureTransformWrite({
  isPureTranslate,
  zoom,
  elapsedMs,
}: {
  isPureTranslate: boolean;
  zoom: number;
  elapsedMs: number;
}) {
  const minInterval = getGestureTransformMinInterval({
    isPureTranslate,
    zoom,
  });

  return minInterval > 0 && elapsedMs < minInterval;
}

const LOW_ZOOM_BLOCK_SURVIVAL_THRESHOLD = 0.5;

export function shouldUseLowZoomBlockSurvivalMode({
  zoom,
  skipRefreshDuringGesture,
}: {
  zoom: number;
  skipRefreshDuringGesture: boolean;
}) {
  return skipRefreshDuringGesture && zoom <= LOW_ZOOM_BLOCK_SURVIVAL_THRESHOLD;
}

type AffineDiagCounters = {
  gestureTransformWrites?: number;
  gestureTransformSkips?: number;
  pureTranslateWrites?: number;
  pureTranslateSkips?: number;
  viewportRefreshCalls?: number;
  viewportTrailingRefreshCalls?: number;
  viewportChunkedRefreshCalls?: number;
  blockActivateCount?: number;
  blockDeactivateCount?: number;
};

function getAffineDiagCounters() {
  const win = globalThis as typeof globalThis & {
    __affineDiagCounters?: AffineDiagCounters;
  };

  return (win.__affineDiagCounters ??= {});
}

@requiredProperties({
  viewport: PropTypes.instanceOf(Viewport),
})
export class GfxViewportElement extends WithDisposable(ShadowlessElement) {
  private static readonly VIEWPORT_REFRESH_PIXEL_THRESHOLD = 18;

  private static readonly VIEWPORT_REFRESH_MAX_INTERVAL = 120;

  private get _pixelThreshold() {
    return (
      this.viewport?.VIEWPORT_REFRESH_PIXEL_THRESHOLD ??
      GfxViewportElement.VIEWPORT_REFRESH_PIXEL_THRESHOLD
    );
  }

  private get _maxInterval() {
    return (
      this.viewport?.VIEWPORT_REFRESH_MAX_INTERVAL ??
      GfxViewportElement.VIEWPORT_REFRESH_MAX_INTERVAL
    );
  }

  static override styles = css`
    gfx-viewport {
      position: absolute;
      left: 0;
      top: 0;
      contain: size layout style;
      display: block;
      transform: none;
    }

    /* CSS for idle blocks that are hidden but maintain layout */
    .block-idle {
      visibility: hidden;
      pointer-events: none;
      will-change: transform;
      contain: size layout style;
    }

    /*
     * Mobile (SKIP_REFRESH_DURING_GESTURE) drives gestures with a single
     * container-level transform on <gfx-viewport>; the idle blocks never
     * change their own transform during the gesture. In that mode
     * 'will-change: transform' is actively harmful: WKWebView promotes every
     * hidden idle block (100+) to its own compositing layer and re-transforms
     * all of them each frame, producing a ~100ms main-thread/compositor stall
     * that terminates the web content process. Releasing the hint lets them
     * ride along as raster content of the single container layer.
     * Desktop (no attribute) keeps will-change because it transforms blocks
     * individually per frame, where the hint is a real win.
     */
    gfx-viewport[data-skip-gesture-refresh] .block-idle {
      will-change: auto;
    }

    /* CSS for active blocks participating in viewport transformations */
    .block-active {
      visibility: visible;
      pointer-events: auto;
    }

    /* Survival blocks stay visually mounted but stop participating in input. */
    .block-survival {
      visibility: visible;
      pointer-events: none;
    }
  `;

  private readonly _hideOutsideAndNoSelectedBlock = () => {
    if (!this.host) return;

    const gfx = this.host.std.get(GfxControllerIdentifier);
    const currentViewportModels = this.getModelsInViewport();
    const currentSelectedModels = this._getSelectedModels();
    const shouldUseSurvivalMode = shouldUseLowZoomBlockSurvivalMode({
      zoom: this.viewport.zoom,
      skipRefreshDuringGesture: this.viewport.SKIP_REFRESH_DURING_GESTURE,
    });
    const shouldBeVisible = new Set([
      ...currentViewportModels,
      ...currentSelectedModels,
    ]);

    const previousVisible = this._lastVisibleModels
      ? new Set(this._lastVisibleModels)
      : new Set<GfxBlockElementModel>();
    const candidatesToHide = new Set(previousVisible);

    if (!this._lastVisibleModels) {
      this.host.std.view.views.forEach(view => {
        if (!isGfxBlockComponent(view)) return;
        candidatesToHide.add(view.model);
      });
    }

    const diagCounters = getAffineDiagCounters();
    let activatedCount = 0;
    let deactivatedCount = 0;

    batch(() => {
      shouldBeVisible.forEach(model => {
        const view = gfx.view.get(model);
        if (!isGfxBlockComponent(view)) return;
        view.transformState$.value =
          shouldUseSurvivalMode && !currentSelectedModels.has(model)
            ? 'survival'
            : 'active';
        activatedCount++;
      });

      candidatesToHide.forEach(model => {
        if (shouldBeVisible.has(model)) return;

        const view = gfx.view.get(model);
        if (!isGfxBlockComponent(view)) return;
        view.transformState$.value = 'idle';
        deactivatedCount++;
      });
    });

    diagCounters.viewportRefreshCalls =
      (diagCounters.viewportRefreshCalls ?? 0) + 1;
    diagCounters.blockActivateCount =
      (diagCounters.blockActivateCount ?? 0) + activatedCount;
    diagCounters.blockDeactivateCount =
      (diagCounters.blockDeactivateCount ?? 0) + deactivatedCount;

    this._lastVisibleModels = shouldBeVisible;
  };

  /**
   * Chunked version of _hideOutsideAndNoSelectedBlock that processes blocks
   * in batches across multiple frames to prevent memory spikes on mobile.
   * Returns a cancel function.
   */
  private _chunkedHideOutsideAndNoSelectedBlock(
    onComplete?: () => void
  ): () => void {
    if (!this.host) return () => {};

    const diagCounters = getAffineDiagCounters();
    diagCounters.viewportChunkedRefreshCalls =
      (diagCounters.viewportChunkedRefreshCalls ?? 0) + 1;

    const gfx = this.host.std.get(GfxControllerIdentifier);
    const currentViewportModels = this.getModelsInViewport();
    const currentSelectedModels = this._getSelectedModels();
    const shouldUseSurvivalMode = shouldUseLowZoomBlockSurvivalMode({
      zoom: this.viewport.zoom,
      skipRefreshDuringGesture: this.viewport.SKIP_REFRESH_DURING_GESTURE,
    });
    const shouldBeVisible = new Set([
      ...currentViewportModels,
      ...currentSelectedModels,
    ]);

    const previousVisible = this._lastVisibleModels
      ? new Set(this._lastVisibleModels)
      : new Set<GfxBlockElementModel>();
    const candidatesToHide = new Set(previousVisible);

    if (!this._lastVisibleModels) {
      this.host.std.view.views.forEach(view => {
        if (!isGfxBlockComponent(view)) return;
        candidatesToHide.add(view.model);
      });
    }

    // Compute which blocks need activation and which need hiding
    const toActivate: GfxBlockElementModel[] = [];
    shouldBeVisible.forEach(model => {
      if (!previousVisible.has(model)) {
        toActivate.push(model);
      } else {
        // Already visible, just ensure state is correct
        const view = gfx.view.get(model);
        if (!isGfxBlockComponent(view)) {
          return;
        }
        const targetState =
          shouldUseSurvivalMode && !currentSelectedModels.has(model)
            ? 'survival'
            : 'active';
        if (view.transformState$.value !== targetState) {
          toActivate.push(model);
        }
      }
    });

    const toHide: GfxBlockElementModel[] = [];
    candidatesToHide.forEach(model => {
      if (!shouldBeVisible.has(model)) {
        toHide.push(model);
      }
    });

    this._lastVisibleModels = shouldBeVisible;

    // Hide blocks immediately (cheap: just sets visibility:hidden)
    if (toHide.length > 0) {
      batch(() => {
        toHide.forEach(model => {
          const view = gfx.view.get(model);
          if (!isGfxBlockComponent(view)) return;
          view.transformState$.value = 'idle';
        });
      });
    }

    diagCounters.blockDeactivateCount =
      (diagCounters.blockDeactivateCount ?? 0) + toHide.length;

    // Activate blocks in chunks to prevent memory spikes
    const CHUNK_SIZE = 8;
    let chunkIndex = 0;
    let cancelled = false;
    let rafId: number | null = null;

    const processNextChunk = () => {
      if (cancelled) return;
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, toActivate.length);

      if (start >= toActivate.length) {
        onComplete?.();
        return;
      }

      let activatedInChunk = 0;
      batch(() => {
        for (let i = start; i < end; i++) {
          const model = toActivate[i];
          const view = gfx.view.get(model);
          if (!isGfxBlockComponent(view)) continue;
          view.transformState$.value =
            shouldUseSurvivalMode && !currentSelectedModels.has(model)
              ? 'survival'
              : 'active';
          activatedInChunk++;
        }
      });

      diagCounters.blockActivateCount =
        (diagCounters.blockActivateCount ?? 0) + activatedInChunk;

      chunkIndex++;
      if (chunkIndex * CHUNK_SIZE < toActivate.length) {
        rafId = requestAnimationFrame(processNextChunk);
      } else {
        onComplete?.();
      }
    };

    // Start first chunk immediately (synchronous for responsiveness)
    if (toActivate.length > 0) {
      processNextChunk();
    } else {
      onComplete?.();
    }

    return () => {
      cancelled = true;
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    };
  }

  private _lastVisibleModels?: Set<GfxBlockElementModel>;

  private _lastViewportUpdate?: { zoom: number; center: [number, number] };

  private _lastViewportRefreshTime = 0;

  private _pendingViewportRefreshTimer: ReturnType<
    typeof globalThis.setTimeout
  > | null = null;

  private readonly _pendingChildrenUpdates: {
    id: string;
    resolve: () => void;
  }[] = [];

  private readonly _refreshViewport = requestThrottledConnectedFrame(() => {
    this._hideOutsideAndNoSelectedBlock();
  }, this);

  private _updatingChildrenFlag = false;

  private _clearPendingViewportRefreshTimer() {
    if (this._pendingViewportRefreshTimer !== null) {
      clearTimeout(this._pendingViewportRefreshTimer);
      this._pendingViewportRefreshTimer = null;
    }
  }

  private _scheduleTrailingViewportRefresh() {
    this._clearPendingViewportRefreshTimer();
    this._pendingViewportRefreshTimer = globalThis.setTimeout(() => {
      this._pendingViewportRefreshTimer = null;
      this._lastViewportRefreshTime = performance.now();
      const diagCounters = getAffineDiagCounters();
      diagCounters.viewportTrailingRefreshCalls =
        (diagCounters.viewportTrailingRefreshCalls ?? 0) + 1;
      this._refreshViewport();
    }, this._maxInterval);
  }

  private _refreshViewportByViewportUpdate(update: {
    zoom: number;
    center: [number, number];
  }) {
    // When SKIP_REFRESH_DURING_GESTURE is enabled, defer all DOM mutations
    // until panning/zooming ends to prevent main thread blocking
    if (
      this.viewport?.SKIP_REFRESH_DURING_GESTURE &&
      (this.viewport.panning$.value || this.viewport.zooming$.value)
    ) {
      this._lastViewportUpdate = {
        zoom: update.zoom,
        center: [update.center[0], update.center[1]],
      };
      return;
    }

    const now = performance.now();
    const previous = this._lastViewportUpdate;
    this._lastViewportUpdate = {
      zoom: update.zoom,
      center: [update.center[0], update.center[1]],
    };

    if (!previous) {
      this._lastViewportRefreshTime = now;
      this._refreshViewport();
      return;
    }

    const zoomChanged = Math.abs(previous.zoom - update.zoom) > 0.0001;
    const centerMovedInPixel = Math.hypot(
      (update.center[0] - previous.center[0]) * update.zoom,
      (update.center[1] - previous.center[1]) * update.zoom
    );
    const timeoutReached =
      now - this._lastViewportRefreshTime >= this._maxInterval;

    if (
      zoomChanged ||
      centerMovedInPixel >= this._pixelThreshold ||
      timeoutReached
    ) {
      this._clearPendingViewportRefreshTimer();
      this._lastViewportRefreshTime = now;
      this._refreshViewport();
      return;
    }

    this._scheduleTrailingViewportRefresh();
  }

  override connectedCallback(): void {
    super.connectedCallback();

    if (!this.enableChildrenSchedule) {
      delete this.scheduleUpdateChildren;
    }

    this._hideOutsideAndNoSelectedBlock();
    this.disposables.add(
      this.viewport.viewportUpdated.subscribe(update =>
        this._refreshViewportByViewportUpdate(update)
      )
    );
    this.disposables.add(
      this.viewport.zoomUpdated.subscribe(({ previousZoom, zoom }) => {
        const previousMode = shouldUseLowZoomBlockSurvivalMode({
          zoom: previousZoom,
          skipRefreshDuringGesture: this.viewport.SKIP_REFRESH_DURING_GESTURE,
        });
        const nextMode = shouldUseLowZoomBlockSurvivalMode({
          zoom,
          skipRefreshDuringGesture: this.viewport.SKIP_REFRESH_DURING_GESTURE,
        });

        if (previousMode !== nextMode) {
          this._hideOutsideAndNoSelectedBlock();
        }
      })
    );
    this.disposables.add(
      this.viewport.resizeStarted.subscribe(() => {
        if (
          !shouldUseLowZoomBlockSurvivalMode({
            zoom: this.viewport.zoom,
            skipRefreshDuringGesture: this.viewport.SKIP_REFRESH_DURING_GESTURE,
          })
        ) {
          return;
        }

        this._clearPendingViewportRefreshTimer();
        this._lastViewportRefreshTime = performance.now();
        this._lastVisibleModels = undefined;
        this._chunkedHideOutsideAndNoSelectedBlock();
      })
    );
    this.disposables.add(
      this.viewport.sizeUpdated.subscribe(() => {
        this._clearPendingViewportRefreshTimer();
        this._lastViewportRefreshTime = performance.now();
        // When SKIP_REFRESH_DURING_GESTURE is enabled, use chunked activation
        // on resize (orientation change) to avoid a synchronous full refresh
        // that causes white-screen flash on landscape with many elements.
        if (this.viewport.SKIP_REFRESH_DURING_GESTURE) {
          this._chunkedHideOutsideAndNoSelectedBlock(() => {
            this.viewport.viewportUpdated.next({
              zoom: this.viewport.zoom,
              center: [this.viewport.centerX, this.viewport.centerY],
            });
          });
        } else {
          this._refreshViewport();
        }
      })
    );
    this.disposables.add(
      this.host.std.view.viewUpdated.subscribe(payload => {
        if (payload.type !== 'block' || payload.method !== 'add') return;
        if (!isGfxBlockComponent(payload.view)) return;

        const currentSelectedModels = this._getSelectedModels();
        const shouldUseSurvivalMode = shouldUseLowZoomBlockSurvivalMode({
          zoom: this.viewport.zoom,
          skipRefreshDuringGesture: this.viewport.SKIP_REFRESH_DURING_GESTURE,
        });
        const isSelected = currentSelectedModels.has(payload.view.model);
        const isInViewport = this.getModelsInViewport().has(payload.view.model);

        payload.view.transformState$.value = isSelected
          ? 'active'
          : isInViewport
            ? shouldUseSurvivalMode
              ? 'survival'
              : 'active'
            : 'idle';
      })
    );

    // When SKIP_REFRESH_DURING_GESTURE is enabled, do one final refresh
    // after panning/zooming ends to sync block visibility.
    // Uses setTimeout (not requestIdleCallback) to guarantee a minimum delay
    // before heavy work starts. requestIdleCallback fires immediately when
    // idle, which doesn't protect against the "quick pause then resume" pattern.
    // Uses chunked block activation to prevent memory spikes on mobile.
    // Cancel if a new gesture starts before completion.
    if (this.viewport.SKIP_REFRESH_DURING_GESTURE) {
      // Marks this element so the stylesheet can drop 'will-change: transform'
      // from idle blocks (see styles above): in this mode the gesture is driven
      // by one container transform, so per-block layer promotion is pure
      // overhead and stalls WKWebView's compositor.
      this.dataset.skipGestureRefresh = '';
      let pendingTimerId: ReturnType<typeof setTimeout> | null = null;
      let cancelChunked: (() => void) | null = null;

      // --- Container-level CSS transform during gestures ---
      // Instead of updating N block transforms per frame (expensive),
      // apply a single CSS transform on this element that represents the
      // relative zoom/pan delta from the gesture start state.
      // This keeps WKWebView's compositor in sync with only 1 DOM write/frame.
      let gestureBaseZoom: number | null = null;
      let gestureBaseTranslateX: number | null = null;
      let gestureBaseTranslateY: number | null = null;
      let gestureRAF: number | null = null;
      let lastTransformTime = 0;
      const diagCounters = getAffineDiagCounters();

      const applyContainerTransform = () => {
        gestureRAF = null;
        if (gestureBaseZoom === null) return;
        const { zoom, translateX, translateY } = this.viewport;
        const relativeScale = zoom / gestureBaseZoom;
        const isPureTranslate = Math.abs(relativeScale - 1) < 1e-3;
        const now = performance.now();
        // Scale gestures were already throttled here. The new evidence shows the
        // crash can still happen while all editor/scroll counters stay at zero,
        // which points back to this gesture-time container transform path.
        // On iOS at far-out zoom (the 0.4 repro band), even pure translate can
        // still move a very large layer tree (17 canvases + active blocks). So
        // we now also throttle pure-translate writes in that zoom band instead of
        // assuming they are always cheap.
        if (
          shouldSkipGestureTransformWrite({
            isPureTranslate,
            zoom,
            elapsedMs: now - lastTransformTime,
          })
        ) {
          diagCounters.gestureTransformSkips =
            (diagCounters.gestureTransformSkips ?? 0) + 1;
          if (isPureTranslate) {
            diagCounters.pureTranslateSkips =
              (diagCounters.pureTranslateSkips ?? 0) + 1;
          }
          gestureRAF = requestAnimationFrame(applyContainerTransform);
          return;
        }
        lastTransformTime = now;
        // Container transform: scale changes block sizes, translate compensates
        // for the center shift. Formula: final_pos = container_translate + scale * base_pos
        // We need: container_translate + scale * base_pos = current_pos
        // => container_translate = current_translate - scale * base_translate
        const dx = translateX - relativeScale * gestureBaseTranslateX!;
        const dy = translateY - relativeScale * gestureBaseTranslateY!;
        // Pure pan (relativeScale === 1) is the common gesture and the one that
        // crashes WKWebView's compositor: a transform that carries scale() keeps
        // the layer on the "non-trivial transform" path, so WebKit re-rasterizes
        // the whole container — and with OVERSCAN_RATIO that container is ~2.9x
        // the visible area behind 17 canvas layers, which overruns the GPU
        // compositor (rafGap spikes while drift stays low). Emitting a bare
        // translate() instead routes panning through the cheap layer-move fast
        // path with no re-rasterization. The math is identical when scale === 1
        // (dx/dy already reduce to the pan delta), so this is exact, not a
        // visual approximation. scale() is only emitted for actual zoom.
        this.style.transform = isPureTranslate
          ? `translate(${dx}px, ${dy}px)`
          : `translate(${dx}px, ${dy}px) scale(${relativeScale})`;
        this.style.transformOrigin = '0 0';
        diagCounters.gestureTransformWrites =
          (diagCounters.gestureTransformWrites ?? 0) + 1;
        if (isPureTranslate) {
          diagCounters.pureTranslateWrites =
            (diagCounters.pureTranslateWrites ?? 0) + 1;
        }
      };

      const scheduleContainerTransform = () => {
        if (gestureRAF === null) {
          gestureRAF = requestAnimationFrame(applyContainerTransform);
        }
      };

      const startGestureTransform = () => {
        gestureBaseZoom = this.viewport.zoom;
        gestureBaseTranslateX = this.viewport.translateX;
        gestureBaseTranslateY = this.viewport.translateY;
        // Let the first frame of a new gesture apply immediately.
        lastTransformTime = 0;
      };

      const clearContainerTransform = () => {
        if (gestureRAF !== null) {
          cancelAnimationFrame(gestureRAF);
          gestureRAF = null;
        }
        gestureBaseZoom = null;
        gestureBaseTranslateX = null;
        gestureBaseTranslateY = null;
        this.style.transform = 'none';
      };

      // --- End-of-gesture recovery ---
      const cancelPendingRefresh = () => {
        if (pendingTimerId !== null) {
          clearTimeout(pendingTimerId);
          pendingTimerId = null;
        }
        if (cancelChunked !== null) {
          cancelChunked();
          cancelChunked = null;
        }
      };

      const scheduleIdleRefresh = () => {
        cancelPendingRefresh();
        pendingTimerId = setTimeout(() => {
          pendingTimerId = null;
          // If a gesture is still in-flight when the timer fires (e.g. inertial
          // scroll or clamped setZoom at the zoom floor keeps re-arming the
          // panning$/zooming$ debounce), do NOT drop the refresh — reschedule
          // it. Dropping here is what left connectors/elements blank until the
          // user tapped to force a synchronous refresh.
          if (this.viewport.panning$.value || this.viewport.zooming$.value) {
            scheduleIdleRefresh();
            return;
          }
          // Remove container transform before per-block update
          clearContainerTransform();
          this._lastViewportRefreshTime = performance.now();
          // Use chunked activation to spread block rendering across frames
          cancelChunked = this._chunkedHideOutsideAndNoSelectedBlock(() => {
            cancelChunked = null;
            // After all blocks are activated, emit viewportUpdated
            // to update individual block transforms
            this.viewport.viewportUpdated.next({
              zoom: this.viewport.zoom,
              center: [this.viewport.centerX, this.viewport.centerY],
            });
          });
        }, viewportRuntimeConfig.POST_GESTURE_REFRESH_DELAY);
      };

      // Listen to panning$ to drive the container transform during gestures
      // and handle end-of-gesture recovery
      this.disposables.add(
        this.viewport.panning$.subscribe(panning => {
          if (panning) {
            if (gestureBaseZoom === null) {
              startGestureTransform();
            }
            scheduleContainerTransform();
            cancelPendingRefresh();
          } else {
            scheduleIdleRefresh();
          }
        })
      );

      this.disposables.add(
        this.viewport.zooming$.subscribe(zooming => {
          if (zooming) {
            if (gestureBaseZoom === null) {
              startGestureTransform();
            }
            scheduleContainerTransform();
            cancelPendingRefresh();
          } else {
            scheduleIdleRefresh();
          }
        })
      );

      this.disposables.add({
        dispose: () => {
          cancelPendingRefresh();
          clearContainerTransform();
        },
      });
    }
  }

  override disconnectedCallback(): void {
    this._clearPendingViewportRefreshTimer();
    super.disconnectedCallback();
  }

  override render() {
    return html``;
  }

  scheduleUpdateChildren? = (id: string) => {
    const { promise, resolve } = Promise.withResolvers<void>();

    this._pendingChildrenUpdates.push({ id, resolve });

    if (!this._updatingChildrenFlag) {
      this._updatingChildrenFlag = true;
      const schedule = () => {
        if (this._pendingChildrenUpdates.length) {
          const childToUpdates = this._pendingChildrenUpdates.splice(
            0,
            this.maxConcurrentRenders
          );

          childToUpdates.forEach(({ resolve }) => resolve());

          if (this._pendingChildrenUpdates.length) {
            requestAnimationFrame(() => {
              this.isConnected && schedule();
            });
          } else {
            this._updatingChildrenFlag = false;
          }
        }
      };

      requestAnimationFrame(() => {
        this.isConnected && schedule();
      });
    }

    return promise;
  };

  private _getSelectedModels(): Set<GfxBlockElementModel> {
    if (!this.host) return new Set();
    const gfx = this.host.std.get(GfxControllerIdentifier);
    return new Set(
      gfx.selection.surfaceSelections
        .flatMap(({ elements }) => elements)
        .map(id => gfx.getElementById(id))
        .filter(e => e instanceof GfxBlockElementModel)
    );
  }

  @property({ attribute: false })
  accessor getModelsInViewport: () => Set<GfxBlockElementModel> = () =>
    new Set();

  @property({ attribute: false })
  accessor host: undefined | EditorHost;

  @property({ type: Number })
  accessor maxConcurrentRenders: number = 2;

  @property({ attribute: false })
  accessor enableChildrenSchedule: boolean = true;

  @property({ attribute: false })
  accessor viewport!: Viewport;

  setBlocksActive(blockIds: string[]): void {
    if (!this.host) return;
    const gfx = this.host.std.get(GfxControllerIdentifier);

    batch(() => {
      blockIds.forEach(id => {
        const view = gfx.view.get(id);
        if (isGfxBlockComponent(view)) {
          view.transformState$.value = 'active';
        }
      });
    });
  }

  setBlocksIdle(blockIds: string[]): void {
    if (!this.host) return;
    const gfx = this.host.std.get(GfxControllerIdentifier);

    batch(() => {
      blockIds.forEach(id => {
        const view = gfx.view.get(id);
        if (isGfxBlockComponent(view)) {
          view.transformState$.value = 'idle';
        }
      });
    });
  }
}
