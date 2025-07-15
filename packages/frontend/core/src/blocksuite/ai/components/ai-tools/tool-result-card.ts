import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { DEFAULT_IMAGE_PROXY_ENDPOINT } from '@blocksuite/affine-shared/consts';
import { ToggleDownIcon, ToolIcon } from '@blocksuite/icons/lit';
import { type Signal } from '@preact/signals-core';
import { css, html, nothing, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

export interface ToolResult {
  title: string | TemplateResult<1>;
  icon?: string | TemplateResult<1>;
  content?: string;
}

export class ToolResultCard extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .ai-tool-result-wrapper {
      padding: 12px;
      margin: 8px 0;
      border-radius: 8px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      color: ${unsafeCSSVarV2('icon/secondary')};
      transition: color 0.23s ease;

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
        }
      }

      .ai-tool-name {
        font-size: 14px;
        font-weight: 500;
        line-height: 24px;
        margin-left: 0px;
        margin-right: auto;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ai-tool-results {
        display: grid;
        grid-template-rows: 1fr;
        transition:
          grid-template-rows 0.4s cubic-bezier(0.07, 0.83, 0.46, 1),
          opacity 0.4s ease,
          margin-top 0.23s ease,
          transform 0.43s ease;
        padding-left: 11px;
        margin-top: 4px;
        transform-origin: bottom;
      }

      .ai-tool-results[data-collapsed='true'] {
        grid-template-rows: 0fr;
        opacity: 0;
        transform: translateY(10px);
        margin-top: 0px;
      }

      .ai-tool-result-collapse-wrapper {
        overflow: hidden;
      }

      .ai-tool-results-content {
        display: flex;
        flex-direction: column;
        padding: 4px 2px 4px 20px;
        border-left: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      }

      .result-item {
        margin-top: 16px;
      }

      .result-item:first-child {
        margin-top: 0;
      }

      .result-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        line-height: 24px;
      }

      .result-title {
        font-size: 12px;
        font-weight: 400;
        color: ${unsafeCSSVarV2('icon/primary')};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex: 1;
      }

      .result-icon {
        width: 18px;
        height: 18px;

        &:has(img) {
          background-color: ${unsafeCSSVarV2('layer/background/primary')};
          border-radius: 100%;
          border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
        }

        img {
          width: inherit;
          height: inherit;
          border-radius: 100%;
          border: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
        }

        svg {
          width: inherit;
          height: inherit;
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
        opacity: 0.5;
        transition: opacity 0.23s ease;
        user-select: none;
      }

      .footer-icon {
        width: 18px;
        height: 18px;
        background-color: ${unsafeCSSVarV2('layer/background/primary')};
        border-radius: 100%;
        border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};

        img {
          width: 18px;
          height: 18px;
          border-radius: 100%;
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
    .ai-tool-result-wrapper:hover {
      color: ${unsafeCSSVarV2('icon/primary')};

      .footer-icons {
        opacity: 1;
      }
    }
  `;

  @property({ attribute: false })
  accessor name: string = 'Tool result';

  @property({ attribute: false })
  accessor icon: TemplateResult<1> | string = ToolIcon();

  @property({ attribute: false })
  accessor footerIcons: TemplateResult<1>[] | string[] = [];

  @property({ attribute: false })
  accessor results: ToolResult[] = [];

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @state()
  private accessor isCollapsed = true;

  private readonly imageProxyURL = DEFAULT_IMAGE_PROXY_ENDPOINT;

  protected override render() {
    return html`
      <div class="ai-tool-result-wrapper">
        <div class="ai-tool-header" @click=${this.toggleCard}>
          <div class="ai-icon">${this.renderIcon(this.icon)}</div>
          <div class="ai-tool-name">${this.name}</div>
          ${this.isCollapsed
            ? this.renderFooterIcons()
            : html` <div class="ai-icon">${ToggleDownIcon()}</div> `}
        </div>
        <div class="ai-tool-results" data-collapsed=${this.isCollapsed}>
          <div class="ai-tool-result-collapse-wrapper">
            <div class="ai-tool-results-content">
              ${this.results.map(
                result => html`
                  <div class="result-item">
                    <div class="result-header">
                      <div class="result-title">${result.title}</div>
                      <div class="result-icon">
                        ${this.renderIcon(result.icon)}
                      </div>
                    </div>
                    ${result.content
                      ? html`<div class="result-content">
                          ${result.content}
                        </div>`
                      : nothing}
                  </div>
                `
              )}
            </div>
          </div>
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
            <div class="footer-icon" style="z-index: ${index}">
              ${this.renderIcon(icon)}
            </div>
          `
        )}
      </div>
    `;
  }

  buildUrl(imageUrl: string) {
    if (imageUrl.startsWith(this.imageProxyURL)) {
      return imageUrl;
    }
    return `${this.imageProxyURL}?url=${encodeURIComponent(imageUrl)}`;
  }

  private renderIcon(icon: string | TemplateResult<1> | undefined) {
    if (!icon) {
      return nothing;
    }

    if (typeof icon === 'string') {
      return html`<img src=${this.buildUrl(icon)} />`;
    }
    return html`${icon}`;
  }

  private toggleCard() {
    this.isCollapsed = !this.isCollapsed;
  }
}
