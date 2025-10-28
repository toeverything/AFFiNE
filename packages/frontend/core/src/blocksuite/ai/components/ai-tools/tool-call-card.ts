import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { ToolIcon } from '@blocksuite/icons/lit';
import { css, html, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';

export class ToolCallCard extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .ai-tool-call-wrapper {
      padding: 12px;
      margin: 8px 0;
      border-radius: 8px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      background-color: ${unsafeCSSVarV2('layer/background/primary')};

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
    .ai-tool-call-wrapper.shine {
      position: relative;
      overflow: hidden;
      user-select: none;

      &::after {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        pointer-events: none;
        width: 80px;
        height: 100%;
        background: linear-gradient(
          90deg,
          transparent,
          ${unsafeCSSVarV2('layer/background/primary')},
          transparent
        );
        animation: shine 1.8s infinite;
      }
    }

    @keyframes shine {
      0% {
        left: -80px;
      }
      100% {
        left: 100%;
      }
    }
  `;

  @property({ attribute: false })
  accessor name: string = 'Tool calling';

  @property({ attribute: false })
  accessor icon: TemplateResult<1> = ToolIcon();

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
      <div class="ai-tool-call-wrapper shine">
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
