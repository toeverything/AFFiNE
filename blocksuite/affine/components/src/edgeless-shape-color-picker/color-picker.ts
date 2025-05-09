import {
  type Color,
  type ColorScheme,
  DefaultTheme,
  type LineWidth,
  type Palette,
  resolveColor,
  type ShapeProps,
  type StrokeStyle,
} from '@blocksuite/affine-model';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import {
  type ColorEvent,
  stopPropagation,
} from '@blocksuite/affine-shared/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { batch, signal } from '@preact/signals-core';
import { css, html, LitElement } from 'lit';
import { property, query } from 'lit/decorators.js';
import { choose } from 'lit-html/directives/choose.js';
import { repeat } from 'lit-html/directives/repeat.js';
import { styleMap } from 'lit-html/directives/style-map.js';
import { when } from 'lit-html/directives/when.js';

import {
  calcCustomButtonStyle,
  keepColor,
  packColorsWith,
  type PickColorEvent,
  preprocessColor,
  rgbaToHex8,
} from '../color-picker';
import type { LineDetailType } from '../edgeless-line-styles-panel';
import type { EditorMenuButton } from '../toolbar';

type TabType = 'normal' | 'custom';

type ColorType = Extract<keyof ShapeProps, 'fillColor' | 'strokeColor'>;

type PickerType = {
  label: string;
  type: ColorType;
  value: string;
  hollowCircle: boolean;
  onPick: (e: ColorEvent) => void;
};

export class EdgelessShapeColorPicker extends WithDisposable(
  SignalWatcher(LitElement)
) {
  static override styles = css`
    .pickers {
      display: flex;
      align-self: stretch;
      gap: 12px;
    }

    .picker {
      display: flex;
      align-self: stretch;
      gap: 8px;
    }

    .picker-label {
      color: ${unsafeCSSVarV2('text/secondary')};
      font-weight: 400;
    }
  `;

  tabType$ = signal<TabType>('normal');

  colorType$ = signal<ColorType>('fillColor');

  readonly #pickFillColor = (e: ColorEvent) => {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent<PickColorEvent>('pickFillColor', {
        detail: {
          type: 'pick',
          detail: e.detail,
        },
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
  };

  readonly #pickStrokeColor = (e: ColorEvent) => {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent<PickColorEvent>('pickStrokeColor', {
        detail: {
          type: 'pick',
          detail: e.detail,
        },
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
  };

  readonly #pickColor = (detail: PickColorEvent) => {
    const type =
      this.colorType$.peek() === 'fillColor'
        ? 'pickFillColor'
        : 'pickStrokeColor';
    this.dispatchEvent(
      new CustomEvent<PickColorEvent>(type, {
        detail,
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
  };

  readonly #pickStrokeStyle = (e: CustomEvent<LineDetailType>) => {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent('pickStrokeStyle', {
        detail: e.detail,
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
  };

  #calcCustomButtonStyle(color: string, isCustomColor: boolean) {
    return calcCustomButtonStyle(color, isCustomColor, this);
  }

  #calcCustomButtonState(color: string, theme: ColorScheme) {
    return !this.palettes
      .map(({ value }) => resolveColor(value, theme))
      .includes(color);
  }

  #switchToCustomWith(type: ColorType) {
    batch(() => {
      this.tabType$.value = 'custom';
      this.colorType$.value = type;
    });
  }

  get fillColorWithoutAlpha() {
    const { fillColor } = this.payload;
    return keepColor(
      fillColor.startsWith('--')
        ? rgbaToHex8(
            preprocessColor(window.getComputedStyle(this))({
              type: 'normal',
              value: fillColor,
            }).rgba
          )
        : fillColor
    );
  }

  override firstUpdated() {
    this.disposables.addFromEvent(
      this.menuButton,
      'toggle',
      (e: CustomEvent<boolean>) => {
        const opened = e.detail;
        if (!opened && this.tabType$.peek() === 'custom') {
          this.tabType$.value = 'normal';
        }
      }
    );
  }

  override render() {
    const {
      tabType$: { value: tabType },
      colorType$: { value: colorType },
      palettes,
      fillColorWithoutAlpha,
      payload: {
        fillColor,
        strokeColor,
        strokeWidth,
        strokeStyle,
        originalFillColor,
        originalStrokeColor,
        theme,
        enableCustomColor,
      },
    } = this;

    return html`
      <editor-menu-button
        .contentPadding="${tabType === 'normal' ? '8px' : '0px'}"
        @click=${stopPropagation}
        .button=${html`
          <editor-icon-button aria-label="Color" .tooltip="${'Color'}">
            <edgeless-color-button
              .color=${fillColorWithoutAlpha}
            ></edgeless-color-button>
          </editor-icon-button>
        `}
      >
        <div class="pickers" data-orientation="vertical">
          ${choose(tabType, [
            [
              'normal',
              () => {
                return html`
                  ${repeat(
                    [
                      {
                        label: 'Fill color',
                        type: 'fillColor',
                        value: fillColor,
                        hollowCircle: false,
                        onPick: this.#pickFillColor,
                      },
                      {
                        label: 'Border color',
                        type: 'strokeColor',
                        value: strokeColor,
                        hollowCircle: true,
                        onPick: this.#pickStrokeColor,
                      },
                    ] satisfies PickerType[],
                    item => item.type,
                    ({ label, type, value, onPick, hollowCircle }) => html`
                      <div class="picker-label">${label}</div>
                      <edgeless-color-panel
                        aria-label="${label}"
                        role="listbox"
                        .hasTransparent=${false}
                        .hollowCircle=${hollowCircle}
                        .value=${value}
                        .theme=${theme}
                        .palettes=${palettes}
                        @select=${onPick}
                      >
                        ${when(enableCustomColor, () => {
                          const isCustomColor = this.#calcCustomButtonState(
                            value,
                            theme
                          );
                          const styleInfo = this.#calcCustomButtonStyle(
                            value,
                            isCustomColor
                          );
                          return html`
                            <edgeless-color-custom-button
                              slot="custom"
                              style=${styleMap(styleInfo)}
                              ?active=${isCustomColor}
                              @click=${() => this.#switchToCustomWith(type)}
                            ></edgeless-color-custom-button>
                          `;
                        })}
                      </edgeless-color-panel>
                    `
                  )}
                  <div class="picker-label">Border style</div>
                  <edgeless-line-styles-panel
                    class="picker"
                    .lineSize=${strokeWidth}
                    .lineStyle=${strokeStyle}
                    @select=${this.#pickStrokeStyle}
                  ></edgeless-line-styles-panel>
                `;
              },
            ],
            [
              'custom',
              () => {
                const isFillColor = colorType === 'fillColor';
                const packed = packColorsWith(
                  theme,
                  isFillColor ? fillColor : strokeColor,
                  isFillColor ? originalFillColor : originalStrokeColor
                );
                const type = packed.type === 'palette' ? 'normal' : packed.type;
                const modes = packed.colors.map(
                  preprocessColor(window.getComputedStyle(this))
                );

                return html`
                  <edgeless-color-picker
                    class="custom"
                    .pick=${this.#pickColor}
                    .colors=${{ type, modes }}
                  ></edgeless-color-picker>
                `;
              },
            ],
          ])}
        </div>
      </editor-menu-button>
    `;
  }

  @property({ attribute: false })
  accessor payload!: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: LineWidth;
    strokeStyle: StrokeStyle;
    originalFillColor: Color;
    originalStrokeColor: Color;
    theme: ColorScheme;
    enableCustomColor: boolean;
  };

  @property({ attribute: false })
  accessor palettes: Palette[] = DefaultTheme.Palettes;

  @query('editor-menu-button')
  accessor menuButton!: EditorMenuButton;
}
