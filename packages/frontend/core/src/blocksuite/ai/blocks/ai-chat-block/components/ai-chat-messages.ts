import type { TextRendererOptions } from '@affine/core/blocksuite/ai/components/text-renderer';
import type { AffineAIPanelState } from '@affine/core/blocksuite/ai/widgets/ai-panel/type';
import type { EditorHost } from '@blocksuite/affine/std';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import type {
  ChatMessage,
  MessageRole,
} from '../../../components/ai-chat-messages';
import { UserInfoTemplate } from './user-info';

export class AIChatMessage extends LitElement {
  static override styles = css`
    .ai-chat-message {
      display: flex;
      width: 100%;
      flex-direction: column;
      gap: 4px;
      box-sizing: border-box;
    }

    .ai-chat-content {
      display: block;
      width: calc(100% - 34px);
      padding-left: 34px;
      font-weight: 400;
    }

    .with-attachments {
      margin-top: 8px;
    }
  `;

  override render() {
    const {
      host,
      textRendererOptions,
      state,
      content,
      attachments,
      messageRole,
      userId,
      userName,
      avatarUrl,
    } = this;
    const withAttachments = !!attachments && attachments.length > 0;

    const messageClasses = classMap({
      'with-attachments': withAttachments,
    });

    return html`
      <div class="ai-chat-message">
        ${UserInfoTemplate({ userId, userName, avatarUrl }, messageRole)}
        <div class="ai-chat-content">
          <chat-images .attachments=${attachments}></chat-images>
          <div class=${messageClasses}>
            <text-renderer
              .host=${host}
              .answer=${content}
              .options=${textRendererOptions}
              .state=${state}
            ></text-renderer>
          </div>
        </div>
      </div>
    `;
  }

  @property({ attribute: false })
  accessor attachments: string[] | undefined = undefined;

  @property({ attribute: false })
  accessor content: string = '';

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor messageRole: MessageRole | undefined = undefined;

  @property({ attribute: false })
  accessor state: AffineAIPanelState = 'finished';

  @property({ attribute: false })
  accessor textRendererOptions: TextRendererOptions = {};

  @property({ attribute: false })
  accessor userId: string | undefined = undefined;

  @property({ attribute: false })
  accessor userName: string | undefined = undefined;

  @property({ attribute: false })
  accessor avatarUrl: string | undefined = undefined;
}

export class AIChatMessages extends LitElement {
  static override styles = css`
    :host {
      width: 100%;
      box-sizing: border-box;
    }

    .ai-chat-messages {
      display: flex;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      flex-direction: column;
      gap: 24px;
    }
  `;

  override render() {
    return html`<div class="ai-chat-messages">
      ${repeat(
        this.messages,
        message => message.id || message.createdAt,
        message => {
          const { attachments, role, content, userId, userName, avatarUrl } =
            message;
          return html`
            <ai-chat-message
              .host=${this.host}
              .textRendererOptions=${this.textRendererOptions}
              .content=${content}
              .attachments=${attachments}
              .messageRole=${role}
              .userId=${userId}
              .userName=${userName}
              .avatarUrl=${avatarUrl}
            ></ai-chat-message>
          `;
        }
      )}
    </div>`;
  }

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor messages: ChatMessage[] = [];

  @property({ attribute: false })
  accessor textRendererOptions: TextRendererOptions = {};
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-message': AIChatMessage;
    'ai-chat-messages': AIChatMessages;
  }
}
