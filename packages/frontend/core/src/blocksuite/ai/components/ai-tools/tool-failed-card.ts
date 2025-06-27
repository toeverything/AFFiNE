import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { ToolIcon } from '@blocksuite/icons/lit';
import { css, html, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

export class ToolFailedCard extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .ai-tool-failed-wrapper {
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
          color: ${unsafeCSSVarV2('button/error')};
        }
      }

      .ai-error-name {
        font-size: 14px;
        font-weight: 500;
        line-height: 24px;
        margin-left: 0px;
        margin-right: auto;
        color: ${unsafeCSSVarV2('button/error')};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
    }
  `;

  @property({ attribute: false })
  accessor name: string = 'Tool calling failed';

  @property({ attribute: false })
  accessor icon: TemplateResult<1> = ToolIcon();

  protected override render() {
    return html`
      <div class="ai-tool-failed-wrapper">
        <div class="ai-tool-header">
          <div class="ai-icon">${this.icon}</div>
          <div class="ai-error-name">${this.name}</div>
        </div>
      </div>
    `;
  }
}
