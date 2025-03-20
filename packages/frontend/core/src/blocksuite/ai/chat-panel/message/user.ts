import '../content/images';
import '../content/pure-text';

import { ShadowlessElement } from '@blocksuite/affine/block-std';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { css, html, nothing } from 'lit';
import { property } from 'lit/decorators.js';

import { type ChatMessage } from '../chat-context';

export class ChatMessageUser extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .chat-message-user {
      display: flex;
      flex-direction: column;
    }

    .chat-content-images {
      display: flex;

      .images-row {
        margin-left: auto;
      }
    }

    .text-content-wrapper {
      align-self: flex-end;
    }
  `;

  @property({ attribute: false })
  accessor item!: ChatMessage;

  renderContent() {
    const { item } = this;

    return html`
      ${item.attachments
        ? html`<chat-content-images
            class="chat-content-images"
            .images=${item.attachments}
          ></chat-content-images>`
        : nothing}
      <div class="text-content-wrapper">
        <chat-content-pure-text .text=${item.content}></chat-content-pure-text>
      </div>
    `;
  }

  protected override render() {
    return html` <div class="chat-message-user">${this.renderContent()}</div> `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-message-user': ChatMessageUser;
  }
}
