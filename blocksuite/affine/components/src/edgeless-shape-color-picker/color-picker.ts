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
import { BanIcon } from '@blocksuite/icons/lit';
import { batch, signal } from '@preact/signals-core';
import { css, html, LitElement, type PropertyValues } from 'lit';
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
type FillMode = 'fill' | 'gradient';
type ColorType =
  | Extract<keyof ShapeProps, 'fillColor' | 'strokeColor'>
  | 'gradientFinal';
type GradientDirection =
  | 'none'
  | 'N'
  | 'NE'
  | 'E'
  | 'SE'
  | 'S'
  | 'SW'
  | 'W'
  | 'NW';

const GRADIENT_DIRECTIONS: Array<{ key: GradientDirection; label: string }> = [
  { key: 'none', label: '' },
  { key: 'N', label: 'N' },
  { key: 'NE', label: 'NE' },
  { key: 'E', label: 'E' },
  { key: 'SE', label: 'SE' },
  { key: 'S', label: 'S' },
  { key: 'SW', label: 'SW' },
  { key: 'W', label: 'W' },
  { key: 'NW', label: 'NW' },
];

function normalizeGradientDirection(direction?: string): GradientDirection {
  if (!direction) return 'none';
  const normalized = direction.toUpperCase();
  if (normalized === 'N') return 'N';
  if (normalized === 'NE') return 'NE';
  if (normalized === 'E') return 'E';
  if (normalized === 'SE') return 'SE';
  if (normalized === 'S') return 'S';
  if (normalized === 'SW') return 'SW';
  if (normalized === 'W') return 'W';
  if (normalized === 'NW') return 'NW';
  return 'none';
}

export class EdgelessShapeColorPicker extends WithDisposable(
  SignalWatcher(LitElement)
) {
  static override styles = css`
    :host {
      display: block;
    }

    .pickers {
      display: flex;
      flex-direction: column;
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
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .mode-button {
      border: 1px solid transparent;
      background: transparent;
      color: ${unsafeCSSVarV2('text/secondary')};
      border-radius: 6px;
      line-height: 22px;
      font-size: 12px;
      padding: 0 10px;
      cursor: pointer;
    }

    .mode-button:hover {
      background: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }

    .mode-button.active {
      color: ${unsafeCSSVarV2('text/emphasis')};
      border-color: ${unsafeCSSVarV2('layer/insideBorder/border')};
      background: ${unsafeCSSVarV2('layer/background/secondary')};
    }

    .gradient-directions {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 4px 0 0;
      flex-wrap: wrap;
    }

    .direction-button {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      border: 1px solid transparent;
      background: transparent;
      color: ${unsafeCSSVarV2('text/secondary')};
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 10px;
      cursor: pointer;
      padding: 0;
    }

    .direction-button.active {
      border-color: var(--affine-primary-color);
      background: ${unsafeCSSVarV2('layer/background/secondary')};
      color: ${unsafeCSSVarV2('text/emphasis')};
    }

    .direction-button.none svg {
      width: 12px;
      height: 12px;
      color: currentColor;
    }
  `;

  tabType$ = signal<TabType>('normal');
  colorType$ = signal<ColorType>('fillColor');
  fillMode$ = signal<FillMode>('fill');
  gradientDirection$ = signal<GradientDirection>('none');

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

  readonly #pickGradientFinalColor = (e: ColorEvent) => {
    e.stopPropagation();
    this.dispatchEvent(
      new CustomEvent<PickColorEvent>('pickGradientFinalColor', {
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

  readonly #pickGradientDirection = (direction: GradientDirection) => {
    this.gradientDirection$.value = direction;
    this.dispatchEvent(
      new CustomEvent<GradientDirection>('pickGradientDirection', {
        detail: direction,
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
  };

  readonly #pickColor = (detail: PickColorEvent) => {
    const target = this.colorType$.peek();
    const eventType =
      target === 'fillColor'
        ? 'pickFillColor'
        : target === 'gradientFinal'
          ? 'pickGradientFinalColor'
          : 'pickStrokeColor';

    this.dispatchEvent(
      new CustomEvent<PickColorEvent>(eventType, {
        detail,
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
    if (this.inline || !this.menuButton) {
      return;
    }

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

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('payload')) {
      this.gradientDirection$.value = normalizeGradientDirection(
        this.payload.gradientDirection
      );
    }
  }

  #renderContent() {
    const {
      tabType$: { value: tabType },
      colorType$: { value: colorType },
      fillMode$: { value: fillMode },
      palettes,
      payload: {
        fillColor,
        gradientFinal,
        strokeColor,
        strokeWidth,
        strokeStyle,
        originalFillColor,
        originalStrokeColor,
        theme,
        enableCustomColor,
        enableGradient,
      },
    } = this;

    const effectiveGradientDirection = this.gradientDirection$.value;

    const showGradient = enableGradient ?? true;

    const fillDisplayColor =
      fillMode === 'gradient' ? (gradientFinal ?? fillColor) : fillColor;

    return html`<div class="pickers" data-orientation="vertical">
      ${choose(tabType, [
        [
          'normal',
          () => html`
            <div class="picker-label">
              <button
                type="button"
                class="mode-button ${fillMode === 'fill' ? 'active' : ''}"
                @click=${(e: MouseEvent) => {
                  e.preventDefault();
                  e.stopPropagation();
                  batch(() => {
                    this.fillMode$.value = 'fill';
                    this.colorType$.value = 'fillColor';
                  });
                }}
              >
                Fill color
              </button>
              ${when(showGradient, () => {
                return html`<button
                  type="button"
                  class="mode-button ${fillMode === 'gradient' ? 'active' : ''}"
                  @click=${(e: MouseEvent) => {
                    e.preventDefault();
                    e.stopPropagation();
                    batch(() => {
                      this.fillMode$.value = 'gradient';
                      this.colorType$.value = 'gradientFinal';
                    });
                  }}
                >
                  Gradient
                </button>`;
              })}
            </div>

            <edgeless-color-panel
              aria-label="Fill color"
              role="listbox"
              .hasTransparent=${false}
              .hollowCircle=${false}
              .value=${fillDisplayColor}
              .theme=${theme}
              .palettes=${palettes}
              @select=${fillMode === 'gradient'
                ? this.#pickGradientFinalColor
                : this.#pickFillColor}
            >
              ${when(enableCustomColor, () => {
                const isCustomColor = this.#calcCustomButtonState(
                  fillDisplayColor,
                  theme
                );
                const styleInfo = this.#calcCustomButtonStyle(
                  fillDisplayColor,
                  isCustomColor
                );
                return html`
                  <edgeless-color-custom-button
                    slot="custom"
                    style=${styleMap(styleInfo)}
                    ?active=${isCustomColor}
                    @click=${() =>
                      this.#switchToCustomWith(
                        fillMode === 'gradient' ? 'gradientFinal' : 'fillColor'
                      )}
                  ></edgeless-color-custom-button>
                `;
              })}
            </edgeless-color-panel>

            ${when(showGradient && fillMode === 'gradient', () => {
              return html`<div class="gradient-directions">
                ${repeat(
                  GRADIENT_DIRECTIONS,
                  item => item.key,
                  item =>
                    html`<editor-icon-button
                      class="direction-button ${item.key === 'none'
                        ? 'none'
                        : ''} ${effectiveGradientDirection === item.key
                        ? 'active'
                        : ''}"
                      data-direction=${item.key}
                      .tooltip=${item.key === 'none'
                        ? 'No gradient direction'
                        : `Gradient ${item.label}`}
                      @click=${(e: MouseEvent) => {
                        e.preventDefault();
                        e.stopPropagation();
                        this.#pickGradientDirection(item.key);
                      }}
                    >
                      ${item.key === 'none' ? BanIcon() : item.label}
                    </editor-icon-button>`
                )}
              </div>`;
            })}

            <div class="picker-label">Border color</div>
            <edgeless-color-panel
              aria-label="Border color"
              role="listbox"
              .hasTransparent=${false}
              .hollowCircle=${true}
              .value=${strokeColor}
              .theme=${theme}
              .palettes=${palettes}
              @select=${this.#pickStrokeColor}
            >
              ${when(enableCustomColor, () => {
                const isCustomColor = this.#calcCustomButtonState(
                  strokeColor,
                  theme
                );
                const styleInfo = this.#calcCustomButtonStyle(
                  strokeColor,
                  isCustomColor
                );
                return html`
                  <edgeless-color-custom-button
                    slot="custom"
                    style=${styleMap(styleInfo)}
                    ?active=${isCustomColor}
                    @click=${() => this.#switchToCustomWith('strokeColor')}
                  ></edgeless-color-custom-button>
                `;
              })}
            </edgeless-color-panel>

            <div class="picker-label">Border style</div>
            <edgeless-line-styles-panel
              class="picker"
              .lineSize=${strokeWidth}
              .lineStyle=${strokeStyle}
              @select=${this.#pickStrokeStyle}
            ></edgeless-line-styles-panel>
          `,
        ],
        [
          'custom',
          () => {
            const isFillColor = colorType === 'fillColor';
            const isGradientFinal = colorType === 'gradientFinal';
            const targetColor = isFillColor
              ? fillColor
              : isGradientFinal
                ? (gradientFinal ?? fillColor)
                : strokeColor;
            const originalColor = isFillColor
              ? originalFillColor
              : isGradientFinal
                ? (gradientFinal ?? originalFillColor)
                : originalStrokeColor;

            const packed = packColorsWith(theme, targetColor, originalColor);
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
    </div>`;
  }

  override render() {
    const tabType = this.tabType$.value;

    if (this.inline) {
      return this.#renderContent();
    }

    return html`
      <editor-menu-button
        .contentPadding="${tabType === 'normal' ? '8px' : '0px'}"
        @click=${stopPropagation}
        .button=${html`
          <editor-icon-button aria-label="Color" .tooltip="${'Color'}">
            <edgeless-color-button
              .color=${this.fillColorWithoutAlpha}
            ></edgeless-color-button>
          </editor-icon-button>
        `}
      >
        ${this.#renderContent()}
      </editor-menu-button>
    `;
  }

  @property({ attribute: false })
  accessor payload!: {
    fillColor: string;
    strokeColor: string;
    strokeWidth: LineWidth;
    strokeStyle: StrokeStyle;
    gradientFinal?: string;
    gradientDirection?: GradientDirection;
    originalFillColor: Color;
    originalStrokeColor: Color;
    theme: ColorScheme;
    enableCustomColor: boolean;
    enableGradient?: boolean;
  };

  @property({ attribute: false })
  accessor palettes: Palette[] = DefaultTheme.Palettes;

  @property({ type: Boolean })
  accessor inline = false;

  @query('editor-menu-button')
  accessor menuButton!: EditorMenuButton;
}
