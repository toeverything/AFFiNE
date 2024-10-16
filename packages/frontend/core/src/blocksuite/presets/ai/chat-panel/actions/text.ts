import './action-wrapper';

import type { EditorHost } from '@blocksuite/affine/block-std';
import { WithDisposable } from '@blocksuite/affine/global/utils';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { styleMap } from 'lit/directives/style-map.js';

import { createTextRenderer } from '../../../_common';
import type { ChatAction } from '../chat-context';

export class ActionText extends WithDisposable(LitElement) {
  static override styles = css`
    .original-text {
      border-radius: 4px;
      margin-bottom: 12px;
      font-size: var(--affine-font-sm);
      line-height: 22px;
    }
  `;

  @property({ attribute: false })
  accessor item!: ChatAction;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor isCode = false;

  protected override render() {
    const originalText = this.item.messages[1].content;
    const { isCode } = this;

    return html` <action-wrapper .host=${this.host} .item=${this.item}>
      <div
        style=${styleMap({
          padding: isCode ? '0' : '10px 16px',
          border: isCode ? 'none' : '1px solid var(--affine-border-color)',
        })}
        class="original-text"
      >
        ${createTextRenderer(this.host, {
          customHeading: true,
        })(originalText)}
      </div>
    </action-wrapper>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'action-text': ActionText;
  }
}
