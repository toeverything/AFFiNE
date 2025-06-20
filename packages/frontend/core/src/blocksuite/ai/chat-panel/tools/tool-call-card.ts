import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { css, html, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

export class ToolCallCard extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .ai-tool-call-wrapper {
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
          color: ${unsafeCSSVarV2('icon/activated')};
        }
      }

      .ai-tool-name {
        font-size: 14px;
        font-weight: 500;
        line-height: 24px;
        margin-left: 0px;
        margin-right: auto;
        color: ${unsafeCSSVarV2('icon/activated')};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .loading-dots {
        display: inline;
        margin-left: 2px;
        color: ${unsafeCSSVarV2('icon/activated')};
      }
    }
  `;

  @property({ attribute: false })
  accessor name!: string;

  @property({ attribute: false })
  accessor icon!: TemplateResult<1>;

  @state()
  private accessor dotsText = '.';

  private animationTimer?: number;

  override connectedCallback() {
    super.connectedCallback();
    this.startDotsAnimation();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.stopDotsAnimation();
  }

  private startDotsAnimation() {
    let dotCount = 1;
    this.animationTimer = window.setInterval(() => {
      dotCount = (dotCount % 3) + 1;
      this.dotsText = '.'.repeat(dotCount);
    }, 750);
  }

  private stopDotsAnimation() {
    if (this.animationTimer) {
      clearInterval(this.animationTimer);
      this.animationTimer = undefined;
    }
  }

  protected override render() {
    return html`
      <div class="ai-tool-call-wrapper">
        <div class="ai-tool-header">
          <div class="ai-icon">${this.icon}</div>
          <div class="ai-tool-name">
            ${this.name}<span class="loading-dots">${this.dotsText}</span>
          </div>
        </div>
      </div>
    `;
  }
}
