import { type Color, ColorScheme } from '@blocksuite/affine-model';
import { FeatureFlagService } from '@blocksuite/affine-shared/services';
import { requestConnectedFrame } from '@blocksuite/affine-shared/utils';
import { DisposableGroup } from '@blocksuite/global/disposable';
import type { IBound } from '@blocksuite/global/gfx';
import { getBoundWithRotation, intersects } from '@blocksuite/global/gfx';
import type { BlockStdScope } from '@blocksuite/std';
import type {
  GfxCompatibleInterface,
  GridManager,
  LayerManager,
  SurfaceBlockModel,
  Viewport,
} from '@blocksuite/std/gfx';
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

export class CanvasRenderer {
  private _container!: HTMLElement;

  private readonly _disposables = new DisposableGroup();

  private readonly _turboEnabled: () => boolean;

  private readonly _overlays = new Set<Overlay>();

  private _refreshRafId: number | null = null;

  private _stackingCanvas: HTMLCanvasElement[] = [];

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

  private _initStackingCanvas(onCreated?: (canvas: HTMLCanvasElement) => void) {
    const layer = this.layerManager;
    const updateStackingCanvasSize = (canvases: HTMLCanvasElement[]) => {
      this._stackingCanvas = canvases;

      const sizeUpdater = this._canvasSizeUpdater();

      canvases.filter(sizeUpdater.filter).forEach(sizeUpdater.update);
    };
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
          : document.createElement('canvas');

        if (!created) {
          onCreated?.(canvas);
        }

        canvas.dataset.layerId = `[${layer.indexes[0]}--${layer.indexes[1]}]`;
        canvas.style.zIndex = layer.zIndex.toString();
        canvases.push(canvas);
      }

      this._stackingCanvas = canvases;
      updateStackingCanvasSize(canvases);

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
        }

        this.stackingCanvasUpdated.next(payload);
      }

      this.refresh();
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
        this.refresh();
      })
    );

    this._disposables.add(
      this.viewport.sizeUpdated.subscribe(() => {
        if (sizeUpdatedRafId) return;
        sizeUpdatedRafId = requestConnectedFrame(() => {
          sizeUpdatedRafId = null;
          this._resetSize();
          this._render();
          this.refresh();
        }, this._container);
      })
    );

    this._disposables.add(
      this.viewport.zooming$.subscribe(isZooming => {
        const shouldRenderPlaceholders = this._turboEnabled() && isZooming;

        if (this.usePlaceholder !== shouldRenderPlaceholders) {
          this.usePlaceholder = shouldRenderPlaceholders;
          this.refresh();
        }
      })
    );

    this.usePlaceholder = false;
  }

  private _render() {
    const { viewportBounds, zoom } = this.viewport;
    const { ctx } = this;
    const dpr = window.devicePixelRatio;
    const scale = zoom * dpr;
    const matrix = new DOMMatrix().scaleSelf(scale);
    /**
     * if a layer does not have a corresponding canvas
     * its element will be add to this array and drawing on the
     * main canvas
     */
    let fallbackElement: SurfaceElementModel[] = [];

    this.layerManager.getCanvasLayers().forEach((layer, idx) => {
      if (!this._stackingCanvas[idx]) {
        fallbackElement = fallbackElement.concat(layer.elements);
        return;
      }

      const canvas = this._stackingCanvas[idx];
      const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
      const rc = new RoughCanvas(ctx.canvas);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.setTransform(matrix);

      this._renderByBound(ctx, matrix, rc, viewportBounds, layer.elements);
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
      true
    );
  }

  private _renderByBound(
    ctx: CanvasRenderingContext2D | null,
    matrix: DOMMatrix,
    rc: RoughCanvas,
    bound: IBound,
    surfaceElements?: SurfaceElementModel[],
    overLay: boolean = false
  ) {
    if (!ctx) return;

    const elements =
      surfaceElements ??
      (this.grid.search(bound, {
        filter: ['canvas', 'local'],
      }) as SurfaceElementModel[]);

    for (const element of elements) {
      const display = (element.display ?? true) && !element.hidden;
      if (display && intersects(getBoundWithRotation(element), bound)) {
        if (
          this.usePlaceholder &&
          !(element as GfxCompatibleInterface).forceFullRender
        ) {
          ctx.save();
          ctx.fillStyle = 'rgba(200, 200, 200, 0.5)';
          const drawX = element.x - bound.x;
          const drawY = element.y - bound.y;
          ctx.fillRect(drawX, drawY, element.w, element.h);
          ctx.restore();
        } else {
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

    this._stackingCanvas.forEach(sizeUpdater.update);
    this.refresh();
  }

  private _watchSurface(surfaceModel: SurfaceBlockModel) {
    this._disposables.add(
      surfaceModel.elementAdded.subscribe(() => this.refresh())
    );
    this._disposables.add(
      surfaceModel.elementRemoved.subscribe(() => this.refresh())
    );
    this._disposables.add(
      surfaceModel.localElementAdded.subscribe(() => this.refresh())
    );
    this._disposables.add(
      surfaceModel.localElementDeleted.subscribe(() => this.refresh())
    );
    this._disposables.add(
      surfaceModel.localElementUpdated.subscribe(() => this.refresh())
    );

    this._disposables.add(
      surfaceModel.elementUpdated.subscribe(payload => {
        // ignore externalXYWH update cause it's updated by the renderer
        if (payload.props['externalXYWH']) return;
        this.refresh();
      })
    );
  }

  addOverlay(overlay: Overlay) {
    overlay.setRenderer(this);
    this._overlays.add(overlay);
    this.refresh();
  }

  /**
   * Used to attach main canvas, main canvas will always exist
   * @param container
   */
  attach(container: HTMLElement) {
    this._container = container;
    container.append(this.canvas);

    this._resetSize();
    this.refresh();
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

  refresh() {
    if (this._refreshRafId !== null) return;

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
    this.refresh();
  }
}
