import { ColorScheme, NoteShadow } from '@blocksuite/affine-model';
import { WithDisposable } from '@blocksuite/global/lit';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { NoteNoShadowIcon, NoteShadowSampleIcon } from './icons';

const SHADOWS = [
  {
    type: NoteShadow.None,
    styles: {
      light: '',
      dark: '',
    },
    tooltip: 'No shadow',
  },
  {
    type: NoteShadow.Box,
    styles: {
      light:
        '0px 0.2px 4.8px 0px rgba(66, 65, 73, 0.2), 0px 0px 1.6px 0px rgba(66, 65, 73, 0.2)',
      dark: '0px 0.2px 6px 0px rgba(0, 0, 0, 0.44), 0px 0px 2px 0px rgba(0, 0, 0, 0.66)',
    },
    tooltip: 'Box shadow',
  },
  {
    type: NoteShadow.Sticker,
    styles: {
      light:
        '0px 9.6px 10.4px -4px rgba(66, 65, 73, 0.07), 0px 10.4px 7.2px -8px rgba(66, 65, 73, 0.22)',
      dark: '0px 9.6px 10.4px -4px rgba(0, 0, 0, 0.66), 0px 10.4px 7.2px -8px rgba(0, 0, 0, 0.44)',
    },
    tooltip: 'Sticker shadow',
  },
  {
    type: NoteShadow.Paper,
    styles: {
      light:
        '0px 0px 0px 4px rgba(255, 255, 255, 1), 0px 1.2px 2.4px 4.8px rgba(66, 65, 73, 0.16)',
      dark: '0px 1.2px 2.4px 4.8px rgba(0, 0, 0, 0.36), 0px 0px 0px 3.4px rgba(75, 75, 75, 1)',
    },
    tooltip: 'Paper shadow',
  },
  {
    type: NoteShadow.Float,
    styles: {
      light:
        '0px 5.2px 12px 0px rgba(66, 65, 73, 0.13), 0px 0px 0.4px 1px rgba(0, 0, 0, 0.06)',
      dark: '0px 5.2px 12px 0px rgba(0, 0, 0, 0.66), 0px 0px 0.4px 1px rgba(0, 0, 0, 0.44)',
    },
    tooltip: 'Floation shadow',
  },
  {
    type: NoteShadow.Film,
    styles: {
      light:
        '0px 0px 0px 1.4px rgba(0, 0, 0, 1), 2.4px 2.4px 0px 1px rgba(0, 0, 0, 1)',
      dark: '0px 0px 0px 1.4px rgba(178, 178, 178, 1), 2.4px 2.4px 0px 1px rgba(178, 178, 178, 1)',
    },
    tooltip: 'Film shadow',
  },
];

export class EdgelessNoteShadowPanel extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
    }

    .item {
      padding: 8px;
      border-radius: 4px;
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    }

    .item-icon {
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .item:hover {
      background-color: var(--affine-hover-color);
    }
  `;

  override render() {
    return repeat(
      SHADOWS,
      shadow => shadow,
      (shadow, index) =>
        html`<style>
            .item-icon svg rect:first-of-type {
              fill: ${this.background.startsWith('--')
                ? `var(${this.background})`
                : this.background};
            }
          </style>
          <div
            class="item"
            @click=${() => this.onSelect(shadow.type)}
            style=${styleMap({
              border:
                this.value === shadow.type
                  ? '1px solid var(--affine-brand-color)'
                  : 'none',
            })}
          >
            <edgeless-tool-icon-button
              class="item-icon"
              data-testid=${shadow.type.replace('--', '')}
              .tooltip=${shadow.tooltip}
              .tipPosition=${'bottom'}
              .iconContainerPadding=${0}
              style=${styleMap({
                boxShadow: `${this.theme === ColorScheme.Dark ? shadow.styles.dark : shadow.styles.light}`,
              })}
            >
              ${index === 0 ? NoteNoShadowIcon : NoteShadowSampleIcon}
            </edgeless-tool-icon-button>
          </div>`
    );
  }

  @property({ attribute: false })
  accessor background!: string;

  @property({ attribute: false })
  accessor onSelect!: (value: string) => void;

  @property({ attribute: false })
  accessor theme!: ColorScheme;

  @property({ attribute: false })
  accessor value!: string;
}
