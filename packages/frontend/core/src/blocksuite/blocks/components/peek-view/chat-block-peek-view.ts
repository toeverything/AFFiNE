import './chat-block-input.js';
import './date-time.js';

import { Bound, type EditorHost } from '@blocksuite/block-std';
import { type ChatMessage, ChatMessagesSchema } from '@blocksuite/presets';
import { baseTheme } from '@toeverything/theme';
import { css, html, LitElement, nothing, unsafeCSS } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

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

  private _historyMessages: ChatMessage[] = [];

  private readonly _deserializeHistoryChatMessages = () => {
    try {
      const result = ChatMessagesSchema.safeParse(
        JSON.parse(this.historyMessagesString)
      );
      if (result.success) {
        return result.data;
      } else {
        return [];
      }
    } catch {
      return [];
    }
  };

  updateCurrentChatMessages = (chatMessage: ChatMessage) => {
    console.debug('update chat messages', chatMessage);
    this.currentChatMessages = [...this.currentChatMessages, chatMessage];
  };

  updateCurrentSessionId = (sessionId: string) => {
    this.currentSessionId = sessionId;
  };

  /**
   * Create a new AI chat block based on the current session and history messages
   */
  createAIChatBlock = () => {
    if (this.currentChatBlockId) {
      return;
    }

    if (!this.currentSessionId || !this.currentChatMessages.length) {
      return;
    }

    const { doc } = this.host;
    // create a new AI chat block
    const surfaceBlock = doc
      .getBlocks()
      .find(block => block.flavour === 'affine:surface');
    if (!surfaceBlock) {
      return;
    }

    const parentXYWH = Bound.deserialize(this.parentXYWH);
    const {
      x: parentX,
      y: parentY,
      w: parentWidth,
      h: parentHeight,
    } = parentXYWH;

    // Add AI chat block to the center of the viewport
    const gap = 80;
    const x = parentX + parentWidth + gap;
    const y = parentY;
    const bound = new Bound(x, y, parentWidth, parentHeight);

    const messages = [
      ...this._deserializeHistoryChatMessages(),
      ...this.currentChatMessages,
    ];
    const aiChatBlockId = doc.addBlock(
      'affine:embed-ai-chat' as keyof BlockSuite.BlockModels,
      {
        xywh: bound.serialize(),
        messages: JSON.stringify(messages),
        sessionId: this.currentSessionId,
      },
      surfaceBlock.id
    );

    if (aiChatBlockId) {
      this.currentChatBlockId = aiChatBlockId;
    }

    return aiChatBlockId;
  };

  /**
   * Update the current chat messages with the new message
   */
  updateChatBlockMessages = () => {
    if (!this.currentChatBlockId) {
      return;
    }

    const { doc } = this.host;
    const chatBlock = doc.getBlock(this.currentChatBlockId);
    if (!chatBlock) {
      return;
    }

    const messages = [
      ...this._deserializeHistoryChatMessages(),
      ...this.currentChatMessages,
    ];
    doc.updateBlock(chatBlock.model, {
      messages: JSON.stringify(messages),
    });
  };

  override connectedCallback() {
    super.connectedCallback();
    this._historyMessages = this._deserializeHistoryChatMessages();
  }

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
    const { host, _historyMessages } = this;
    if (!_historyMessages.length) {
      return nothing;
    }

    const latestHistoryMessage = _historyMessages[_historyMessages.length - 1];
    const latestMessageCreatedAt = latestHistoryMessage.createdAt;
    const latestHistoryMessageId = latestHistoryMessage.id;
    const textRendererOptions = {
      customHeading: true,
    };

    return html`<div class="ai-chat-block-peek-view-container">
      <div class="ai-chat-messages-container">
        <ai-chat-messages
          .host=${host}
          .messages=${_historyMessages}
          .textRendererOptions=${textRendererOptions}
        ></ai-chat-messages>
        <date-time .date=${latestMessageCreatedAt}></date-time>
        <div class="new-chat-messages-container">
          <ai-chat-messages
            .host=${host}
            .messages=${this.currentChatMessages}
            .textRendererOptions=${textRendererOptions}
          ></ai-chat-messages>
        </div>
      </div>
      <chat-block-input
        .host=${host}
        .parentSessionId=${this.parentSessionId}
        .latestMessageId=${latestHistoryMessageId}
        .updateChatMessages=${this.updateCurrentChatMessages}
        .updateChatBlock=${this.updateChatBlockMessages}
        .updateCurrentSessionId=${this.updateCurrentSessionId}
        .createChatBlock=${this.createAIChatBlock}
        .currentChatBlockId=${this.currentChatBlockId}
        .currentSessionId=${this.currentSessionId}
      ></chat-block-input>
      <div class="peek-view-footer">
        <div>AI outputs can be misleading or wrong</div>
      </div>
    </div> `;
  }

  @query('.ai-chat-messages-container')
  accessor _chatMessagesContainer!: HTMLDivElement;

  @property({ attribute: false })
  accessor historyMessagesString!: string;

  @property({ attribute: false })
  accessor parentXYWH!: string;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor parentSessionId!: string;

  @state()
  accessor currentChatMessages: ChatMessage[] = [];

  @state()
  accessor currentChatBlockId: string | null = null;

  @state()
  accessor currentSessionId: string | null = null;
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-block-peek-view': AIChatBlockPeekView;
  }
}

export const AIChatBlockPeekViewTemplate = (
  parentSessionId: string,
  historyMessagesString: string,
  parentXYWH: string,
  host: EditorHost
) => {
  return html`<ai-chat-block-peek-view
    .historyMessagesString=${historyMessagesString}
    .parentSessionId=${parentSessionId}
    .parentXYWH=${parentXYWH}
    .host=${host}
  ></ai-chat-block-peek-view>`;
};
