import { EdgelessCRUDIdentifier } from '@blocksuite/affine-block-surface';
import {
  type Color,
  ConnectorElementModel,
  DefaultTheme,
  isTransparent,
  type Palette,
  ShapeElementModel,
  type ShapeName,
  ShapeStyle,
  ShapeType,
} from '@blocksuite/affine-model';
import {
  EditPropsStore,
  FeatureFlagService,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import type { ColorEvent } from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  ArrowDownSmallIcon,
  ArrowUpSmallIcon,
  StyleGeneralIcon,
  StyleScribbleIcon,
} from '@blocksuite/icons/lit';
import type { BlockComponent } from '@blocksuite/std';
import {
  GfxControllerIdentifier,
  type ToolOptionWithType,
} from '@blocksuite/std/gfx';
import { computed, effect, type Signal, signal } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { when } from 'lit/directives/when.js';

import { ShapeTool } from '../shape-tool';
import { ShapeComponentConfig } from '../toolbar';
import { getToolPaletteMemory, setToolPaletteMemory } from './palette-memory';
import {
  getShapePaletteData,
  shapePaletteKeys,
  shapePalettes,
  type ShapePaletteStyle,
} from './palettes';

export class EdgelessShapeMenu extends SignalWatcher(
  WithDisposable(LitElement)
) {
  private readonly _memoryKey = 'shape';

  static override styles = css`
    :host {
      display: flex;
      z-index: -1;
    }
    .menu-content {
      display: flex;
      align-items: center;
    }
    .shape-type-container,
    .shape-style-container {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 14px;
    }
    .shape-type-container svg,
    .shape-style-container svg {
      fill: none;
      stroke: var(--affine-icon-color);
    }
    .more-shapes-button {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .more-shapes-button svg {
      fill: none;
      stroke: var(--affine-icon-color);
    }
    .color-panel-container {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .palette-toggle-button {
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 999px;
    }
    .palette-toggle-button svg {
      fill: none;
      stroke: var(--affine-icon-color);
    }
    menu-divider {
      height: 24px;
      margin: 0 9px;
    }
  `;

  private readonly _shapeName$: Signal<ShapeName> = signal(ShapeType.Rect);

  private readonly _paletteIndex$ = signal(0);

  private readonly _activeColorKey$ = signal<string | undefined>(undefined);

  private readonly _activePalettes$ = computed(() => {
    return getShapePaletteData(this._paletteIndex$.value);
  });

  @property({ attribute: false })
  accessor edgeless!: BlockComponent;

  private readonly _props$ = computed(() => {
    const shapeName: ShapeName = this._shapeName$.value;
    const propsStore = this.edgeless.std.get(EditPropsStore);
    const shapeProps =
      propsStore.lastProps$.value[`shape:${shapeName}`] ??
      propsStore.lastProps$.value['shape:rect'];
    const { shapeStyle, fillColor, strokeColor, radius } = shapeProps;
    return {
      shapeStyle,
      shapeName,
      fillColor,
      strokeColor,
      radius,
    };
  });

  private readonly _setFillColor = ({ key, value }: Palette) => {
    const { stylesByKey } = this._activePalettes$.value;
    const style = stylesByKey.get(key);
    const fillColor = style?.fill ?? value;
    const filled = !isTransparent(fillColor);
    const strokeColor = style?.stroke ?? DefaultTheme.StrokeColorShortMap.Grey;
    const strokeWidth = style?.strokeWidth;
    const strokeStyle = style?.strokeStyle;
    const gradientFinal = style?.gradientFinal ?? fillColor;
    const gradientDirection = style?.gradientDirection ?? 'S';
    this._activeColorKey$.value = key;
    setToolPaletteMemory(this._memoryKey, {
      index: this._paletteIndex$.value,
      activeKey: key,
    });

    const { shapeName } = this._props$.value;
    const nextProps: {
      filled: boolean;
      fillColor: Color;
      strokeColor: Color;
      strokeWidth?: ShapePaletteStyle['strokeWidth'];
      strokeStyle?: ShapePaletteStyle['strokeStyle'];
      gradientFinal?: ShapePaletteStyle['gradientFinal'];
      gradientDirection?: ShapePaletteStyle['gradientDirection'];
    } = {
      filled,
      fillColor,
      strokeColor,
      gradientFinal,
      gradientDirection,
    };
    if (strokeWidth) nextProps.strokeWidth = strokeWidth;
    if (strokeStyle) nextProps.strokeStyle = strokeStyle;
    this._recordShapeProps(shapeName, nextProps);

    const applied = this._applyColorToSelection(
      fillColor,
      strokeColor,
      strokeWidth,
      strokeStyle,
      gradientFinal,
      gradientDirection
    );
    if (!applied) {
      this._refreshShapeOverlay();
    }
  };

  private _recordShapeProps(
    shapeName: ShapeName,
    props: Parameters<EditPropsStore['recordLastProps']>[1]
  ) {
    const propsStore = this.edgeless.std.get(EditPropsStore);
    propsStore.recordLastProps('shape:rect', props);
    if (shapeName !== ShapeType.Rect) {
      propsStore.recordLastProps(`shape:${shapeName}`, props);
    }
  }

  private readonly _setShapeStyle = (shapeStyle: ShapeStyle) => {
    const { shapeName } = this._props$.value;
    this.edgeless.std
      .get(EditPropsStore)
      .recordLastProps(`shape:${shapeName}`, {
        shapeStyle,
      });
    this.onChange(shapeName);
  };

  private readonly _togglePalette = () => {
    const presetCount = shapePalettes.length;
    const nextIndex = (this._paletteIndex$.value + 1) % presetCount;
    this._paletteIndex$.value = nextIndex;
    this._activeColorKey$.value = undefined;
    setToolPaletteMemory(this._memoryKey, {
      index: nextIndex,
      activeKey: undefined,
    });
  };

  private _applyColorToSelection(
    fillColor: Color,
    strokeColor?: Color,
    strokeWidth?: ShapePaletteStyle['strokeWidth'],
    strokeStyle?: ShapePaletteStyle['strokeStyle'],
    gradientFinal?: ShapePaletteStyle['gradientFinal'],
    gradientDirection?: ShapePaletteStyle['gradientDirection']
  ) {
    const selection = this.edgeless.std.get(GfxControllerIdentifier).selection;
    const elements = selection.selectedElements;
    if (!elements.length) return false;

    const filled = !isTransparent(fillColor);
    const appliedStrokeColor =
      strokeColor ?? DefaultTheme.StrokeColorShortMap.Grey;
    const crud = this.edgeless.std.get(EdgelessCRUDIdentifier);
    let applied = false;

    for (const element of elements) {
      if (element instanceof ConnectorElementModel) {
        if (!applied) this.edgeless.store.captureSync();
        const connectorUpdates: Record<string, unknown> = {
          stroke: appliedStrokeColor,
        };
        if (strokeWidth) connectorUpdates.strokeWidth = strokeWidth;
        if (strokeStyle) connectorUpdates.strokeStyle = strokeStyle;
        crud.updateElement(element.id, connectorUpdates);
        this.edgeless.std
          .get(EditPropsStore)
          .recordLastProps('connector', connectorUpdates);
        applied = true;
        continue;
      }
      if (element instanceof ShapeElementModel) {
        if (!applied) this.edgeless.store.captureSync();
        const shapeUpdates: Record<string, unknown> = {
          fillColor,
          strokeColor: appliedStrokeColor,
          filled,
          gradientFinal,
          gradientDirection,
        };
        if (strokeWidth) shapeUpdates.strokeWidth = strokeWidth;
        if (strokeStyle) shapeUpdates.strokeStyle = strokeStyle;
        crud.updateElement(element.id, shapeUpdates);
        applied = true;
      }
    }

    return applied;
  }

  private _refreshShapeOverlay() {
    const controller = this.edgeless.std
      .get(GfxControllerIdentifier)
      .tool.currentTool$.peek();
    if (controller instanceof ShapeTool) {
      controller.createOverlay();
    }
  }

  private _resolveActiveKey(fillColor?: Color, strokeColor?: Color) {
    if (!fillColor) return undefined;
    const { palette } = this._activePalettes$.value;
    const index = palette.styles.findIndex(
      style => style.fill === fillColor && style.stroke === strokeColor
    );
    if (index >= 0) return shapePaletteKeys[index];
    const fallbackIndex = palette.styles.findIndex(
      style => style.fill === fillColor
    );
    return fallbackIndex >= 0 ? shapePaletteKeys[fallbackIndex] : undefined;
  }

  private readonly _theme$ = computed(() => {
    return this.edgeless.std.get(ThemeProvider).theme$.value;
  });

  override connectedCallback(): void {
    super.connectedCallback();

    const memory = getToolPaletteMemory(this._memoryKey);
    this._paletteIndex$.value = memory.index;
    this._activeColorKey$.value = memory.activeKey;

    const gfx = this.edgeless.std.get(GfxControllerIdentifier);
    this._disposables.add(
      effect(() => {
        const value = gfx.tool.currentToolOption$.value;

        if (value && value.toolType === ShapeTool) {
          const shapeName = (value as ToolOptionWithType<ShapeTool>).options
            ?.shapeName;
          if (shapeName) {
            this._shapeName$.value = shapeName;
          }
        }
      })
    );
  }

  override render() {
    const { fillColor, strokeColor, shapeStyle, shapeName } =
      this._props$.value;
    const { fillPalettes, strokePalettes, ringPalettes, gradientPalettes } =
      this._activePalettes$.value;
    const activeKey =
      this._activeColorKey$.value ??
      this._resolveActiveKey(fillColor, strokeColor);

    return html`
      <edgeless-slide-menu>
        <div class="menu-content">
          ${
            // TODO(@fundon): add a flag
            when(
              false,
              () => html`
                <div class="shape-style-container">
                  <edgeless-tool-icon-button
                    .tooltip=${'General'}
                    .active=${shapeStyle === ShapeStyle.General}
                    .activeMode=${'background'}
                    .iconSize=${'20px'}
                    @click=${() => {
                      this._setShapeStyle(ShapeStyle.General);
                    }}
                  >
                    ${StyleGeneralIcon()}
                  </edgeless-tool-icon-button>
                  <edgeless-tool-icon-button
                    .tooltip=${'Scribbled'}
                    .active=${shapeStyle === ShapeStyle.Scribbled}
                    .activeMode=${'background'}
                    .iconSize=${'20px'}
                    @click=${() => {
                      this._setShapeStyle(ShapeStyle.Scribbled);
                    }}
                  >
                    ${StyleScribbleIcon()}
                  </edgeless-tool-icon-button>
                </div>
                <menu-divider .vertical=${true}></menu-divider>
              `
            )
          }
          <div class="shape-type-container">
            ${ShapeComponentConfig.map(
              ({ name, generalIcon, scribbledIcon, tooltip }) => {
                return html`
                  <edgeless-tool-icon-button
                    .tooltip=${tooltip}
                    .active=${shapeName === name}
                    .activeMode=${'background'}
                    .iconSize=${'20px'}
                    @click=${() => this.onChange(name)}
                  >
                    ${shapeStyle === ShapeStyle.General
                      ? generalIcon
                      : scribbledIcon}
                  </edgeless-tool-icon-button>
                `;
              }
            )}
            <edgeless-tool-icon-button
              class="more-shapes-button"
              .tooltip=${this.browserOpen ? 'Close' : 'More shapes'}
              .active=${this.browserOpen}
              .activeMode=${'background'}
              .iconSize=${'20px'}
              @click=${() => this.onMoreClick?.()}
            >
              ${this.browserOpen ? ArrowDownSmallIcon() : ArrowUpSmallIcon()}
            </edgeless-tool-icon-button>
          </div>
          <menu-divider .vertical=${true}></menu-divider>
          <div class="color-panel-container">
            <edgeless-color-panel
              class="one-way"
              .value=${fillColor}
              .theme=${this._theme$.value}
              .palettes=${fillPalettes}
              .outlinePalettes=${strokePalettes}
              .ringPalettes=${ringPalettes}
              .gradientPalettes=${gradientPalettes}
              .activeKey=${activeKey}
              .hasTransparent=${!this.edgeless.store
                .get(FeatureFlagService)
                .getFlag('enable_color_picker')}
              @select=${(e: ColorEvent) => this._setFillColor(e.detail)}
            ></edgeless-color-panel>
            <edgeless-tool-icon-button
              class="palette-toggle-button"
              .tooltip=${'Next palette'}
              .activeMode=${'background'}
              .iconSize=${'20px'}
              @click=${this._togglePalette}
            >
              ${ArrowUpSmallIcon()}
            </edgeless-tool-icon-button>
          </div>
        </div>
      </edgeless-slide-menu>
    `;
  }

  @property({ attribute: false })
  accessor onChange!: (name: ShapeName) => void;

  @property({ attribute: false })
  accessor onMoreClick: (() => void) | undefined;

  @property({ attribute: false })
  accessor browserOpen = false;
}
