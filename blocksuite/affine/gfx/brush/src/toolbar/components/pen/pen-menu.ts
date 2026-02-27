import { adjustColorAlpha } from '@blocksuite/affine-components/color-picker';
import {
  getShapePaletteData,
  getToolPaletteMemory,
  setToolPaletteMemory,
  shapePaletteKeys,
  shapePalettes,
} from '@blocksuite/affine-gfx-shape';
import {
  BRUSH_LINE_WIDTHS,
  type Color,
  HIGHLIGHTER_LINE_WIDTHS,
} from '@blocksuite/affine-model';
import {
  FeatureFlagService,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import type { ColorEvent } from '@blocksuite/affine-shared/utils';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
import { ArrowUpSmallIcon } from '@blocksuite/icons/lit';
import {
  computed,
  type ReadonlySignal,
  type Signal,
} from '@preact/signals-core';
import { css, html, LitElement, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { BrushTool } from '../../../brush-tool';
import { HighlighterTool } from '../../../highlighter-tool';
import { penInfoMap } from './consts';
import type { Pen, PenMap } from './types';

export class EdgelessPenMenu extends EdgelessToolbarToolMixin(
  SignalWatcher(LitElement)
) {
  private readonly _memoryKey = 'pen';

  private _paletteIndex = 0;

  private _activeColorKey: string | undefined;

  static override styles = css`
    :host {
      display: flex;
      position: absolute;
      z-index: -1;
    }

    .pens {
      display: flex;
      height: 100%;
      padding: 0 4px;
      align-items: flex-end;

      edgeless-tool-icon-button {
        display: flex;
        align-self: flex-start;
      }

      .pen-wrapper {
        display: flex;
        min-width: 38px;
        height: 64px;
        align-items: flex-end;
        justify-content: center;
        position: relative;
        transform: translateY(-2px);
        transition-property: color, transform;
        transition-duration: 300ms;
        transition-timing-function: ease-in-out;
        cursor: pointer;
      }

      .pen-wrapper:hover,
      .pen-wrapper:active,
      .pen-wrapper[data-active] {
        transform: translateY(-22px);
      }
    }

    .menu-content {
      display: flex;
      align-items: center;
    }

    menu-divider {
      display: flex;
      align-self: center;
      height: 24px;
      margin: 0 9px;
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
  `;

  private readonly _theme$ = computed(() => {
    return this.edgeless.std.get(ThemeProvider).theme$.value;
  });

  private readonly _onPickPen = (tool: Pen) => {
    this.pen$.value = tool;
    if (tool === 'brush') {
      this.setEdgelessTool(BrushTool);
    } else {
      this.setEdgelessTool(HighlighterTool);
    }
  };

  override connectedCallback(): void {
    super.connectedCallback();
    const memory = getToolPaletteMemory(this._memoryKey);
    this._paletteIndex = memory.index;
    this._activeColorKey = memory.activeKey;
  }

  private readonly _togglePalette = () => {
    this._paletteIndex = (this._paletteIndex + 1) % shapePalettes.length;
    this._activeColorKey = undefined;
    setToolPaletteMemory(this._memoryKey, {
      index: this._paletteIndex,
      activeKey: undefined,
    });
    this.requestUpdate();
  };

  private _resolveActiveKey(color: Color) {
    if (typeof color !== 'string') return undefined;
    const { strokePalettes } = getShapePaletteData(this._paletteIndex);
    const index = strokePalettes.findIndex(p => p.value === color);
    return index >= 0 ? shapePaletteKeys[index] : undefined;
  }

  private readonly _onPickColor = (e: ColorEvent) => {
    this._activeColorKey = e.detail.key;
    setToolPaletteMemory(this._memoryKey, {
      index: this._paletteIndex,
      activeKey: this._activeColorKey,
    });

    let color = e.detail.value as string;
    if (this.pen$.peek() === 'highlighter') {
      color = adjustColorAlpha(color, 0.3) as string;
    }
    this.onChange({ color });
  };

  private readonly _onPickLineWidth = (e: CustomEvent<number>) => {
    e.stopPropagation();
    this.onChange({ lineWidth: e.detail });
  };

  override type = [BrushTool, HighlighterTool];

  override render() {
    const {
      _theme$: { value: theme },
      colors$: {
        value: { brush: brushColor, highlighter: highlighterColor },
      },
      penIconMap$: {
        value: { brush: brushIcon, highlighter: highlighterIcon },
      },
      penInfo$: {
        value: { type, color, lineWidth },
      },
    } = this;
    const { strokePalettes } = getShapePaletteData(this._paletteIndex);
    const activeKey = this._activeColorKey ?? this._resolveActiveKey(color);

    const lineWidths =
      type === 'brush' ? BRUSH_LINE_WIDTHS : HIGHLIGHTER_LINE_WIDTHS;

    return html`
      <edgeless-slide-menu>
        <div class="pens" slot="prefix">
          <edgeless-tool-icon-button
            class="edgeless-brush-button"
            .tooltip=${html`<affine-tooltip-content-with-shortcut
              data-tip="${penInfoMap.brush.tip}"
              data-shortcut="${penInfoMap.brush.shortcut}"
            ></affine-tooltip-content-with-shortcut>`}
            .tooltipOffset=${20}
            .hover=${false}
            @click=${() => this._onPickPen('brush')}
          >
            <div
              class="pen-wrapper"
              style=${styleMap({ color: brushColor })}
              ?data-active="${type === 'brush'}"
            >
              ${brushIcon}
            </div>
          </edgeless-tool-icon-button>

          <edgeless-tool-icon-button
            class="edgeless-highlighter-button"
            .tooltip=${html`<affine-tooltip-content-with-shortcut
              data-tip="${penInfoMap.highlighter.tip}"
              data-shortcut="${penInfoMap.highlighter.shortcut}"
            ></affine-tooltip-content-with-shortcut>`}
            .tooltipOffset=${20}
            .hover=${false}
            @click=${() => this._onPickPen('highlighter')}
          >
            <div
              class="pen-wrapper"
              style=${styleMap({ color: highlighterColor })}
              ?data-active="${type === 'highlighter'}"
            >
              ${highlighterIcon}
            </div>
          </edgeless-tool-icon-button>
          <menu-divider .vertical=${true}></menu-divider>
        </div>
        <div class="menu-content">
          <edgeless-line-width-panel
            .selectedSize=${lineWidth}
            .lineWidths=${lineWidths}
            @select=${this._onPickLineWidth}
          >
          </edgeless-line-width-panel>
          <menu-divider .vertical=${true}></menu-divider>
          <div class="color-panel-container">
            <edgeless-color-panel
              class="one-way"
              .value=${color}
              .theme=${theme}
              .palettes=${strokePalettes}
              .activeKey=${activeKey}
              .hasTransparent=${!this.edgeless.store
                .get(FeatureFlagService)
                .getFlag('enable_color_picker')}
              @select=${this._onPickColor}
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
  accessor onChange!: (props: Record<string, unknown>) => void;

  @property({ attribute: false })
  accessor colors$!: ReadonlySignal<PenMap<string>>;

  @property({ attribute: false })
  accessor penIconMap$!: ReadonlySignal<PenMap<TemplateResult>>;

  @property({ attribute: false })
  accessor pen$!: Signal<Pen>;

  @property({ attribute: false })
  accessor penInfo$!: ReadonlySignal<{
    type: Pen;
    color: string;
    icon: TemplateResult<1>;
    lineWidth: number;
    tip: string;
    shortcut: string;
  }>;
}
