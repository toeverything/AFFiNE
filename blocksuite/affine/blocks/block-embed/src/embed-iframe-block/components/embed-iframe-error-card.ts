import { createLitPortal } from '@blocksuite/affine-components/portal';
import type { EmbedIframeBlockModel } from '@blocksuite/affine-model';
import { unsafeCSSVarV2 } from '@blocksuite/affine-shared/theme';
import type { BlockStdScope } from '@blocksuite/block-std';
import { WithDisposable } from '@blocksuite/global/lit';
import { EditIcon, InformationIcon, ResetIcon } from '@blocksuite/icons/lit';
import { flip, offset } from '@floating-ui/dom';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { property, query } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { styleMap } from 'lit/directives/style-map.js';

import type { EmbedIframeStatusCardOptions } from '../types';

const LINK_EDIT_POPUP_OFFSET = 12;
const ERROR_CARD_DEFAULT_HEIGHT = 114;

export class EmbedIframeErrorCard extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      width: 100%;
      height: 100%;
    }

    .affine-embed-iframe-error-card {
      container: affine-embed-iframe-error-card / inline-size;
      display: flex;
      box-sizing: border-box;
      user-select: none;
      padding: 12px;
      gap: 12px;
      overflow: hidden;
      border-radius: 8px;
      border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      background: ${unsafeCSSVarV2('layer/background/secondary')};
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
      user-select: none;

      .error-content {
        display: flex;
        flex-direction: column;
        gap: 4px;
        flex: 1 0 0;

        .error-title {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow: hidden;

          .error-icon {
            display: flex;
            justify-content: center;
            align-items: center;
            color: ${unsafeCSSVarV2('status/error')};
          }

          .error-title-text {
            color: ${unsafeCSSVarV2('text/primary')};
            text-align: justify;
            /* Client/smBold */
            font-size: var(--affine-font-sm);
            font-style: normal;
            font-weight: 600;
            line-height: 22px; /* 157.143% */
          }
        }

        .error-message {
          display: flex;
          align-self: stretch;
          color: ${unsafeCSSVarV2('text/secondary')};
          overflow: hidden;
          font-feature-settings:
            'liga' off,
            'clig' off;
          text-overflow: ellipsis;
          /* Client/xs */
          font-size: var(--affine-font-xs);
          font-style: normal;
          font-weight: 400;
          line-height: 20px; /* 166.667% */
        }

        .error-info {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow: hidden;
          .button {
            display: flex;
            padding: 0px 4px;
            align-items: center;
            border-radius: 4px;
            cursor: pointer;

            .icon {
              display: flex;
              justify-content: center;
              align-items: center;
            }

            .text {
              padding: 0px 4px;
              font-size: var(--affine-font-xs);
              font-style: normal;
              font-weight: 500;
              line-height: 20px; /* 166.667% */
            }
          }

          .button.edit {
            color: ${unsafeCSSVarV2('text/secondary')};
          }

          .button.retry {
            color: ${unsafeCSSVarV2('text/emphasis')};
          }
        }
      }

      @container affine-embed-iframe-error-card (width < 480px) {
        .error-banner {
          display: none;
        }
      }
    }

    .affine-embed-iframe-error-card.horizontal {
      flex-direction: row;
      align-items: flex-start;

      .error-content {
        align-items: flex-start;

        .error-message {
          height: 40px;
          align-items: flex-start;
        }
      }
    }

    .affine-embed-iframe-error-card.vertical {
      flex-direction: column-reverse;
      align-items: center;
      justify-content: center;

      .error-content {
        justify-content: center;
        align-items: center;

        .error-message {
          justify-content: center;
          align-items: center;
        }
      }
    }
  `;

  private _editAbortController: AbortController | null = null;
  private readonly _toggleEdit = (e: MouseEvent) => {
    e.stopPropagation();
    if (!this._editButton || this.readonly) {
      return;
    }

    if (this._editAbortController) {
      this._editAbortController.abort();
    }

    this._editAbortController = new AbortController();

    createLitPortal({
      template: html`<embed-iframe-link-edit-popup
        .model=${this.model}
        .abortController=${this._editAbortController}
        .std=${this.std}
      ></embed-iframe-link-edit-popup>`,
      portalStyles: {
        zIndex: 'var(--affine-z-index-popover)',
      },
      container: this.host,
      computePosition: {
        referenceElement: this._editButton,
        placement: 'bottom-start',
        middleware: [flip(), offset(LINK_EDIT_POPUP_OFFSET)],
        autoUpdate: { animationFrame: true },
      },
      abortController: this._editAbortController,
      closeOnClickAway: true,
    });
  };

  private readonly _handleRetry = (e: MouseEvent) => {
    e.stopPropagation();
    this.onRetry();
  };

  override render() {
    const { layout, width, height } = this.options;
    const cardClasses = classMap({
      'affine-embed-iframe-error-card': true,
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
        <div class="error-content">
          <div class="error-title">
            <div class="error-icon">
              ${InformationIcon({ width: '16px', height: '16px' })}
            </div>
            <div class="error-title-text">This link couldn’t be loaded.</div>
          </div>
          <div class="error-message">
            ${this.error?.message || 'Failed to load embedded content'}
          </div>
          <div class="error-info">
            ${this.readonly
              ? nothing
              : html`
                  <div class="button edit" @click=${this._toggleEdit}>
                    <span class="icon"
                      >${EditIcon({ width: '16px', height: '16px' })}</span
                    >
                    <span class="text">Edit</span>
                  </div>
                `}
            <div class="button retry" @click=${this._handleRetry}>
              <span class="icon"
                >${ResetIcon({ width: '16px', height: '16px' })}</span
              >
              <span class="text">Reload</span>
            </div>
          </div>
        </div>
        <div class="error-banner">
          <!-- TODO: add error banner icon -->
          <div class="icon-box"></div>
        </div>
      </div>
    `;
  }

  get host() {
    return this.std.host;
  }

  get readonly() {
    return this.model.doc.readonly;
  }

  @query('.button.edit')
  accessor _editButton: HTMLElement | null = null;

  @property({ attribute: false })
  accessor error: Error | null = null;

  @property({ attribute: false })
  accessor onRetry!: () => void;

  @property({ attribute: false })
  accessor model!: EmbedIframeBlockModel;

  @property({ attribute: false })
  accessor std!: BlockStdScope;

  @property({ attribute: false })
  accessor options: EmbedIframeStatusCardOptions = {
    layout: 'horizontal',
    height: ERROR_CARD_DEFAULT_HEIGHT,
  };
}
