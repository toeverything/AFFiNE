import type { Container } from '@blocksuite/global/di';
import { DisposableGroup } from '@blocksuite/global/disposable';
import { ConfigExtensionFactory } from '@blocksuite/std';
import {
  type GfxController,
  GfxExtension,
  GfxExtensionIdentifier,
  type GfxViewportElement,
} from '@blocksuite/std/gfx';
import {
  BehaviorSubject,
  distinctUntilChanged,
  merge,
  Subject,
  take,
  tap,
  timer,
} from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import {
  debugLog,
  getViewportLayoutTree,
  paintPlaceholder,
  syncCanvasSize,
} from './renderer-utils';
import type {
  MessagePaint,
  RendererOptions,
  RenderingState,
  TurboRendererConfig,
  ViewportLayoutTree,
  WorkerToHostMessage,
} from './types';

const debug = false; // Toggle for debug logs

const defaultOptions = {
  zoomThreshold: 1, // With high enough zoom, fallback to DOM rendering
  debounceTime: 1000, // During this period, fallback to DOM
  enableBitmapRendering: false, // When enabled, the bitmap rendering will be used
  postZoomDelay: 100,
};

export const TurboRendererConfigFactory =
  ConfigExtensionFactory<TurboRendererConfig>('viewport-turbo-renderer');

/**
 * Manages the Turbo Rendering process for the viewport, coordinating between the main thread and a painter worker.
 * Turbo Rendering optimizes performance by rendering block content onto a canvas bitmap,
 * falling back to standard DOM rendering during interactions.
 *
 * To add Turbo Rendering support for a new block type (e.g., 'affine:my-block'):
 *
 * 1.  **In the block's package (e.g., `blocksuite/affine/blocks/my-block`):**
 *   a.  Add `@blocksuite/affine/gfx/turbo-renderer` as a dependency in `package.json` and create a `src/turbo` directory.
 *   b.  Implement the Layout Handler (e.g., `MyBlockLayoutHandlerExtension`) and Painter Worker (e.g., `MyBlockLayoutPainterExtension`). Refer to `ParagraphLayoutHandlerExtension` and `ParagraphLayoutPainterExtension` in `blocksuite/affine/blocks/block-paragraph` for implementation examples.
 *   c.  Export the Layout Handler and Painter Worker extensions from the block package's main `src/index.ts` by adding these two explicit export statements:
 *       ```typescript
 *       export * from './turbo/my-block-layout-handler';
 *       export * from './turbo/my-block-painter.worker';
 *       ```
 *   d.  Add an export mapping for the painter worker in `package.json` under the `exports` field (e.g., `"./turbo-painter": "./src/turbo/my-block-painter.worker.ts"`).
 *   e.  Add a TypeScript project reference to `blocksuite/affine/gfx/turbo-renderer` in `tsconfig.json`.
 *
 * 2.  **In the application integration point (e.g., `packages/frontend/core/src/blocksuite/extensions` and `blocksuite/integration-test/src/__tests__/utils/renderer-entry.ts`):**
 *   a.  In `turbo-renderer.ts` (or the file setting up `TurboRendererConfigFactory`):
 *     - Import and add the new Layout Handler extension to the `patchTurboRendererExtension` array (or equivalent DI setup). See how `ParagraphLayoutHandlerExtension` is added as a reference.
 *   b.  In `turbo-painter.worker.ts` (the painter worker entry point):
 *     - Import and add the new Painter Worker extension to the `ViewportLayoutPainter` constructor's extension array. See how `ParagraphLayoutPainterExtension` is added as a reference.
 *
 * 3.  **Run `yarn affine init`** from the workspace root to update generated configuration files (`workspace.gen.ts`) and the lockfile (`yarn.lock`).
 *
 * **Note:** Always ensure the directory structure and export patterns match the `paragraph` block (`blocksuite/affine/blocks/block-paragraph`) for consistency.
 */
export class ViewportTurboRendererExtension extends GfxExtension {
  static override key = 'viewportTurboRenderer';

  public readonly state$ = new BehaviorSubject<RenderingState>('inactive');
  public readonly canvas: HTMLCanvasElement = document.createElement('canvas');
  public layoutCacheData: ViewportLayoutTree | null = null;
  public optimizedBlockIds: string[] = [];
  private readonly worker: Worker;
  private readonly disposables = new DisposableGroup();
  private layoutVersion = 0;
  private bitmap: ImageBitmap | null = null;
  private viewportElement: GfxViewportElement | null = null;
  private readonly refresh$ = new Subject<void>();
  private readonly isRecentlyZoomed$ = new BehaviorSubject<boolean>(false);

  public get currentState(): RenderingState {
    return this.state$.value;
  }

  constructor(gfx: GfxController) {
    super(gfx);

    const id = TurboRendererConfigFactory.identifier;
    const config = this.std.getOptional(id);
    if (!config) {
      throw new Error('TurboRendererConfig not found');
    }
    this.worker = config.painterWorkerEntry();

    // Set up state change logging
    this.state$
      .pipe(
        distinctUntilChanged(),
        tap(state => this.debugLog(`State changed to: ${state}`))
      )
      .subscribe();

    // Set up debounced refresh
    this.refresh$
      .pipe(debounceTime(this.options.debounceTime))
      .subscribe(() => {
        this.refresh().catch(console.error);
      });
  }

  static override extendGfx(gfx: GfxController) {
    Object.defineProperty(gfx, 'turboRenderer', {
      get() {
        return gfx.std.get(ViewportTurboRendererIdentifier);
      },
    });
  }

  static override setup(di: Container) {
    super.setup(di);
  }

  get options(): RendererOptions {
    const id = TurboRendererConfigFactory.identifier;
    const { options } = this.std.getOptional(id) || {};
    return {
      ...defaultOptions,
      ...options,
    };
  }

  override mounted() {
    const mountPoint = document.querySelector('.affine-edgeless-viewport');
    if (mountPoint) {
      mountPoint.append(this.canvas);
    }

    this.viewport.elementReady.pipe(take(1)).subscribe(element => {
      this.viewportElement = element;
      syncCanvasSize(this.canvas, this.std.host);
      this.state$.next('pending');

      this.disposables.add(
        this.viewport.sizeUpdated.subscribe(() => this.handleResize())
      );

      this.disposables.add(
        this.viewport.viewportUpdated.subscribe(() => {
          this.refresh().catch(console.error);
        })
      );

      this.disposables.add(
        this.viewport.zooming$
          .pipe(
            tap(isZooming => {
              this.debugLog(`Zooming signal changed: ${isZooming}`);
              if (isZooming) {
                this.state$.next('zooming');
              } else if (this.state$.value === 'zooming') {
                this.clearOptimizedBlocks();
                this.isRecentlyZoomed$.next(true);
                this.disposables.add(
                  timer(defaultOptions.postZoomDelay).subscribe(() => {
                    this.isRecentlyZoomed$.next(false);
                  })
                );

                this.state$.next('pending');
                this.refresh().catch(console.error);
              }
            })
          )
          .subscribe()
      );
    });

    // Handle selection and block updates
    const selectionUpdates$ = this.selection.slots.updated;
    const blockUpdates$ = this.std.store.slots.blockUpdated;

    // Combine all events that should trigger invalidation
    this.disposables.add(
      merge(selectionUpdates$, blockUpdates$).subscribe(() => this.invalidate())
    );
  }

  override unmounted() {
    this.debugLog('Unmounting renderer');
    this.clearBitmap();
    this.clearOptimizedBlocks();
    this.worker.terminate();
    this.canvas.remove();
    this.disposables.dispose();
    this.state$.next('inactive');
    this.state$.complete();
    this.refresh$.complete();
  }

  get viewport() {
    return this.gfx.viewport;
  }

  get selection() {
    return this.gfx.selection;
  }

  get layoutCache() {
    if (this.layoutCacheData) return this.layoutCacheData;
    const layoutTree = getViewportLayoutTree(this.std.host, this.viewport);
    this.debugLog('Layout cache updated');
    return (this.layoutCacheData = layoutTree);
  }

  async refresh() {
    if (this.state$.value === 'inactive') return;

    this.clearCanvas();

    // Determine the next state based on current conditions
    let nextState: RenderingState;

    if (this.viewport.zoom > this.options.zoomThreshold) {
      this.debugLog('Zoom above threshold, falling back to DOM rendering');
      nextState = 'pending';
      this.clearOptimizedBlocks();
    } else if (this.isZooming()) {
      this.debugLog('Currently zooming, using placeholder rendering');
      nextState = 'zooming';
      this.paintPlaceholder();
      this.updateOptimizedBlocks();
    } else if (this.canUseBitmapCache()) {
      this.debugLog('Using cached bitmap');
      nextState = 'ready';
      this.drawCachedBitmap();
    } else {
      this.debugLog('Starting bitmap rendering');
      nextState = 'rendering';
      this.state$.next(nextState);
      await this.paintLayout();
      this.drawCachedBitmap();
      // After rendering completes, transition to ready state
      nextState = 'ready';
    }

    this.state$.next(nextState);
  }

  invalidate() {
    this.layoutVersion++;
    this.layoutCacheData = null;
    this.clearBitmap();
    this.clearCanvas();
    this.clearOptimizedBlocks();
    this.state$.next('pending');
    this.debugLog(`Invalidated renderer (layoutVersion=${this.layoutVersion})`);
  }

  private debugLog(message: string) {
    if (!debug) return;
    debugLog(message, this.state$.value);
  }

  private clearBitmap() {
    if (!this.bitmap) return;
    this.bitmap.close();
    this.bitmap = null;
    this.debugLog('Bitmap cleared');
  }

  private async paintLayout(): Promise<void> {
    return new Promise(resolve => {
      if (!this.worker || !this.options.enableBitmapRendering) {
        resolve();
        return;
      }

      const layout = this.layoutCache;
      const dpr = window.devicePixelRatio;
      const currentVersion = this.layoutVersion;

      this.debugLog(`Requesting bitmap painting (version=${currentVersion})`);
      const message: MessagePaint = {
        type: 'paintLayout',
        data: {
          layout,
          width: layout.overallRect.w,
          height: layout.overallRect.h,
          dpr,
          zoom: this.viewport.zoom,
          version: currentVersion,
        },
      };
      this.worker.postMessage(message);

      this.worker.onmessage = (e: MessageEvent<WorkerToHostMessage>) => {
        if (e.data.type === 'bitmapPainted') {
          if (e.data.version === this.layoutVersion) {
            this.debugLog(
              `Bitmap painted successfully (version=${e.data.version})`
            );
            this.clearBitmap();
            this.bitmap = e.data.bitmap;
            this.state$.next('ready');
            resolve();
          } else {
            this.debugLog(
              `Received outdated bitmap (got=${e.data.version}, current=${this.layoutVersion})`
            );
            e.data.bitmap.close();
            this.state$.next('pending');
            resolve();
          }
        } else if (e.data.type === 'paintError') {
          this.debugLog(
            `Paint error: ${e.data.error} for blockType: ${e.data.blockType}`
          );
          this.state$.next('pending');
          resolve();
        }
      };
    });
  }

  public canUseBitmapCache(): boolean {
    if (!this.options.enableBitmapRendering || this.isZooming()) return false;
    return !!(this.layoutCache && this.bitmap);
  }

  private isZooming(): boolean {
    return this.viewport.zooming$.value;
  }

  private clearCanvas() {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.debugLog('Canvas cleared');
  }

  private drawCachedBitmap() {
    if (!this.options.enableBitmapRendering || !this.bitmap) {
      this.debugLog(
        'Bitmap drawing skipped (disabled or no cached bitmap available)'
      );
      return;
    }

    const layout = this.layoutCache;
    const bitmap = this.bitmap;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    this.clearCanvas();

    const layoutViewCoord = this.viewport.toViewCoord(
      layout.overallRect.x,
      layout.overallRect.y
    );

    ctx.drawImage(
      bitmap,
      layoutViewCoord[0] * window.devicePixelRatio,
      layoutViewCoord[1] * window.devicePixelRatio,
      layout.overallRect.w * window.devicePixelRatio * this.viewport.zoom,
      layout.overallRect.h * window.devicePixelRatio * this.viewport.zoom
    );

    this.debugLog('Bitmap drawn to canvas');
  }

  private canOptimize(): boolean {
    if (this.isRecentlyZoomed$.value) return false;

    const isBelowZoomThreshold =
      this.viewport.zoom <= this.options.zoomThreshold;
    return this.state$.value === 'zooming' && isBelowZoomThreshold;
  }

  private updateOptimizedBlocks() {
    if (!this.canOptimize()) return;
    requestAnimationFrame(() => {
      if (!this.viewportElement || !this.layoutCache) return;
      const blockElements = this.viewportElement.getModelsInViewport();
      const blockIds = Array.from(blockElements).map(model => model.id);

      // Set all previously optimized blocks to active first
      if (this.optimizedBlockIds.length > 0) {
        this.viewportElement.setBlocksActive(this.optimizedBlockIds);
      }
      // Now set the new blocks to idle (hidden)
      this.optimizedBlockIds = blockIds;
      this.viewportElement.setBlocksIdle(blockIds);

      this.debugLog(`Optimized ${blockIds.length} blocks`);
    });
  }

  private clearOptimizedBlocks() {
    if (!this.viewportElement || this.optimizedBlockIds.length === 0) return;

    this.viewportElement.setBlocksActive(this.optimizedBlockIds);
    this.optimizedBlockIds = [];
    this.debugLog('Cleared optimized blocks');
  }

  private handleResize() {
    this.debugLog('Container resized, syncing canvas size');
    syncCanvasSize(this.canvas, this.std.host);
    this.invalidate();
    this.refresh$.next();
  }

  private paintPlaceholder() {
    paintPlaceholder(this.canvas, this.layoutCache, this.viewport);
  }
}

export const ViewportTurboRendererIdentifier = GfxExtensionIdentifier(
  'viewportTurboRenderer'
);
