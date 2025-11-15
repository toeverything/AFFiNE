import {
  EdgelessCRUDIdentifier,
  getBgGridGap,
  type SurfaceBlockComponent,
  type SurfaceBlockModel,
} from '@blocksuite/affine-block-surface';
import type { RootBlockModel } from '@blocksuite/affine-model';
import {
  EditorSettingProvider,
  FontLoaderService,
  ThemeProvider,
  ViewportElementProvider,
} from '@blocksuite/affine-shared/services';
import { requestThrottledConnectedFrame } from '@blocksuite/affine-shared/utils';
import {
  BlockComponent,
  type GfxBlockComponent,
  SurfaceSelection,
} from '@blocksuite/std';
import {
  GfxControllerIdentifier,
  type GfxViewportElement,
} from '@blocksuite/std/gfx';
import { css, html } from 'lit';
import { query, state } from 'lit/decorators.js';
import { type StyleInfo, styleMap } from 'lit/directives/style-map.js';

import { isCanvasElement } from '../edgeless/utils/query';

export class EdgelessRootPreviewBlockComponent extends BlockComponent<RootBlockModel> {
  static override styles = css`
    affine-edgeless-root-preview {
      pointer-events: none;
      -webkit-user-select: none;
      user-select: none;
      display: block;
      height: 100%;
    }

    affine-edgeless-root-preview .widgets-container {
      position: absolute;
      left: 0;
      top: 0;
      contain: size layout;
      z-index: 1;
      height: 100%;
    }

    affine-edgeless-root-preview .edgeless-background {
      height: 100%;
      background-color: var(--affine-background-primary-color);
      background-image: radial-gradient(
        var(--affine-edgeless-grid-color) 1px,
        var(--affine-background-primary-color) 1px
      );
    }

    @media print {
      .selected {
        background-color: transparent !important;
      }
    }
  `;

  private get _viewport() {
    return this._gfx.viewport;
  }

  private readonly _refreshLayerViewport = requestThrottledConnectedFrame(
    () => {
      const { zoom, translateX, translateY } = this._viewport;
      const gap = getBgGridGap(zoom);

      this.backgroundStyle = {
        backgroundPosition: `${translateX}px ${translateY}px`,
        backgroundSize: `${gap}px ${gap}px`,
      };
    },
    this
  );

  private _resizeObserver: ResizeObserver | null = null;

  private get _gfx() {
    return this.std.get(GfxControllerIdentifier);
  }

  get surfaceBlockModel() {
    return this.model.children.find(
      child => child.flavour === 'affine:surface'
    ) as SurfaceBlockModel;
  }

  get viewportElement(): HTMLElement {
    return this.std.get(ViewportElementProvider).viewportElement;
  }

  private _initFontLoader() {
    this.std
      .get(FontLoaderService)
      .ready.then(() => {
        this.surface?.refresh();
      })
      .catch(console.error);
  }

  private _initLayerUpdateEffect() {
    const updateLayers = requestThrottledConnectedFrame(() => {
      const blocks = Array.from(
        this.gfxViewportElm.children as HTMLCollectionOf<GfxBlockComponent>
      );

      blocks.forEach((block: GfxBlockComponent) => {
        block.updateZIndex?.();
      });
    });

    this._disposables.add(
      this._gfx.layer.slots.layerUpdated.subscribe(() => updateLayers())
    );
  }

  private _initPixelRatioChangeEffect() {
    let media: MediaQueryList;

    const onPixelRatioChange = () => {
      if (media) {
        this._gfx.viewport.onResize();
        media.removeEventListener('change', onPixelRatioChange);
      }

      media = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      media.addEventListener('change', onPixelRatioChange);
    };

    onPixelRatioChange();

    this._disposables.add(() => {
      media?.removeEventListener('change', onPixelRatioChange);
    });
  }

  private _initResizeEffect() {
    const resizeObserver = new ResizeObserver((_: ResizeObserverEntry[]) => {
      this._gfx.selection.set(this._gfx.selection.surfaceSelections);
      this._gfx.viewport.onResize();
    });

    try {
      resizeObserver.observe(this.viewportElement);
      this._resizeObserver?.disconnect();
      this._resizeObserver = resizeObserver;
    } catch {
      // viewport is not ready
      console.error('Viewport is not ready');
    }
  }

  private _initSlotEffects() {
    this.disposables.add(
      this.std
        .get(ThemeProvider)
        .theme$.subscribe(() => this.surface?.refresh())
    );
  }

  private get _disableScheduleUpdate() {
    const editorSetting = this.std.getOptional(EditorSettingProvider)?.setting$;

    return editorSetting?.peek().edgelessDisableScheduleUpdate ?? false;
  }

  private get _crud() {
    return this.std.get(EdgelessCRUDIdentifier);
  }

  override connectedCallback() {
    super.connectedCallback();

    this.handleEvent('selectionChange', () => {
      const surface = this.host.selection.value.find(
        (sel): sel is SurfaceSelection => sel.is(SurfaceSelection)
      );
      if (!surface) return;

      const el = this._crud.getElementById(surface.elements[0]);
      if (isCanvasElement(el)) {
        return true;
      }

      return;
    });
  }

  override disconnectedCallback() {
    super.disconnectedCallback();

    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }
  }

  override firstUpdated() {
    this._initSlotEffects();
    this._initResizeEffect();
    this._initPixelRatioChangeEffect();
    this._initFontLoader();
    this._initLayerUpdateEffect();

    this._disposables.add(
      this._gfx.viewport.viewportUpdated.subscribe(() => {
        this._refreshLayerViewport();
      })
    );

    this._refreshLayerViewport();
  }

  override renderBlock() {
    const background = styleMap({
      ...this.backgroundStyle,
      background: this.overrideBackground,
    });

    return html`
      <div class="edgeless-background edgeless-container" style=${background}>
        <gfx-viewport
          .enableChildrenSchedule=${!this._disableScheduleUpdate}
          .viewport=${this._gfx.viewport}
          .getModelsInViewport=${() => {
            const blocks = this._gfx.grid.search(
              this._gfx.viewport.viewportBounds,
              {
                useSet: true,
                filter: ['block'],
              }
            );
            return blocks;
          }}
          .host=${this.host}
        >
          ${this.renderChildren(this.model)}${this.renderChildren(
            this.surfaceBlockModel
          )}
        </gfx-viewport>
      </div>
    `;
  }

  @state()
  accessor overrideBackground: string | undefined = undefined;

  @state()
  accessor backgroundStyle: Readonly<StyleInfo> | null = null;

  @query('gfx-viewport')
  accessor gfxViewportElm!: GfxViewportElement;

  @query('affine-surface')
  accessor surface!: SurfaceBlockComponent;
}
