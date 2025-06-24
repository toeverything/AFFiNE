import { ColorScheme, NoteShadow } from '@blocksuite/affine-model';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { css, html, LitElement, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { NoteNoShadowIcon, NoteShadowSampleIcon } from './icons';

type Shadow = {
  type: NoteShadow;
  light: Parameters<typeof styleMap>[0];
  dark: Parameters<typeof styleMap>[0];
  style: Parameters<typeof styleMap>[0];
  tooltip: string;
};

const SHADOWS: Shadow[] = [
  {
    type: NoteShadow.None,
    light: {},
    dark: {},
    style: {},
    tooltip: 'No shadow',
  },
  {
    type: NoteShadow.Box,
    light: {
      '--note-box-shadow-color-1': 'rgba(0, 0, 0, 0.14)',
      '--note-box-shadow-color-2': 'rgba(0, 0, 0, 0.14)',
    },
    dark: {
      '--note-box-shadow-color-1': 'rgba(0, 0, 0, 0.30)',
      '--note-box-shadow-color-2': 'rgba(0, 0, 0, 0.44)',
    },
    style: {
      boxShadow:
        '0px 0.109px 2.621px var(--note-box-shadow-color-1), 0px 0px 0.874px var(--note-box-shadow-color-2)',
    },
    tooltip: 'Box shadow',
  },
  {
    type: NoteShadow.Sticker,
    light: {
      '--note-sticker-shadow-color-1': 'rgba(0, 0, 0, 0.08)',
      '--note-sticker-shadow-color-2': 'rgba(0, 0, 0, 0.10)',
    },
    dark: {
      '--note-sticker-shadow-color-1': 'rgba(0, 0, 0, 0.22)',
      '--note-sticker-shadow-color-2': 'rgba(0, 0, 0, 0.52)',
    },
    style: {
      boxShadow:
        '0px 5.243px 5.68px var(--note-sticker-shadow-color-1), 0px 5.68px 3.932px var(--note-sticker-shadow-color-2)',
    },
    tooltip: 'Sticker shadow',
  },
  {
    type: NoteShadow.Paper,
    light: {
      '--note-paper-shadow-color-1': 'rgba(0, 0, 0, 0.14)',
      '--note-paper-shadow-color-2': '#FFF',
    },
    dark: {
      '--note-paper-shadow-color-1': 'rgba(0, 0, 0, 0.30)',
      '--note-paper-shadow-color-2': '#7A7A7A',
    },
    style: {
      border: '2px solid var(--note-paper-shadow-color-2)',
      boxShadow: '0px 0.655px 1.311px var(--note-paper-shadow-color-1)',
    },
    tooltip: 'Paper shadow',
  },
  {
    type: NoteShadow.Float,
    light: {
      '--note-float-shadow-color-1': 'rgba(0, 0, 0, 0.09)',
      '--note-float-shadow-color-2': 'rgba(0, 0, 0, 0.10)',
    },
    dark: {
      '--note-float-shadow-color-1': 'rgba(0, 0, 0, 0.30)',
      '--note-float-shadow-color-2': 'rgba(0, 0, 0, 0.44)',
    },
    style: {
      boxShadow:
        '0px 2.84px 6.554px var(--note-float-shadow-color-1), 0px 0px 0.218px var(--note-float-shadow-color-2)',
    },
    tooltip: 'Floating shadow',
  },
  {
    type: NoteShadow.Film,
    light: {
      '--note-film-shadow-color-1': '#000',
      '--note-film-shadow-color-2': '#000',
    },
    dark: {
      '--note-film-shadow-color-1': '#7A7A7A',
      '--note-film-shadow-color-2': '#7A7A7A',
    },
    style: {
      border: '1px solid var(--note-film-shadow-color-1)',
      boxShadow: '2px 2px 0px var(--note-film-shadow-color-2)',
    },
    tooltip: 'Film shadow',
  },
];

export class EdgelessNoteShadowMenu extends LitElement {
  static override styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
    }

    .item {
      padding: 4.369px;
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

    .item-icon svg {
      width: 30px;
      height: auto;
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/blackBorder')};
      fill: ${unsafeCSSVarV2('layer/insideBorder/blackBorder')};
    }

    .item-icon svg rect:first-of-type {
      fill: var(--background);
    }

    .item:hover {
      background-color: var(--affine-hover-color);
    }

    .item[data-selected] {
      border: 1px solid var(--affine-brand-color);
    }
  `;

  select(value: NoteShadow) {
    this.dispatchEvent(new CustomEvent('select', { detail: value }));
  }

  override willUpdate(changedProperties: PropertyValues<this>) {
    if (changedProperties.has('background')) {
      this.style.setProperty('--background', this.background);
    }
  }

  override render() {
    const { value, theme } = this;
    const isDark = theme === ColorScheme.Dark;

    return repeat(
      SHADOWS,
      shadow => shadow.type,
      ({ type, tooltip, style, light, dark }, index) =>
        html`<div
          class="item"
          ?data-selected="${value === type}"
          @click=${() => this.select(type)}
        >
          <editor-icon-button
            class="item-icon"
            data-testid="${type.replace('--', '')}"
            .tooltip=${tooltip}
            .tipPosition="${'bottom'}"
            .iconContainerPadding=${0}
            .hover=${false}
            style=${styleMap({
              ...(isDark ? dark : light),
              ...style,
            })}
          >
            ${index === 0 ? NoteNoShadowIcon : NoteShadowSampleIcon}
          </editor-icon-button>
        </div>`
    );
  }

  @property({ attribute: false })
  accessor background!: string;

  @property({ attribute: false })
  accessor theme!: ColorScheme;

  @property({ attribute: false })
  accessor value!: NoteShadow;
}

declare global {
  interface HTMLElementTagNameMap {
    'edgeless-note-shadow-menu': EdgelessNoteShadowMenu;
  }
}
