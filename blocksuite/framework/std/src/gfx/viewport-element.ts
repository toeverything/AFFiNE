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
     * container-level transform on <gfx-viewport>; idle blocks never change
     * their own transform during the gesture. 'will-change: transform' is
     * harmful here: WKWebView promotes every hidden idle block to its own
     * compositing layer, producing stalls that terminate the web content process.
     */
    gfx-viewport[data-skip-gesture-refresh] .block-idle {
      will-change: auto;
    }

    /* CSS for active blocks participating in viewport transformations */
    .block-active {
      visibility: visible;
      pointer-events: auto;
    }
  `;

  private readonly _hideOutsideAndNoSelectedBlock = () => {
    if (!this.host) return;

    const gfx = this.host.std.get(GfxControllerIdentifier);
    const currentViewportModels = this.getModelsInViewport();
    const currentSelectedModels = this._getSelectedModels();
    const shouldBeVisible = new Set([
      ...currentViewportModels,
      ...currentSelectedModels,
    ]);

    const previousVisible = this._lastVisibleModels
      ? new Set(this._lastVisibleModels)
      : new Set<GfxBlockElementModel>();

    batch(() => {
      // Step 1: Activate all the blocks that should be visible
      shouldBeVisible.forEach(model => {
        const view = gfx.view.get(model);
        if (!isGfxBlockComponent(view)) return;
        view.transformState$.value = 'active';
      });

      // Step 2: Hide all the blocks that should not be visible
      previousVisible.forEach(model => {
        if (shouldBeVisible.has(model)) return;

        const view = gfx.view.get(model);
        if (!isGfxBlockComponent(view)) return;
        view.transformState$.value = 'idle';
      });
    });

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

    const gfx = this.host.std.get(GfxControllerIdentifier);
    const currentViewportModels = this.getModelsInViewport();
    const currentSelectedModels = this._getSelectedModels();
    const shouldBeVisible = new Set([
      ...currentViewportModels,
      ...currentSelectedModels,
    ]);

    const previousVisible = this._lastVisibleModels
      ? new Set(this._lastVisibleModels)
      : new Set<GfxBlockElementModel>();

    const toActivate: GfxBlockElementModel[] = [];
    shouldBeVisible.forEach(model => {
      if (!previousVisible.has(model)) {
        toActivate.push(model);
      } else {
        const view = gfx.view.get(model);
        if (
          isGfxBlockComponent(view) &&
          view.transformState$.value !== 'active'
        ) {
          toActivate.push(model);
        }
      }
    });

    const toHide: GfxBlockElementModel[] = [];
    previousVisible.forEach(model => {
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

      batch(() => {
        for (let i = start; i < end; i++) {
          const view = gfx.view.get(toActivate[i]);
          if (!isGfxBlockComponent(view)) continue;
          view.transformState$.value = 'active';
        }
      });

      chunkIndex++;
      if (chunkIndex * CHUNK_SIZE < toActivate.length) {
        rafId = requestAnimationFrame(processNextChunk);
      } else {
        onComplete?.();
      }
    };

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
      this._refreshViewport();
    }, this._maxInterval);
  }

  private _refreshViewportByViewportUpdate(update: {
    zoom: number;
    center: [number, number];
  }) {
    // When SKIP_REFRESH_DURING_GESTURE is enabled, defer all DOM mutations
    // until panning/zooming ends
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

    // When SKIP_REFRESH_DURING_GESTURE is enabled, use container-level CSS
    // transform during gestures and chunked post-gesture recovery.
    if (this.viewport.SKIP_REFRESH_DURING_GESTURE) {
      this.dataset.skipGestureRefresh = '';
      let pendingTimerId: ReturnType<typeof setTimeout> | null = null;
      let cancelChunked: (() => void) | null = null;

      let gestureBaseZoom: number | null = null;
      let gestureBaseTranslateX: number | null = null;
      let gestureBaseTranslateY: number | null = null;
      let gestureRAF: number | null = null;
      let lastTransformTime = 0;

      const MIN_TRANSFORM_INTERVAL = 32;

      const applyContainerTransform = () => {
        gestureRAF = null;
        if (gestureBaseZoom === null) return;
        const { zoom, translateX, translateY } = this.viewport;
        const relativeScale = zoom / gestureBaseZoom;
        const isPureTranslate = Math.abs(relativeScale - 1) < 1e-3;
        const now = performance.now();
        if (
          !isPureTranslate &&
          now - lastTransformTime < MIN_TRANSFORM_INTERVAL
        ) {
          gestureRAF = requestAnimationFrame(applyContainerTransform);
          return;
        }
        lastTransformTime = now;
        const dx = translateX - relativeScale * gestureBaseTranslateX!;
        const dy = translateY - relativeScale * gestureBaseTranslateY!;
        this.style.transform = isPureTranslate
          ? `translate(${dx}px, ${dy}px)`
          : `translate(${dx}px, ${dy}px) scale(${relativeScale})`;
        this.style.transformOrigin = '0 0';
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
          if (this.viewport.panning$.value || this.viewport.zooming$.value) {
            scheduleIdleRefresh();
            return;
          }
          clearContainerTransform();
          this._lastViewportRefreshTime = performance.now();
          cancelChunked = this._chunkedHideOutsideAndNoSelectedBlock(() => {
            cancelChunked = null;
            this.viewport.viewportUpdated.next({
              zoom: this.viewport.zoom,
              center: [this.viewport.centerX, this.viewport.centerY],
            });
          });
        }, viewportRuntimeConfig.POST_GESTURE_REFRESH_DELAY);
      };

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
