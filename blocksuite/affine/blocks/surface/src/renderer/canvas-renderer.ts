import { type Color, ColorScheme } from '@blocksuite/affine-model';
import { FeatureFlagService } from '@blocksuite/affine-shared/services';
import { requestConnectedFrame } from '@blocksuite/affine-shared/utils';
import { DisposableGroup } from '@blocksuite/global/disposable';
import {
  Bound,
  getBoundWithRotation,
  type IBound,
  intersects,
} from '@blocksuite/global/gfx';
import type { BlockStdScope } from '@blocksuite/std';
import type {
  GfxCompatibleInterface,
  GfxController,
  GfxLocalElementModel,
  GridManager,
  LayerManager,
  SurfaceBlockModel,
  Viewport,
} from '@blocksuite/std/gfx';
import { GfxControllerIdentifier } from '@blocksuite/std/gfx';
import { effect } from '@preact/signals-core';
import last from 'lodash-es/last';
import { Subject } from 'rxjs';

import type { SurfaceElementModel } from '../element-model/base.js';
import { ElementRendererIdentifier } from '../extensions/element-renderer.js';
import { RoughCanvas } from '../utils/rough/canvas.js';
import type { ElementRenderer } from './elements/index.js';
import type { Overlay } from './overlay.js';

type EnvProvider = {
  generateColorProperty: (color: Color, fallback?: Color) => string;
  getColorScheme: () => ColorScheme;
  getColorValue: (color: Color, fallback?: Color, real?: boolean) => string;
  getPropertyValue: (property: string) => string;
  selectedElements?: () => string[];
};

type RendererOptions = {
  std: BlockStdScope;
  viewport: Viewport;
  layerManager: LayerManager;
  provider?: Partial<EnvProvider>;
  enableStackingCanvas?: boolean;
  onStackingCanvasCreated?: (canvas: HTMLCanvasElement) => void;
  gridManager: GridManager;
  surfaceModel: SurfaceBlockModel;
};

export type CanvasRenderPassMetrics = {
  overlayCount: number;
  placeholderElementCount: number;
  renderByBoundCallCount: number;
  renderedElementCount: number;
  visibleElementCount: number;
};

export type CanvasMemorySnapshot = {
  bytes: number;
  datasetLayerId: string | null;
  height: number;
  kind: 'main' | 'stacking';
  width: number;
  zIndex: string;
};

export type CanvasRendererDebugMetrics = {
  canvasLayerCount: number;
  canvasMemoryBytes: number;
  canvasMemorySnapshots: CanvasMemorySnapshot[];
  canvasMemoryMegabytes: number;
  canvasPixelCount: number;
  coalescedRefreshCount: number;
  dirtyLayerRenderCount: number;
  fallbackElementCount: number;
  lastRenderDurationMs: number;
  lastRenderMetrics: CanvasRenderPassMetrics;
  maxRenderDurationMs: number;
  pooledStackingCanvasCount: number;
  refreshCount: number;
  renderCount: number;
  stackingCanvasCount: number;
  totalLayerCount: number;
  totalRenderDurationMs: number;
  visibleStackingCanvasCount: number;
};

type MutableCanvasRendererDebugMetrics = Omit<
  CanvasRendererDebugMetrics,
  | 'canvasLayerCount'
  | 'canvasMemoryBytes'
  | 'canvasMemoryMegabytes'
  | 'canvasPixelCount'
  | 'canvasMemorySnapshots'
  | 'pooledStackingCanvasCount'
  | 'stackingCanvasCount'
  | 'totalLayerCount'
  | 'visibleStackingCanvasCount'
>;

type RenderPassStats = CanvasRenderPassMetrics;

type StackingCanvasState = {
  bound: Bound | null;
  layerId: string | null;
};

type RefreshTarget =
  | { type: 'all' }
  | { type: 'main' }
  | { type: 'element'; element: SurfaceElementModel | GfxLocalElementModel }
  | {
      type: 'elements';
      elements: Array<SurfaceElementModel | GfxLocalElementModel>;
    };

const STACKING_CANVAS_PADDING = 32;

export class CanvasRenderer {
  private _container!: HTMLElement;

  private readonly _disposables = new DisposableGroup();

  private readonly _gfx: GfxController;

  private readonly _turboEnabled: () => boolean;

  private readonly _overlays = new Set<Overlay>();

  private _refreshRafId: number | null = null;

  private _stackingCanvas: HTMLCanvasElement[] = [];

  private readonly _stackingCanvasPool: HTMLCanvasElement[] = [];

  private readonly _stackingCanvasState = new WeakMap<
    HTMLCanvasElement,
    StackingCanvasState
  >();

  private readonly _dirtyStackingCanvasIndexes = new Set<number>();

  private _mainCanvasDirty = true;

  private _needsFullRender = true;

  private _debugMetrics: MutableCanvasRendererDebugMetrics = {
    refreshCount: 0,
    coalescedRefreshCount: 0,
    renderCount: 0,
    totalRenderDurationMs: 0,
    lastRenderDurationMs: 0,
    maxRenderDurationMs: 0,
    lastRenderMetrics: {
      renderByBoundCallCount: 0,
      visibleElementCount: 0,
      renderedElementCount: 0,
      placeholderElementCount: 0,
      overlayCount: 0,
    },
    dirtyLayerRenderCount: 0,
    fallbackElementCount: 0,
  };

  canvas: HTMLCanvasElement;

  ctx: CanvasRenderingContext2D;

  std: BlockStdScope;

  grid: GridManager;

  layerManager: LayerManager;

  provider: Partial<EnvProvider>;

  stackingCanvasUpdated = new Subject<{
    canvases: HTMLCanvasElement[];
    added: HTMLCanvasElement[];
    removed: HTMLCanvasElement[];
  }>();

  usePlaceholder = false;

  viewport: Viewport;

  get stackingCanvas() {
    return this._stackingCanvas;
  }

  constructor(options: RendererOptions) {
    const canvas = document.createElement('canvas');

    this.canvas = canvas;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.std = options.std;
    this.viewport = options.viewport;
    this.layerManager = options.layerManager;
    this.grid = options.gridManager;
    this.provider = options.provider ?? {};
    this._gfx = this.std.get(GfxControllerIdentifier);

    this._turboEnabled = () => {
      const featureFlagService = options.std.get(FeatureFlagService);
      return featureFlagService.getFlag('enable_turbo_renderer');
    };

    this._initViewport();

    options.enableStackingCanvas = options.enableStackingCanvas ?? false;
    if (options.enableStackingCanvas) {
      this._initStackingCanvas(options.onStackingCanvasCreated);
    }

    this._watchSurface(options.surfaceModel);
  }

  /**
   * Specifying the actual size gives better results and more consistent behavior across browsers.
   *
   * Make sure the main canvas and the offscreen canvas or layer canvas are the same size.
   *
   * It is not recommended to set width and height to 100%.
   */
  private _canvasSizeUpdater(dpr = window.devicePixelRatio) {
    const { width, height, viewScale } = this.viewport;
    const actualWidth = Math.ceil(width * dpr);
    const actualHeight = Math.ceil(height * dpr);

    return {
      filter({ width, height }: HTMLCanvasElement) {
        return width !== actualWidth || height !== actualHeight;
      },
      update(canvas: HTMLCanvasElement) {
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.style.transform = `scale(${1 / viewScale})`;
        canvas.style.transformOrigin = `top left`;
        canvas.width = actualWidth;
        canvas.height = actualHeight;
      },
    };
  }

  private _applyStackingCanvasLayout(
    canvas: HTMLCanvasElement,
    bound: Bound | null,
    dpr = window.devicePixelRatio
  ) {
    const state =
      this._stackingCanvasState.get(canvas) ??
      ({
        bound: null,
        layerId: canvas.dataset.layerId ?? null,
      } satisfies StackingCanvasState);

    if (!bound || bound.w <= 0 || bound.h <= 0) {
      canvas.style.display = 'none';
      canvas.style.left = '0px';
      canvas.style.top = '0px';
      canvas.style.width = '0px';
      canvas.style.height = '0px';
      canvas.style.transform = '';
      canvas.width = 0;
      canvas.height = 0;
      state.bound = null;
      state.layerId = canvas.dataset.layerId ?? null;
      this._stackingCanvasState.set(canvas, state);
      return;
    }

    const { viewportBounds, zoom, viewScale } = this.viewport;
    const width = bound.w * zoom;
    const height = bound.h * zoom;
    const left = (bound.x - viewportBounds.x) * zoom;
    const top = (bound.y - viewportBounds.y) * zoom;
    const actualWidth = Math.max(1, Math.ceil(width * dpr));
    const actualHeight = Math.max(1, Math.ceil(height * dpr));
    const transform = `translate(${left}px, ${top}px) scale(${1 / viewScale})`;

    if (canvas.style.display !== 'block') {
      canvas.style.display = 'block';
    }
    if (canvas.style.left !== '0px') {
      canvas.style.left = '0px';
    }
    if (canvas.style.top !== '0px') {
      canvas.style.top = '0px';
    }
    if (canvas.style.width !== `${width}px`) {
      canvas.style.width = `${width}px`;
    }
    if (canvas.style.height !== `${height}px`) {
      canvas.style.height = `${height}px`;
    }
    if (canvas.style.transform !== transform) {
      canvas.style.transform = transform;
    }
    if (canvas.style.transformOrigin !== 'top left') {
      canvas.style.transformOrigin = 'top left';
    }

    if (canvas.width !== actualWidth) {
      canvas.width = actualWidth;
    }

    if (canvas.height !== actualHeight) {
      canvas.height = actualHeight;
    }

    state.bound = bound;
    state.layerId = canvas.dataset.layerId ?? null;
    this._stackingCanvasState.set(canvas, state);
  }

  private _clampBoundToViewport(bound: Bound, viewportBounds: Bound) {
    const minX = Math.max(bound.x, viewportBounds.x);
    const minY = Math.max(bound.y, viewportBounds.y);
    const maxX = Math.min(bound.maxX, viewportBounds.maxX);
    const maxY = Math.min(bound.maxY, viewportBounds.maxY);

    if (maxX <= minX || maxY <= minY) {
      return null;
    }

    return new Bound(minX, minY, maxX - minX, maxY - minY);
  }

  private _createCanvasForLayer(
    onCreated?: (canvas: HTMLCanvasElement) => void
  ) {
    const reused = this._stackingCanvasPool.pop();

    if (reused) {
      return reused;
    }

    const created = document.createElement('canvas');
    onCreated?.(created);
    return created;
  }

  private _findLayerIndexByElement(
    element: SurfaceElementModel | GfxLocalElementModel
  ) {
    const canvasLayers = this.layerManager.getCanvasLayers();
    const index = canvasLayers.findIndex(layer =>
      layer.elements.some(layerElement => layerElement.id === element.id)
    );

    return index === -1 ? null : index;
  }

  private _getLayerRenderBound(
    elements: SurfaceElementModel[],
    viewportBounds: Bound
  ) {
    let layerBound: Bound | null = null;

    for (const element of elements) {
      const display = (element.display ?? true) && !element.hidden;

      if (!display) {
        continue;
      }

      const elementBound = Bound.from(getBoundWithRotation(element));

      if (!intersects(elementBound, viewportBounds)) {
        continue;
      }

      layerBound = layerBound ? layerBound.unite(elementBound) : elementBound;
    }

    if (!layerBound) {
      return null;
    }

    return this._clampBoundToViewport(
      layerBound.expand(STACKING_CANVAS_PADDING),
      viewportBounds
    );
  }

  private _getResolvedStackingCanvasBound(
    canvas: HTMLCanvasElement,
    bound: Bound | null
  ) {
    if (!bound || !this._gfx.tool.dragging$.peek()) {
      return bound;
    }

    const previousBound = this._stackingCanvasState.get(canvas)?.bound;

    return previousBound ? previousBound.unite(bound) : bound;
  }

  private _invalidate(target: RefreshTarget = { type: 'all' }) {
    if (target.type === 'all') {
      this._needsFullRender = true;
      this._mainCanvasDirty = true;
      this._dirtyStackingCanvasIndexes.clear();
      return;
    }

    if (this._needsFullRender) {
      return;
    }

    if (target.type === 'main') {
      this._mainCanvasDirty = true;
      return;
    }

    const elements =
      target.type === 'element' ? [target.element] : target.elements;

    for (const element of elements) {
      const layerIndex = this._findLayerIndexByElement(element);

      if (layerIndex === null || layerIndex >= this._stackingCanvas.length) {
        this._mainCanvasDirty = true;
        continue;
      }

      this._dirtyStackingCanvasIndexes.add(layerIndex);
    }
  }

  private _resetPooledCanvas(canvas: HTMLCanvasElement) {
    canvas.dataset.layerId = '';
    this._applyStackingCanvasLayout(canvas, null);
  }

  private _initStackingCanvas(onCreated?: (canvas: HTMLCanvasElement) => void) {
    const layer = this.layerManager;
    const updateStackingCanvas = () => {
      /**
       * we already have a main canvas, so the last layer should be skipped
       */
      const canvasLayers = layer.getCanvasLayers().slice(0, -1);
      const canvases = [];
      const currentCanvases = this._stackingCanvas;
      const lastLayer = last(this.layerManager.layers);
      const maximumZIndex = lastLayer
        ? lastLayer.zIndex + lastLayer.elements.length + 1
        : 1;

      this.canvas.style.zIndex = maximumZIndex.toString();
      for (let i = 0; i < canvasLayers.length; ++i) {
        const layer = canvasLayers[i];
        const created = i < currentCanvases.length;
        const canvas = created
          ? currentCanvases[i]
          : this._createCanvasForLayer(onCreated);

        canvas.dataset.layerId = `[${layer.indexes[0]}--${layer.indexes[1]}]`;
        canvas.style.zIndex = layer.zIndex.toString();
        canvases.push(canvas);
      }

      this._stackingCanvas = canvases;

      if (currentCanvases.length !== canvases.length) {
        const diff = canvases.length - currentCanvases.length;
        const payload: {
          canvases: HTMLCanvasElement[];
          removed: HTMLCanvasElement[];
          added: HTMLCanvasElement[];
        } = {
          canvases,
          removed: [],
          added: [],
        };

        if (diff > 0) {
          payload.added = canvases.slice(-diff);
        } else {
          payload.removed = currentCanvases.slice(diff);
          payload.removed.forEach(canvas => {
            this._resetPooledCanvas(canvas);
            this._stackingCanvasPool.push(canvas);
          });
        }

        this.stackingCanvasUpdated.next(payload);
      }

      this.refresh({ type: 'all' });
    };

    this._disposables.add(
      this.layerManager.slots.layerUpdated.subscribe(() => {
        updateStackingCanvas();
      })
    );

    updateStackingCanvas();
  }

  private _initViewport() {
    let sizeUpdatedRafId: number | null = null;

    this._disposables.add(
      this.viewport.viewportUpdated.subscribe(() => {
        this.refresh({ type: 'all' });
      })
    );

    this._disposables.add(
      this.viewport.sizeUpdated.subscribe(() => {
        if (sizeUpdatedRafId) return;
        sizeUpdatedRafId = requestConnectedFrame(() => {
          sizeUpdatedRafId = null;
          this._resetSize();
          this._render();
        }, this._container);
      })
    );

    this._disposables.add(
      this.viewport.zooming$.subscribe(isZooming => {
        const shouldRenderPlaceholders = this._turboEnabled() && isZooming;

        if (this.usePlaceholder !== shouldRenderPlaceholders) {
          this.usePlaceholder = shouldRenderPlaceholders;
          this.refresh({ type: 'all' });
        }
      })
    );

    let wasDragging = false;
    this._disposables.add(
      effect(() => {
        const isDragging = this._gfx.tool.dragging$.value;

        if (wasDragging && !isDragging) {
          this.refresh({ type: 'all' });
        }

        wasDragging = isDragging;
      })
    );

    this.usePlaceholder = false;
  }

  private _createRenderPassStats(): RenderPassStats {
    return {
      renderByBoundCallCount: 0,
      visibleElementCount: 0,
      renderedElementCount: 0,
      placeholderElementCount: 0,
      overlayCount: 0,
    };
  }

  private _getCanvasMemorySnapshots(): CanvasMemorySnapshot[] {
    return [this.canvas, ...this._stackingCanvas].map((canvas, index) => {
      return {
        kind: index === 0 ? 'main' : 'stacking',
        width: canvas.width,
        height: canvas.height,
        bytes: canvas.width * canvas.height * 4,
        zIndex: canvas.style.zIndex,
        datasetLayerId: canvas.dataset.layerId ?? null,
      };
    });
  }

  private _render() {
    const renderStart = performance.now();
    const { viewportBounds, zoom } = this.viewport;
    const { ctx } = this;
    const dpr = window.devicePixelRatio;
    const scale = zoom * dpr;
    const matrix = new DOMMatrix().scaleSelf(scale);
    const renderStats = this._createRenderPassStats();
    const fullRender = this._needsFullRender;
    const stackingIndexesToRender = fullRender
      ? this._stackingCanvas.map((_, idx) => idx)
      : [...this._dirtyStackingCanvasIndexes];
    /**
     * if a layer does not have a corresponding canvas
     * its element will be add to this array and drawing on the
     * main canvas
     */
    let fallbackElement: SurfaceElementModel[] = [];
    const allCanvasLayers = this.layerManager.getCanvasLayers();
    const viewportBound = Bound.from(viewportBounds);

    for (const idx of stackingIndexesToRender) {
      const layer = allCanvasLayers[idx];
      const canvas = this._stackingCanvas[idx];

      if (!layer || !canvas) {
        continue;
      }

      const layerRenderBound = this._getLayerRenderBound(
        layer.elements,
        viewportBound
      );
      const resolvedLayerRenderBound = this._getResolvedStackingCanvasBound(
        canvas,
        layerRenderBound
      );

      this._applyStackingCanvasLayout(canvas, resolvedLayerRenderBound);

      if (
        !resolvedLayerRenderBound ||
        canvas.width === 0 ||
        canvas.height === 0
      ) {
        continue;
      }

      const layerCtx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const layerRc = new RoughCanvas(layerCtx.canvas);

      layerCtx.clearRect(0, 0, canvas.width, canvas.height);
      layerCtx.save();
      layerCtx.setTransform(matrix);

      this._renderByBound(
        layerCtx,
        matrix,
        layerRc,
        resolvedLayerRenderBound,
        layer.elements,
        false,
        renderStats
      );
    }

    if (fullRender || this._mainCanvasDirty) {
      allCanvasLayers.forEach((layer, idx) => {
        if (!this._stackingCanvas[idx]) {
          fallbackElement = fallbackElement.concat(layer.elements);
        }
      });

      ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
      ctx.save();
      ctx.setTransform(matrix);

      this._renderByBound(
        ctx,
        matrix,
        new RoughCanvas(ctx.canvas),
        viewportBounds,
        fallbackElement,
        true,
        renderStats
      );
    }

    const canvasMemorySnapshots = this._getCanvasMemorySnapshots();
    const canvasMemoryBytes = canvasMemorySnapshots.reduce(
      (sum, snapshot) => sum + snapshot.bytes,
      0
    );
    const layerTypes = this.layerManager.layers.map(layer => layer.type);
    const renderDurationMs = performance.now() - renderStart;

    this._debugMetrics.renderCount += 1;
    this._debugMetrics.totalRenderDurationMs += renderDurationMs;
    this._debugMetrics.lastRenderDurationMs = renderDurationMs;
    this._debugMetrics.maxRenderDurationMs = Math.max(
      this._debugMetrics.maxRenderDurationMs,
      renderDurationMs
    );
    this._debugMetrics.lastRenderMetrics = renderStats;
    this._debugMetrics.fallbackElementCount = fallbackElement.length;
    this._debugMetrics.dirtyLayerRenderCount = stackingIndexesToRender.length;

    this._lastDebugSnapshot = {
      canvasMemorySnapshots,
      canvasMemoryBytes,
      canvasPixelCount: canvasMemorySnapshots.reduce(
        (sum, snapshot) => sum + snapshot.width * snapshot.height,
        0
      ),
      stackingCanvasCount: this._stackingCanvas.length,
      canvasLayerCount: layerTypes.filter(type => type === 'canvas').length,
      totalLayerCount: layerTypes.length,
      pooledStackingCanvasCount: this._stackingCanvasPool.length,
      visibleStackingCanvasCount: this._stackingCanvas.filter(
        canvas => canvas.width > 0 && canvas.height > 0
      ).length,
    };

    this._needsFullRender = false;
    this._mainCanvasDirty = false;
    this._dirtyStackingCanvasIndexes.clear();
  }

  private _lastDebugSnapshot: Pick<
    CanvasRendererDebugMetrics,
    | 'canvasMemoryBytes'
    | 'canvasMemorySnapshots'
    | 'canvasPixelCount'
    | 'canvasLayerCount'
    | 'pooledStackingCanvasCount'
    | 'stackingCanvasCount'
    | 'totalLayerCount'
    | 'visibleStackingCanvasCount'
  > = {
    canvasMemoryBytes: 0,
    canvasMemorySnapshots: [],
    canvasPixelCount: 0,
    canvasLayerCount: 0,
    pooledStackingCanvasCount: 0,
    stackingCanvasCount: 0,
    totalLayerCount: 0,
    visibleStackingCanvasCount: 0,
  };

  private _renderByBound(
    ctx: CanvasRenderingContext2D | null,
    matrix: DOMMatrix,
    rc: RoughCanvas,
    bound: IBound,
    surfaceElements?: SurfaceElementModel[],
    overLay: boolean = false,
    renderStats?: RenderPassStats
  ) {
    if (!ctx) return;

    renderStats && (renderStats.renderByBoundCallCount += 1);

    const elements =
      surfaceElements ??
      (this.grid.search(bound, {
        filter: ['canvas', 'local'],
      }) as SurfaceElementModel[]);

    for (const element of elements) {
      const display = (element.display ?? true) && !element.hidden;
      if (display && intersects(getBoundWithRotation(element), bound)) {
        renderStats && (renderStats.visibleElementCount += 1);
        if (
          this.usePlaceholder &&
          !(element as GfxCompatibleInterface).forceFullRender
        ) {
          renderStats && (renderStats.placeholderElementCount += 1);
          ctx.save();
          ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
          const drawX = element.x - bound.x;
          const drawY = element.y - bound.y;
          ctx.fillRect(drawX, drawY, element.w, element.h);
          ctx.restore();
        } else {
          renderStats && (renderStats.renderedElementCount += 1);
          ctx.save();
          const renderFn = this.std.getOptional<ElementRenderer>(
            ElementRendererIdentifier(element.type)
          );

          if (!renderFn) continue;

          ctx.globalAlpha = element.opacity ?? 1;
          const dx = element.x - bound.x;
          const dy = element.y - bound.y;
          renderFn(element, ctx, matrix.translate(dx, dy), this, rc, bound);
          ctx.restore();
        }
      }
    }

    if (overLay) {
      renderStats && (renderStats.overlayCount += this._overlays.size);
      for (const overlay of this._overlays) {
        ctx.save();
        ctx.translate(-bound.x, -bound.y);
        overlay.render(ctx, rc);
        ctx.restore();
      }
    }

    ctx.restore();
  }

  private _resetSize() {
    const sizeUpdater = this._canvasSizeUpdater();

    sizeUpdater.update(this.canvas);
    this._invalidate({ type: 'all' });
  }

  private _watchSurface(surfaceModel: SurfaceBlockModel) {
    this._disposables.add(
      surfaceModel.elementAdded.subscribe(() => this.refresh({ type: 'all' }))
    );
    this._disposables.add(
      surfaceModel.elementRemoved.subscribe(() => this.refresh({ type: 'all' }))
    );
    this._disposables.add(
      surfaceModel.localElementAdded.subscribe(() =>
        this.refresh({ type: 'all' })
      )
    );
    this._disposables.add(
      surfaceModel.localElementDeleted.subscribe(() =>
        this.refresh({ type: 'all' })
      )
    );
    this._disposables.add(
      surfaceModel.localElementUpdated.subscribe(({ model }) => {
        this.refresh({ type: 'element', element: model });
      })
    );

    this._disposables.add(
      surfaceModel.elementUpdated.subscribe(payload => {
        // ignore externalXYWH update cause it's updated by the renderer
        if (payload.props['externalXYWH']) return;
        const element = surfaceModel.getElementById(payload.id);
        this.refresh(element ? { type: 'element', element } : { type: 'all' });
      })
    );
  }

  addOverlay(overlay: Overlay) {
    overlay.setRenderer(this);
    this._overlays.add(overlay);
    this.refresh({ type: 'main' });
  }

  /**
   * Used to attach main canvas, main canvas will always exist
   * @param container
   */
  attach(container: HTMLElement) {
    this._container = container;
    container.append(this.canvas);

    this._resetSize();
    this.refresh({ type: 'all' });
  }

  dispose(): void {
    this._overlays.forEach(overlay => overlay.dispose());
    this._overlays.clear();
    this._disposables.dispose();
  }

  generateColorProperty(color: Color, fallback?: Color) {
    return (
      this.provider.generateColorProperty?.(color, fallback) ?? 'transparent'
    );
  }

  getCanvasByBound(
    bound: IBound = this.viewport.viewportBounds,
    surfaceElements?: SurfaceElementModel[],
    canvas?: HTMLCanvasElement,
    clearBeforeDrawing?: boolean,
    withZoom?: boolean
  ): HTMLCanvasElement {
    canvas = canvas || document.createElement('canvas');

    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== bound.w * dpr) canvas.width = bound.w * dpr;
    if (canvas.height !== bound.h * dpr) canvas.height = bound.h * dpr;

    canvas.style.width = `${bound.w}px`;
    canvas.style.height = `${bound.h}px`;

    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
    const matrix = new DOMMatrix().scaleSelf(
      withZoom ? dpr * this.viewport.zoom : dpr
    );
    const rc = new RoughCanvas(canvas);

    if (clearBeforeDrawing) ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(matrix);

    this._renderByBound(ctx, matrix, rc, bound, surfaceElements);

    return canvas;
  }

  getColorScheme() {
    return this.provider.getColorScheme?.() ?? ColorScheme.Light;
  }

  getColorValue(color: Color, fallback?: Color, real?: boolean) {
    return (
      this.provider.getColorValue?.(color, fallback, real) ?? 'transparent'
    );
  }

  getPropertyValue(property: string) {
    return this.provider.getPropertyValue?.(property) ?? '';
  }

  getDebugMetrics(): CanvasRendererDebugMetrics {
    return {
      ...this._debugMetrics,
      ...this._lastDebugSnapshot,
      canvasMemoryMegabytes:
        this._lastDebugSnapshot.canvasMemoryBytes / 1024 / 1024,
    };
  }

  resetDebugMetrics() {
    this._debugMetrics = {
      refreshCount: 0,
      coalescedRefreshCount: 0,
      renderCount: 0,
      totalRenderDurationMs: 0,
      lastRenderDurationMs: 0,
      maxRenderDurationMs: 0,
      lastRenderMetrics: this._createRenderPassStats(),
      dirtyLayerRenderCount: 0,
      fallbackElementCount: 0,
    };
    this._lastDebugSnapshot = {
      canvasMemoryBytes: 0,
      canvasMemorySnapshots: [],
      canvasPixelCount: 0,
      canvasLayerCount: 0,
      pooledStackingCanvasCount: 0,
      stackingCanvasCount: 0,
      totalLayerCount: 0,
      visibleStackingCanvasCount: 0,
    };
  }

  refresh(target: RefreshTarget = { type: 'all' }) {
    this._debugMetrics.refreshCount += 1;
    this._invalidate(target);
    if (this._refreshRafId !== null) {
      this._debugMetrics.coalescedRefreshCount += 1;
      return;
    }

    this._refreshRafId = requestConnectedFrame(() => {
      this._refreshRafId = null;
      this._render();
    }, this._container);
  }

  removeOverlay(overlay: Overlay) {
    if (!this._overlays.has(overlay)) {
      return;
    }

    overlay.setRenderer(null);
    this._overlays.delete(overlay);
    this.refresh({ type: 'main' });
  }
}
