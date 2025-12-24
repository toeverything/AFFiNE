import { adjustColorAlpha } from '@blocksuite/affine-components/color-picker';
import {
  BRUSH_LINE_WIDTHS,
  DefaultTheme,
  HIGHLIGHTER_LINE_WIDTHS,
} from '@blocksuite/affine-model';
import {
  FeatureFlagService,
  ThemeProvider,
} from '@blocksuite/affine-shared/services';
import type { ColorEvent } from '@blocksuite/affine-shared/utils';
import { EdgelessToolbarToolMixin } from '@blocksuite/affine-widget-edgeless-toolbar';
import { SignalWatcher } from '@blocksuite/global/lit';
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

  private readonly _onPickColor = (e: ColorEvent) => {
    let color = e.detail.value;
    if (this.pen$.peek() === 'highlighter') {
      color = adjustColorAlpha(color, 0.3);
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
          <edgeless-color-panel
            class="one-way"
            @select=${this._onPickColor}
            .value=${color}
            .theme=${theme}
            .palettes=${DefaultTheme.StrokeColorShortPalettes}
            .shouldKeepColor=${true}
            .hasTransparent=${!this.edgeless.store
              .get(FeatureFlagService)
              .getFlag('enable_color_picker')}
          ></edgeless-color-panel>
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
