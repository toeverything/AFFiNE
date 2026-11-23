import { LoadingIcon } from '@blocksuite/affine-components/icons';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import { EmbedIcon } from '@blocksuite/icons/lit';
import { type BlockStdScope } from '@blocksuite/std';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import { LOADING_CARD_DEFAULT_HEIGHT } from '../consts';
import type { EmbedIframeStatusCardOptions } from '../types';

export class EmbedIframeLoadingCard extends LitElement {
  static override styles = css`
    :host {
      width: 100%;
      height: 100%;
    }

    .affine-embed-iframe-loading-card {
      container: affine-embed-iframe-loading-card / size;
      display: flex;
      box-sizing: border-box;
      border-radius: 8px;
      user-select: none;
      padding: 12px;
      gap: 12px;
      overflow: hidden;
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      background: ${unsafeCSSVarV2('layer/white')};

      .loading-content {
        display: flex;
        gap: 8px;
        align-self: stretch;

        .loading-spinner {
          display: flex;
          width: 24px;
          height: 24px;
          justify-content: center;
          align-items: center;
        }

        .loading-text {
          display: -webkit-box;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 1;
          overflow: hidden;
          color: ${unsafeCSSVarV2('text/primary')};
          text-overflow: ellipsis;
          /* Client/smMedium */
          font-family: Inter;
          font-size: var(--affine-font-sm);
          font-style: normal;
          font-weight: 500;
          line-height: 22px; /* 157.143% */
        }
      }

      .loading-banner {
        display: flex;
        box-sizing: border-box;
        justify-content: center;
        align-items: center;
        flex-shrink: 0;

        .icon-box {
          display: flex;
          transform: rotate(8deg);
          justify-content: center;
          align-items: center;
          flex-shrink: 0;
          border-radius: 4px 4px 0px 0px;
          background: ${unsafeCSSVarV2('slashMenu/background')};
          box-shadow: 0px 0px 5px 0px rgba(66, 65, 73, 0.17);

          svg {
            fill: black;
            fill-opacity: 0.07;
          }
        }
      }

      @container affine-embed-iframe-loading-card (width < 360px) {
        .loading-banner {
          display: none;
        }
      }
    }

    .affine-embed-iframe-loading-card.horizontal {
      flex-direction: row;
      align-items: flex-start;

      .loading-content {
        flex: 1 0 0;
        align-items: flex-start;

        .loading-text {
          flex: 1 0 0;
        }
      }

      .loading-banner {
        width: 204px;
        padding: 3.139px 42.14px 0px 42.14px;

        .icon-box {
          width: 106px;
          height: 106px;

          svg {
            width: 66px;
            height: 66px;
          }
        }
      }
    }

    .affine-embed-iframe-loading-card.vertical {
      flex-direction: column-reverse;
      align-items: center;
      justify-content: center;

      .loading-content {
        justify-content: center;
        font-size: 14px;
        transform: translateX(-2%);
      }

      .loading-banner {
        width: 340px;
        padding: 5.23px 70.234px 0px 70.232px;
        overflow-y: hidden;

        .icon-box {
          width: 176px;
          height: 176px;
          transform: rotate(8deg) translateY(15%);

          svg {
            width: 112px;
            height: 112px;
          }
        }
      }

      @container affine-embed-iframe-loading-card (height < 240px) {
        .loading-banner {
          display: none;
        }
      }
    }
  `;

  override render() {
    const { layout, width, height } = this.options;
    const cardClasses = classMap({
      'affine-embed-iframe-loading-card': true,
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
        <div class="loading-content">
          <div class="loading-spinner">${LoadingIcon()}</div>
          <div class="loading-text">Loading...</div>
        </div>
        <div class="loading-banner">
          <div class="icon-box">${EmbedIcon()}</div>
        </div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor std!: BlockStdScope;

  @property({ attribute: false })
  accessor options: EmbedIframeStatusCardOptions = {
    layout: 'horizontal',
    height: LOADING_CARD_DEFAULT_HEIGHT,
  };
}
