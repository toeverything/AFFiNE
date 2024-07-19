import './chat-block-input.js';
import './date-time.js';

import type { EditorHost } from '@blocksuite/block-std';
import type { ChatMessage } from '@blocksuite/presets';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, unsafeCSS } from 'lit';
import { customElement, property, query } from 'lit/decorators.js';

@customElement('ai-chat-block-peek-view')
export class AIChatBlockPeekView extends LitElement {
  static override styles = css`
    :host {
      width: 100%;
      height: 100%;
    }

    .ai-chat-block-peek-view-container {
      gap: 8px;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      box-sizing: border-box;
      justify-content: start;
      flex-direction: column;
      box-sizing: border-box;
      padding: 24px 120px 16px 120px;
      font-family: ${unsafeCSS(baseTheme.fontSansFamily)};
    }

    .ai-chat-messages-container {
      display: flex;
      align-items: center;
      justify-content: start;
      flex-direction: column;
      box-sizing: border-box;
      width: 100%;
      color: var(--affine-text-primary-color);
      line-height: 22px;
      font-size: var(--affine-font-sm);
      overflow-y: auto;
      overflow-x: hidden;
      flex: 1;
      gap: 24px;
      -ms-overflow-style: none; /* IE and Edge */
      scrollbar-width: none; /* Firefox */
    }

    .new-chat-messages-container {
      width: 100%;
      box-sizing: border-box;
      min-height: 450px;
    }

    .ai-chat-messages-container::-webkit-scrollbar {
      display: none;
    }

    .peek-view-footer {
      padding: 0 12px;
      width: 100%;
      height: 20px;
      display: flex;
      gap: 4px;
      align-items: center;
      color: var(--affine-text-secondary-color);
      font-size: var(--affine-font-xs);
    }
  `;

  override firstUpdated() {
    // first time render, scroll ai-chat-messages-container to bottom
    requestAnimationFrame(() => {
      if (this._chatMessagesContainer) {
        this._chatMessagesContainer.scrollTop =
          this._chatMessagesContainer.scrollHeight;
      }
    });
  }

  override render() {
    const { host, historyMessages } = this;
    const textRendererOptions = {
      customHeading: true,
    };
    const latestMessageCreatedAt =
      historyMessages[historyMessages.length - 1].createdAt;

    return html`<div class="ai-chat-block-peek-view-container">
      <div class="ai-chat-messages-container">
        <ai-chat-messages
          .host=${host}
          .messages=${historyMessages}
          .textRendererOptions=${textRendererOptions}
        ></ai-chat-messages>
        <date-time .date=${latestMessageCreatedAt}></date-time>
        <div class="new-chat-messages-container"></div>
      </div>
      <chat-block-input></chat-block-input>
      <div class="peek-view-footer">
        <div>AI outputs can be misleading or wrong</div>
      </div>
    </div> `;
  }

  @query('.ai-chat-messages-container')
  accessor _chatMessagesContainer!: HTMLDivElement;

  @property({ attribute: false })
  accessor historyMessages: ChatMessage[] = [];

  @property({ attribute: false })
  accessor host!: EditorHost;
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-block-peek-view': AIChatBlockPeekView;
  }
}
