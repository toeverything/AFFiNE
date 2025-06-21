import { WithDisposable } from '@blocksuite/affine/global/lit';
import { ImageProxyService } from '@blocksuite/affine/shared/adapters';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import { ToggleDownIcon } from '@blocksuite/icons/lit';
import { css, html, nothing, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

interface ToolResult {
  title?: string;
  icon?: string | TemplateResult<1>;
  content?: string;
}

export class ToolResultCard extends WithDisposable(ShadowlessElement) {
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
        margin: 4px 2px 4px 12px;
        padding-left: 20px;
        border-left: 1px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
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
      }

      .result-content {
        font-size: 12px;
        line-height: 20px;
        color: ${unsafeCSSVarV2('text/secondary')};
        margin-top: 8px;
        display: -webkit-box;
        -webkit-line-clamp: 4;
        -webkit-box-orient: vertical;
        overflow: hidden;
        text-overflow: ellipsis;
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
  accessor results!: ToolResult[];

  protected override render() {
    const imageProxyService = this.host.store.get(ImageProxyService);

    return html`
      <div class="ai-tool-wrapper">
        <div class="ai-tool-header" data-type="result">
          <div class="ai-icon">${this.icon}</div>
          <div class="ai-tool-name">${this.name}</div>
          <div class="ai-icon">${ToggleDownIcon()}</div>
        </div>
        <div class="ai-tool-results">
          ${this.results.map(
            result => html`
              <div>
                <div class="result-header">
                  <div class="result-title">${result.title || 'Untitled'}</div>
                  ${result.icon
                    ? html`
                        <div class="result-icon">
                          ${typeof result.icon === 'string'
                            ? html`<img
                                src=${imageProxyService.buildUrl(result.icon)}
                                alt="icon"
                                @error=${(e: Event) => {
                                  const target = e.target as HTMLImageElement;
                                  target.style.display = 'none';
                                }}
                              />`
                            : result.icon}
                        </div>
                      `
                    : nothing}
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
}
