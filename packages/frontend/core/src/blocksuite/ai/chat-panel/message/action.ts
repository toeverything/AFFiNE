import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { html } from 'lit';
import { property } from 'lit/decorators.js';

import { type ChatAction } from '../../components/ai-chat-messages';
import { HISTORY_IMAGE_ACTIONS } from '../../utils/history-image-actions';

export class ChatMessageAction extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor item!: ChatAction;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'chat-message-action';

  renderHeader() {
    return html`
      <div class="user-info">
        <chat-assistant-avatar></chat-assistant-avatar>
      </div>
    `;
  }

  renderContent() {
    const { host, item } = this;

    switch (item.action) {
      case 'Create a presentation':
        return html`<action-slides
          .host=${host}
          .item=${item}
        ></action-slides>`;
      case 'Make it real':
        return html`<action-make-real
          .host=${host}
          .item=${item}
        ></action-make-real>`;
      case 'Brainstorm mindmap':
        return html`<action-mindmap
          .host=${host}
          .item=${item}
        ></action-mindmap>`;
      case 'Explain this image':
      case 'Generate a caption':
        return html`<action-image-to-text
          .host=${host}
          .item=${item}
        ></action-image-to-text>`;
      default:
        if (HISTORY_IMAGE_ACTIONS.includes(item.action)) {
          return html`<action-image
            .host=${host}
            .item=${item}
          ></action-image>`;
        }

        return html`<action-text
          .item=${item}
          .host=${host}
          .isCode=${item.action === 'Explain this code' ||
          item.action === 'Check code error'}
        ></action-text>`;
    }
  }

  protected override render() {
    return html` ${this.renderHeader()} ${this.renderContent()} `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-message-action': ChatMessageAction;
  }
}
