/* oxlint-disable @typescript-eslint/no-non-null-assertion */
import {
  CanvasRenderer,
  type SurfaceBlockModel,
} from '@blocksuite/affine/blocks/surface';
import { fitContent } from '@blocksuite/affine/gfx/shape';
import type { Bound } from '@blocksuite/affine/global/gfx';
import type { Color, ShapeElementModel } from '@blocksuite/affine/model';
import { ThemeProvider } from '@blocksuite/affine/shared/services';
import { BlockComponent } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import { html } from 'lit';
import { query } from 'lit/decorators.js';

import { MindmapService } from './mindmap-service.js';

export class MindmapSurfaceBlock extends BlockComponent<SurfaceBlockModel> {
  renderer?: CanvasRenderer;

  private get _grid() {
    return this.gfx.grid;
  }

  private get _layer() {
    return this.gfx.layer;
  }

  get mindmapService() {
    return this.std.get(MindmapService);
  }

  get viewport() {
    return this.gfx.viewport;
  }

  get gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  constructor() {
    super();
  }

  private _adjustNodeWidth() {
    this.model.store.transact(() => {
      this.model.elementModels.forEach(element => {
        if (element.type === 'shape') {
          fitContent(element as ShapeElementModel);
        }
      });
    });
  }

  private _resizeEffect() {
    const observer = new ResizeObserver(() => {
      this.viewport.onResize();
    });

    observer.observe(this.editorContainer);
    this._disposables.add(() => {
      observer.disconnect();
    });
  }

  private _setupCenterEffect() {
    this._disposables.add(
      this.mindmapService.requestCenter.subscribe(() => {
        let bound: Bound;

        this.model.elementModels.forEach(el => {
          if (!bound) {
            bound = el.elementBound;
          } else {
            bound = bound.unite(el.elementBound);
          }
        });

        if (bound!) {
          this.viewport.setViewportByBound(bound, [10, 10, 10, 10]);
        }
      })
    );
  }

  private _setupRenderer() {
    this._disposables.add(
      this.model.elementUpdated.subscribe(() => {
        this.mindmapService.center();
      })
    );

    this.viewport.ZOOM_MIN = 0.01;
  }

  override connectedCallback(): void {
    super.connectedCallback();

    const themeService = this.std.get(ThemeProvider);
    this.renderer = new CanvasRenderer({
      std: this.std,
      viewport: this.viewport,
      layerManager: this._layer,
      gridManager: this._grid,
      enableStackingCanvas: true,
      provider: {
        selectedElements: () => [],
        getColorScheme: () => themeService.edgelessTheme,
        getColorValue: (color: Color, fallback?: Color, real?: boolean) =>
          themeService.getColorValue(
            color,
            fallback,
            real,
            themeService.edgelessTheme
          ),
        generateColorProperty: (color: Color, fallback?: Color) =>
          themeService.generateColorProperty(
            color,
            fallback,
            themeService.edgelessTheme
          ),
        getPropertyValue: (property: string) =>
          themeService.getCssVariableColor(
            property,
            themeService.edgelessTheme
          ),
      },
      surfaceModel: this.model,
    });
    this._disposables.add(this.renderer);
  }

  override firstUpdated(_changedProperties: Map<PropertyKey, unknown>): void {
    this.renderer?.attach(this.editorContainer);

    this._resizeEffect();
    this._setupCenterEffect();
    this._setupRenderer();
    this._adjustNodeWidth();
    this.mindmapService.center();
  }

  override render() {
    return html`
      <style>
        .affine-mini-mindmap-surface {
          width: 100%;
          height: 100%;
        }
      </style>
      <div class="affine-mini-mindmap-surface">
        <!-- attach cavnas later in renderer -->
      </div>
    `;
  }

  @query('.affine-mini-mindmap-surface')
  accessor editorContainer!: HTMLDivElement;
}
