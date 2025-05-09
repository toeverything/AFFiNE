import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { WithDisposable } from '@blocksuite/global/lit';
import { EmbedIcon } from '@blocksuite/icons/lit';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import { IDLE_CARD_DEFAULT_HEIGHT } from '../consts';
import type { EmbedIframeStatusCardOptions } from '../types';

export class EmbedIframeIdleCard extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      width: 100%;
      height: 100%;
    }

    .affine-embed-iframe-idle-card {
      container: affine-embed-iframe-idle-card / size;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      padding: 12px;
      gap: 8px;
      border-radius: 8px;
      background-color: ${unsafeCSSVarV2('layer/background/secondary')};

      .icon {
        display: flex;
        justify-content: center;
        align-items: center;
        color: ${unsafeCSSVarV2('icon/secondary')};
        flex-shrink: 0;
      }

      .text {
        /* Client/base */
        font-size: 15px;
        font-style: normal;
        font-weight: 400;
        line-height: 24px; /* 160% */
        font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
        color: ${unsafeCSSVarV2('text/secondary')};
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }

    .affine-embed-iframe-idle-card:hover {
      cursor: pointer;
    }

    .affine-embed-iframe-idle-card.horizontal {
      flex-direction: row;

      .icon {
        width: 24px;
        height: 24px;

        svg {
          width: 24px;
          height: 24px;
        }
      }
    }

    .affine-embed-iframe-idle-card.vertical {
      flex-direction: column;
      justify-content: center;
      overflow: hidden;
      gap: 12px;

      .icon {
        width: 176px;
        height: 112px;
        overflow-y: hidden;

        svg {
          width: 112px;
          height: 112px;
          transform: rotate(12deg) translateY(18%);
        }
      }

      .text {
        text-align: center;
        white-space: normal;
        word-break: break-word;
      }

      @container affine-embed-iframe-idle-card (height < 180px) {
        .icon {
          display: none;
        }
      }
    }
  `;

  override render() {
    const { layout, width, height } = this.options;
    const cardClasses = classMap({
      'affine-embed-iframe-idle-card': true,
      horizontal: layout === 'horizontal',
      vertical: layout === 'vertical',
    });

    const cardWidth = width ? `${width}px` : '100%';
    const cardHeight = height ? `${height}px` : '100%';
    const cardStyle = styleMap({
      width: cardWidth,
      height: cardHeight,
    });

    return html`
      <div class=${cardClasses} style=${cardStyle}>
        <span class="icon"> ${EmbedIcon()} </span>
        <span class="text">
          Embed anything (Google Drive, Google Docs, Spotify, Miro…)
        </span>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor options: EmbedIframeStatusCardOptions = {
    layout: 'horizontal',
    height: IDLE_CARD_DEFAULT_HEIGHT,
  };
}
