import type { Color, ColorScheme, Palette } from '@blocksuite/affine-model';
import { DefaultTheme, resolveColor } from '@blocksuite/affine-model';
import type { ColorEvent } from '@blocksuite/affine-shared/utils';
import { WithDisposable } from '@blocksuite/global/lit';
import { html, LitElement } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { choose } from 'lit/directives/choose.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { styleMap } from 'lit/directives/style-map.js';
import { when } from 'lit-html/directives/when.js';

import type { EditorMenuButton } from '../toolbar/menu-button';
import type { PickColorEvent } from './types';
import {
  calcCustomButtonStyle,
  keepColor,
  packColorsWith,
  preprocessColor,
  rgbaToHex8,
} from './utils.js';

type Type = 'normal' | 'custom';

export class EdgelessColorPickerButton extends WithDisposable(LitElement) {
  readonly #select = (e: ColorEvent) => {
    e.stopPropagation();
    this.#pick(e.detail);
  };

  switchToCustomTab = (e: MouseEvent) => {
    e.stopPropagation();

    this.tabType = 'custom';
    // refresh menu's position
    this.menuButton.show(true);
  };

  get colorWithoutAlpha() {
    return keepColor(
      this.color.startsWith('--')
        ? rgbaToHex8(
            preprocessColor(window.getComputedStyle(this))({
              type: 'normal',
              value: this.color,
            }).rgba
          )
        : this.color
    );
  }

  get customButtonStyle() {
    return calcCustomButtonStyle(this.color, this.isCustomColor, this);
  }

  get isCustomColor() {
    return !this.palettes
      .map(({ value }) => resolveColor(value, this.theme))
      .includes(this.color);
  }

  get tabContentPadding() {
    return `${this.tabType === 'custom' ? 0 : 8}px`;
  }

  #pick(detail: Palette) {
    this.pick?.({ type: 'start' });
    this.pick?.({ type: 'pick', detail });
    this.pick?.({ type: 'end' });
  }

  override firstUpdated() {
    this.disposables.addFromEvent(
      this.menuButton,
      'toggle',
      (e: CustomEvent<boolean>) => {
        const opened = e.detail;
        if (!opened && this.tabType !== 'normal') {
          this.tabType = 'normal';
        }
      }
    );
  }

  override render() {
    return html`
      <editor-menu-button
        .contentPadding=${this.tabContentPadding}
        .button=${html`
          <editor-icon-button
            aria-label=${this.label}
            .tooltip=${this.tooltip || this.label}
          >
            ${when(
              this.isText,
              () => html`
                <edgeless-text-color-icon
                  .color=${this.colorWithoutAlpha}
                ></edgeless-text-color-icon>
              `,
              () => html`
                <edgeless-color-button
                  .color=${this.colorWithoutAlpha}
                  .hollowCircle=${this.hollowCircle}
                ></edgeless-color-button>
              `
            )}
          </editor-icon-button>
        `}
      >
        ${choose(this.tabType, [
          [
            'normal',
            () => html`
              <div data-orientation="vertical">
                <slot name="other"></slot>
                <slot name="separator"></slot>
                <edgeless-color-panel
                  role="listbox"
                  class=${ifDefined(this.colorPanelClass)}
                  .value=${this.color}
                  .theme=${this.theme}
                  .palettes=${this.palettes}
                  .hollowCircle=${this.hollowCircle}
                  .hasTransparent=${false}
                  @select=${this.#select}
                >
                  ${when(
                    this.enableCustomColor,
                    () => html`
                      <edgeless-color-custom-button
                        slot="custom"
                        style=${styleMap(this.customButtonStyle)}
                        ?active=${this.isCustomColor}
                        @click=${this.switchToCustomTab}
                      ></edgeless-color-custom-button>
                    `
                  )}
                </edgeless-color-panel>
              </div>
            `,
          ],
          [
            'custom',
            () => {
              const packed = packColorsWith(
                this.theme,
                this.color,
                this.originalColor
              );
              const type = packed.type === 'palette' ? 'normal' : packed.type;
              const modes = packed.colors.map(
                preprocessColor(window.getComputedStyle(this))
              );

              return html`
                <edgeless-color-picker
                  class="custom"
                  .pick=${this.pick}
                  .colors=${{ type, modes }}
                ></edgeless-color-picker>
              `;
            },
          ],
        ])}
      </editor-menu-button>
    `;
  }

  @property()
  accessor originalColor!: Color;

  @property()
  accessor color!: string;

  @property()
  accessor colorPanelClass: string | undefined = undefined;

  @property({ attribute: false })
  accessor hollowCircle: boolean = false;

  @property({ attribute: false })
  accessor isText!: boolean;

  @property()
  accessor label!: string;

  @query('editor-menu-button')
  accessor menuButton!: EditorMenuButton;

  @property({ attribute: false })
  accessor palettes: Palette[] = DefaultTheme.Palettes;

  @property({ attribute: false })
  accessor pick!: (event: PickColorEvent) => void;

  @state()
  accessor tabType: Type = 'normal';

  @property({ attribute: false })
  accessor theme!: ColorScheme;

  @property()
  accessor tooltip: string | undefined = undefined;

  @property()
  accessor enableCustomColor: boolean = true;
}
