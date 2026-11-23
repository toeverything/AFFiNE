import type { Color, ColorScheme, Palette } from '@blocksuite/affine-model';
import { DefaultTheme, resolveColor } from '@blocksuite/affine-model';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { ColorEvent } from '@blocksuite/affine-shared/utils';
import { css, html, LitElement, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';
import isEqual from 'lodash-es/isEqual';

import { AdditionIcon } from './icons';

export class EdgelessColorButton extends LitElement {
  static override styles = css`
    :host {
      position: relative;
      width: 20px;
      height: 20px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    }

    .color-unit {
      position: relative;
      width: 16px;
      height: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 50%;
      box-sizing: border-box;
    }
    .color-unit svg {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      overflow: hidden;
    }
    :host .color-unit::after {
      position: absolute;
      display: block;
      content: '';
      width: 100%;
      height: 100%;
      border-radius: 50%;
      box-sizing: border-box;
      overflow: hidden;
      border-width: 0.5px;
      border-style: solid;
      border-color: ${unsafeCSSVarV2('layer/insideBorder/blackBorder')};
    }
    :host(.black) .color-unit:after {
      border-color: ${unsafeCSSVarV2('layer/insideBorder/border')};
    }

    :host(.large) {
      width: 24px;
      height: 24px;
    }
    :host(.large) .color-unit {
      width: 20px;
      height: 20px;
    }
    :host::after {
      position: absolute;
      display: block;
      content: '';
      width: 27px;
      height: 27px;
      border-radius: 50%;
      box-sizing: border-box;
      overflow: hidden;
      pointer-events: none;
    }

    :host([active])::after {
      border: 1.5px solid var(--affine-primary-color);
    }
  `;

  get preprocessColor() {
    const value = resolveColor(this.color, this.theme);
    return value.startsWith('--') ? `var(${value})` : value;
  }

  override render() {
    const { label, preprocessColor, hollowCircle } = this;
    const additionIcon = AdditionIcon(preprocessColor, !!hollowCircle);
    return html`<div class="color-unit" aria-label=${ifDefined(label)}>
      ${additionIcon}
    </div>`;
  }

  @property({ attribute: true, type: Boolean })
  accessor active: boolean = false;

  @property({ attribute: false })
  accessor color!: Color;

  @property({ attribute: false })
  accessor hollowCircle: boolean = false;

  @property({ attribute: false })
  accessor label: string | undefined = undefined;

  @property({ attribute: false })
  accessor theme!: ColorScheme;
}

export class EdgelessColorPanel extends LitElement {
  static override styles = css`
    :host {
      display: grid;
      grid-gap: 4px;
      grid-template-columns: repeat(var(--columns, 9), 1fr);
    }

    /* note */
    :host(.small) {
      grid-template-columns: repeat(var(--columns, 6), 1fr);
      grid-gap: 8px;
    }

    /* edgeless toolbar */
    :host(.one-way) {
      display: flex;
      flex-wrap: nowrap;
      padding: 0 2px;
      gap: 14px;
      box-sizing: border-box;
      background: var(--affine-background-overlay-panel-color);
    }

    :host(.one-way.small) {
      display: flex;
      gap: 4px;
      background: unset;
    }
  `;

  select(palette: Palette) {
    this.dispatchEvent(
      new ColorEvent('select', {
        detail: palette,
        bubbles: true,
        composed: true,
        cancelable: true,
      })
    );
  }

  get resolvedValue() {
    return this.value && resolveColor(this.value, this.theme);
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('columns')) {
      if (this.columns) {
        this.style.setProperty('--columns', this.columns.toString());
      } else {
        this.style.removeProperty('--columns');
      }
    }
  }

  override render() {
    return html`
      ${repeat(
        this.palettes,
        palette => palette.key,
        palette => {
          const resolvedColor = resolveColor(palette.value, this.theme);
          const activated = isEqual(resolvedColor, this.resolvedValue);
          return html`<edgeless-color-button
            class=${classMap({ large: true })}
            .label=${palette.key}
            .color=${palette.value}
            .theme=${this.theme}
            .hollowCircle=${this.hollowCircle}
            ?active=${activated}
            @click=${() => {
              this.select(palette);
              this.value = resolvedColor;
            }}
          >
          </edgeless-color-button>`;
        }
      )}
      <slot name="custom"></slot>
    `;
  }

  @property({ attribute: false })
  accessor hasTransparent: boolean = true;

  @property({ attribute: false })
  accessor hollowCircle = false;

  @property({ type: Array })
  accessor palettes: readonly Palette[] = DefaultTheme.Palettes;

  @property({ attribute: false })
  accessor theme!: ColorScheme;

  @property({ attribute: false })
  accessor value: Color | null = null;

  @property({ attribute: false })
  accessor columns: number | undefined = undefined;
}

export class EdgelessTextColorIcon extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 20px;
      height: 20px;
    }
  `;

  get preprocessColor() {
    const color = this.color;
    return color.startsWith('--') ? `var(${color})` : color;
  }

  override render() {
    return html`
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
      >
        <path
          fill-rule="evenodd"
          clip-rule="evenodd"
          fill="currentColor"
          d="M8.71093 3.85123C8.91241 3.31395 9.42603 2.95801 9.99984 2.95801C10.5737 2.95801 11.0873 3.31395 11.2888 3.85123L14.7517 13.0858C14.8729 13.409 14.7092 13.7692 14.386 13.8904C14.0628 14.0116 13.7025 13.8479 13.5813 13.5247L12.5648 10.8141H7.43487L6.41838 13.5247C6.29718 13.8479 5.93693 14.0116 5.61373 13.8904C5.29052 13.7692 5.12677 13.409 5.24797 13.0858L8.71093 3.85123ZM7.90362 9.56405H12.0961L10.1183 4.29013C10.0998 4.24073 10.0526 4.20801 9.99984 4.20801C9.94709 4.20801 9.89986 4.24073 9.88134 4.29013L7.90362 9.56405Z"
        />
        <rect
          x="3.3335"
          y="15"
          width="13.3333"
          height="2.08333"
          rx="1"
          fill=${this.preprocessColor}
        />
      </svg>
    `;
  }

  @property({ attribute: false })
  accessor color!: string;
}
