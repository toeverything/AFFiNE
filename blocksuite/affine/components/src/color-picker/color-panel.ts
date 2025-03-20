import type { Color, ColorScheme, Palette } from '@blocksuite/affine-model';
import {
  DefaultTheme,
  isTransparent,
  resolveColor,
} from '@blocksuite/affine-model';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { ColorEvent } from '@blocksuite/affine-shared/utils';
import { css, html, LitElement, nothing, svg, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ifDefined } from 'lit/directives/if-defined.js';
import { repeat } from 'lit/directives/repeat.js';
import isEqual from 'lodash-es/isEqual';

function TransparentIcon(hollowCircle = false) {
  const CircleIcon: TemplateResult | typeof nothing = hollowCircle
    ? svg`<circle cx="10" cy="10" r="8" fill="white" />`
    : nothing;

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
        d="M-1.17405 5.17857C-1.2241 5.5285 -1.25 5.88623 -1.25 6.25V8.39286H1.96429V11.6071H-1.25V13.75C-1.25 14.1138 -1.2241 14.4715 -1.17405 14.8214H1.96429V18.0357H0.0943102C0.602244 18.7639 1.23609 19.3978 1.96429 19.9057V18.0357L5.17857 18.0357V21.174C5.5285 21.2241 5.88623 21.25 6.25 21.25H8.39286V18.0357H11.6071V21.25H13.75C14.1138 21.25 14.4715 21.2241 14.8214 21.174V18.0357H18.0357L18.0357 19.9057C18.7639 19.3978 19.3978 18.7639 19.9057 18.0357L18.0357 18.0357V14.8214H21.174C21.2241 14.4715 21.25 14.1138 21.25 13.75V11.6071H18.0357V8.39286H21.25V6.25C21.25 5.88623 21.2241 5.5285 21.174 5.17857H18.0357V1.96429H19.9057C19.3978 1.23609 18.7639 0.602244 18.0357 0.09431L18.0357 1.96429H14.8214V-1.17405C14.4715 -1.2241 14.1138 -1.25 13.75 -1.25H11.6071V1.96429H8.39286V-1.25H6.25C5.88623 -1.25 5.5285 -1.2241 5.17857 -1.17405V1.96429H1.96429V0.0943099C1.23609 0.602244 0.602244 1.23609 0.0943099 1.96429H1.96429V5.17857H-1.17405ZM5.17857 5.17857V1.96429H8.39286V5.17857H5.17857ZM5.17857 8.39286H1.96429V5.17857H5.17857V8.39286ZM8.39286 8.39286V5.17857H11.6071V8.39286H8.39286ZM8.39286 11.6071V8.39286H5.17857V11.6071H1.96429V14.8214H5.17857V18.0357H8.39286V14.8214H11.6071V18.0357H14.8214V14.8214H18.0357V11.6071H14.8214V8.39286H18.0357V5.17857H14.8214V1.96429H11.6071V5.17857H14.8214V8.39286H11.6071V11.6071H8.39286ZM8.39286 11.6071V14.8214H5.17857V11.6071H8.39286ZM11.6071 11.6071H14.8214V14.8214H11.6071V11.6071Z"
        fill="#D9D9D9"
      />
      ${CircleIcon}
    </svg>
  `;
}

function CircleIcon(color: string) {
  return html`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="${color}"
    >
      <circle cx="10" cy="10" r="10" />
    </svg>
  `;
}

function HollowCircleIcon(color: string) {
  return html`
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="20"
      height="20"
      viewBox="0 0 20 20"
      fill="${color}"
    >
      <path
        fill-rule="evenodd"
        clip-rule="evenodd"
        d="M10 17C13.866 17 17 13.866 17 10C17 6.13401 13.866 3 10 3C6.13401 3 3 6.13401 3 10C3 13.866 6.13401 17 10 17ZM10 20C15.5228 20 20 15.5228 20 10C20 4.47715 15.5228 0 10 0C4.47715 0 0 4.47715 0 10C0 15.5228 4.47715 20 10 20Z"
      />
    </svg>
  `;
}

function AdditionIcon(color: string, hollowCircle: boolean) {
  if (isTransparent(color)) {
    return TransparentIcon(hollowCircle);
  }

  if (hollowCircle) {
    return HollowCircleIcon(color);
  }

  return CircleIcon(color);
}

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
      grid-template-columns: repeat(9, 1fr);
    }

    /* note */
    :host(.small) {
      grid-template-columns: repeat(6, 1fr);
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

  override render() {
    const resolvedValue = this.resolvedValue;
    return html`
      ${repeat(
        this.palettes,
        palette => palette.key,
        palette => {
          const resolvedColor = resolveColor(palette.value, this.theme);
          const activated = isEqual(resolvedColor, resolvedValue);
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
