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
import { Viewport } from './viewport';

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
      shouldBeVisible.forEach(model => {
        const view = gfx.view.get(model);
        if (!isGfxBlockComponent(view)) return;
        view.transformState$.value = 'active';
      });

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

    // Compute which blocks need activation and which need hiding
    const toActivate: GfxBlockElementModel[] = [];
    shouldBeVisible.forEach(model => {
      if (!previousVisible.has(model)) {
        toActivate.push(model);
      } else {
        // Already visible, just ensure state is correct
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
      this.viewport.sizeUpdated.subscribe(() => {
        this._clearPendingViewportRefreshTimer();
        this._lastViewportRefreshTime = performance.now();
        this._refreshViewport();
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

      const applyContainerTransform = () => {
        gestureRAF = null;
        if (gestureBaseZoom === null) return;
        const { zoom, translateX, translateY } = this.viewport;
        const relativeScale = zoom / gestureBaseZoom;
        // Container transform: scale changes block sizes, translate compensates
        // for the center shift. Formula: final_pos = container_translate + scale * base_pos
        // We need: container_translate + scale * base_pos = current_pos
        // => container_translate = current_translate - scale * base_translate
        const dx = translateX - relativeScale * gestureBaseTranslateX!;
        const dy = translateY - relativeScale * gestureBaseTranslateY!;
        this.style.transform = `translate(${dx}px, ${dy}px) scale(${relativeScale})`;
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
          if (!this.viewport.panning$.value && !this.viewport.zooming$.value) {
            // Remove container transform before per-block update
            clearContainerTransform();
            this._lastViewportRefreshTime = performance.now();
            // Use chunked activation to spread block rendering across frames
            cancelChunked = this._chunkedHideOutsideAndNoSelectedBlock(() => {
              cancelChunked = null;
              // After all blocks are activated, emit viewportUpdated
              // to update individual block transforms
              if (
                !this.viewport.panning$.value &&
                !this.viewport.zooming$.value
              ) {
                this.viewport.viewportUpdated.next({
                  zoom: this.viewport.zoom,
                  center: [this.viewport.centerX, this.viewport.centerY],
                });
              }
            });
          }
        }, 800);
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
