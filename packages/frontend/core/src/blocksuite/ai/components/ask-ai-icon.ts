import { AIStarIcon } from '@blocksuite/affine/components/icons';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

export type ButtonSize = 'small' | 'middle' | 'large';

const buttonWidthMap: Record<ButtonSize, string> = {
  small: '72px',
  middle: '76px',
  large: '82px',
};

const buttonHeightMap: Record<ButtonSize, string> = {
  small: '24px',
  middle: '32px',
  large: '32px',
};

export class AskAIIcon extends WithDisposable(LitElement) {
  @property({ attribute: false })
  accessor size!: ButtonSize;

  static override styles = css`
    .ask-ai-icon-button {
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--affine-brand-color);
      font-size: var(--affine-font-sm);
      font-weight: 500;
    }

    .ask-ai-icon-button.small {
      font-size: var(--affine-font-xs);
      svg {
        scale: 0.8;
        margin-right: 2px;
      }
    }

    .ask-ai-icon-button.large {
      font-size: var(--affine-font-md);
      svg {
        scale: 1.2;
      }
    }

    .ask-ai-icon-button span {
      line-height: 22px;
    }

    .ask-ai-icon-button svg {
      margin-right: 4px;
      color: var(--affine-brand-color);
    }
  `;

  override render() {
    return html`
      <icon-button
        class="ask-ai-icon-button ${this.size}"
        width=${buttonWidthMap[this.size]}
        height=${buttonHeightMap[this.size]}
      >
        ${AIStarIcon}
        <span>Ask AI</span>
      </icon-button>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ask-ai-icon': AskAIIcon;
  }
}
