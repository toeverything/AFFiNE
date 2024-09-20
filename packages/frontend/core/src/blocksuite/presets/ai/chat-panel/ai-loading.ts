import { WithDisposable } from '@blocksuite/affine/global/utils';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

import { AIStarIconWithAnimation } from '../_common/icons';

export class AILoading extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      width: 100%;
    }

    .generating-tip {
      display: flex;
      width: 100%;
      height: 22px;
      align-items: center;
      gap: 8px;

      color: var(--light-brandColor, #1e96eb);

      .text {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        flex: 1 0 0;

        /* light/smMedium */
        font-family: Inter;
        font-size: 14px;
        font-style: normal;
        font-weight: 500;
        line-height: 22px; /* 157.143% */
      }

      .left,
      .right {
        display: flex;
        width: 20px;
        height: 20px;
        justify-content: center;
        align-items: center;
      }
    }
  `;

  @property({ attribute: false })
  accessor stopGenerating!: () => void;

  override render() {
    return html`
      <div class="generating-tip">
        <div class="left">${AIStarIconWithAnimation}</div>
        <div class="text">AI is generating...</div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-loading': AILoading;
  }
}
