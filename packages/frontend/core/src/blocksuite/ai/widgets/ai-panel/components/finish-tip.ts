import {
  AIDoneIcon,
  CopyIcon,
  WarningIcon,
} from '@blocksuite/affine/components/icons';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { NotificationProvider } from '@blocksuite/affine/shared/services';
import type { EditorHost } from '@blocksuite/affine/std';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { property, state } from 'lit/decorators.js';

import type { CopyConfig } from '../type.js';

export class AIFinishTip extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
    }
    .finish-tip {
      display: flex;
      box-sizing: border-box;
      width: 100%;
      height: 22px;
      align-items: center;
      justify-content: space-between;
      padding: 0 12px;
      gap: 4px;

      color: var(--affine-text-secondary-color);

      .text {
        display: flex;
        align-items: flex-start;
        flex: 1 0 0;

        /* light/xs */
        font-size: var(--affine-font-xs);
        font-style: normal;
        font-weight: 400;
        line-height: 20px; /* 166.667% */
      }

      .right {
        display: flex;
        align-items: center;

        .copy,
        .copied {
          display: flex;
          width: 20px;
          height: 20px;
          justify-content: center;
          align-items: center;
          border-radius: 8px;
          user-select: none;
        }
        .copy:hover {
          color: var(--affine-icon-color);
          background: var(--affine-hover-color);
          cursor: pointer;
        }
        .copied {
          color: var(--affine-brand-color);
        }
      }
    }
  `;

  override render() {
    return html`<div class="finish-tip">
      ${WarningIcon}
      <div class="text">AI outputs can be misleading or wrong</div>
      ${this.copy?.allowed
        ? html`<div class="right">
            ${this.copied
              ? html`<div class="copied" data-testid="answer-copied">
                  ${AIDoneIcon}
                </div>`
              : html`<div
                  class="copy"
                  data-testid="answer-copy-button"
                  @click=${async () => {
                    this.copied = !!(await this.copy?.onCopy());
                    if (this.copied) {
                      this.host.std
                        .getOptional(NotificationProvider)
                        ?.toast('Copied to clipboard');
                    }
                  }}
                >
                  ${CopyIcon}
                  <affine-tooltip>Copy</affine-tooltip>
                </div>`}
          </div>`
        : nothing}
    </div>`;
  }

  @state()
  accessor copied = false;

  @property({ attribute: false })
  accessor copy: CopyConfig | undefined = undefined;

  @property({ attribute: false })
  accessor host!: EditorHost;
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-finish-tip': AIFinishTip;
  }
}
