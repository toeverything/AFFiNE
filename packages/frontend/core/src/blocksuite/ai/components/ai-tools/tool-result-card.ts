import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { ImageProxyService } from '@blocksuite/affine/shared/adapters';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import { ToggleDownIcon } from '@blocksuite/icons/lit';
import { type Signal } from '@preact/signals-core';
import { css, html, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

interface ToolResult {
  title: string;
  icon?: string | TemplateResult<1>;
  content?: string;
}

export class ToolResultCard extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .ai-tool-wrapper {
      padding: 12px;
      margin: 8px 0;
      border-radius: 8px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};

      .ai-tool-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
        margin-right: 3px;
        cursor: pointer;
      }

      .ai-icon {
        width: 24px;
        height: 24px;

        svg {
          width: 24px;
          height: 24px;
          color: ${unsafeCSSVarV2('icon/primary')};
        }
      }

      .ai-tool-name {
        font-size: 14px;
        font-weight: 500;
        line-height: 24px;
        margin-left: 0px;
        margin-right: auto;
        color: ${unsafeCSSVarV2('icon/primary')};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ai-tool-results {
        display: flex;
        flex-direction: column;
        gap: 4px;
        margin: 8px 2px 4px 12px;
        padding-left: 20px;
        border-left: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      }

      .ai-tool-results[data-collapsed='true'] {
        display: none;
      }

      .result-item {
        margin-top: 12px;
      }

      .result-item:first-child {
        margin-top: 0;
      }

      .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .result-title {
        font-size: 12px;
        font-weight: 400;
        line-height: 20px;
        color: ${unsafeCSSVarV2('icon/primary')};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }

      .result-icon {
        width: 24px;
        height: 24px;

        img {
          width: 24px;
          height: 24px;
          border-radius: 100%;
          border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
        }

        svg {
          width: 24px;
          height: 24px;
          color: ${unsafeCSSVarV2('icon/primary')};
        }
      }

      .result-content {
        font-size: 12px;
        line-height: 20px;
        color: ${unsafeCSSVarV2('text/secondary')};
        margin-top: 4px;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .footer-icons {
        display: flex;
        position: relative;
        height: 24px;
        align-items: center;
      }

      .footer-icon {
        width: 18px;
        height: 18px;

        img {
          width: 18px;
          height: 18px;
          border-radius: 100%;
          border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
        }

        svg {
          width: 18px;
          height: 18px;
          color: ${unsafeCSSVarV2('icon/primary')};
        }
      }

      .footer-icon:not(:first-child) {
        margin-left: -8px;
      }
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor name!: string;

  @property({ attribute: false })
  accessor icon!: TemplateResult<1> | string;

  @property({ attribute: false })
  accessor footerIcons: TemplateResult<1>[] | string[] = [];

  @property({ attribute: false })
  accessor results!: ToolResult[];

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @state()
  private accessor isCollapsed = true;

  protected override render() {
    return html`
      <div class="ai-tool-wrapper">
        <div class="ai-tool-header" @click=${this.toggleCard}>
          <div class="ai-icon">${this.renderIcon(this.icon)}</div>
          <div class="ai-tool-name">${this.name}</div>
          ${this.isCollapsed
            ? this.renderFooterIcons()
            : html` <div class="ai-icon">${ToggleDownIcon()}</div> `}
        </div>
        <div class="ai-tool-results" data-collapsed=${this.isCollapsed}>
          ${this.results.map(
            result => html`
              <div class="result-item">
                <div class="result-header">
                  <div class="result-title">${result.title}</div>
                  <div class="result-icon">${this.renderIcon(result.icon)}</div>
                </div>
                ${result.content
                  ? html` <div class="result-content">${result.content}</div> `
                  : nothing}
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  private renderFooterIcons() {
    if (!this.footerIcons || this.footerIcons.length === 0) {
      return nothing;
    }

    let maxIcons = 3;
    if (this.width && this.width.value !== undefined) {
      maxIcons = this.width.value <= 400 ? 1 : 3;
    }
    const visibleIcons = this.footerIcons.slice(0, maxIcons);

    return html`
      <div class="footer-icons">
        ${visibleIcons.map(
          (icon, index) => html`
            <div
              class="footer-icon"
              style="z-index: ${visibleIcons.length - index}"
            >
              ${this.renderIcon(icon)}
            </div>
          `
        )}
      </div>
    `;
  }

  private renderIcon(icon: string | TemplateResult<1> | undefined) {
    if (!icon) {
      return nothing;
    }
    const imageProxyService = this.host.store.get(ImageProxyService);
    if (typeof icon === 'string') {
      return html` <img src=${imageProxyService.buildUrl(icon)} /> `;
    }
    return html`${icon}`;
  }

  private toggleCard() {
    this.isCollapsed = !this.isCollapsed;
  }
}
