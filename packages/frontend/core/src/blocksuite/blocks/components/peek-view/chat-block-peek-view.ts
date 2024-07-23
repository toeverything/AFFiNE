import './chat-block-input.js';
import './date-time.js';

import { constructChatBlockMessages } from '@affine/core/blocksuite/presets/ai/chat-panel/actions/actions-handle.js';
import { Bound, type EditorHost } from '@blocksuite/block-std';
import {
  CanvasElementType,
  ConnectorMode,
  type EdgelessRootService,
} from '@blocksuite/blocks';
import {
  type AIChatBlockModel,
  type ChatMessage,
  ChatMessagesSchema,
} from '@blocksuite/presets';
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

  private get _rootService() {
    return this.host.spec.getService('affine:page');
  }

  private get _modeService() {
    return this._rootService.docModeService;
  }

  private get parentSessionId() {
    return this.parentModel.sessionId;
  }

  private get historyMessagesString() {
    return this.parentModel.messages;
  }

  private get parentXYWH() {
    return this.parentModel.xywh;
  }

  private get parentChatBlockId() {
    return this.parentModel.id;
  }

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
    this.currentChatMessages = [...this.currentChatMessages, chatMessage];
  };

  updateCurrentSessionId = (sessionId: string) => {
    this.currentSessionId = sessionId;
  };

  /**
   * Create a new AI chat block based on the current session and history messages
   */
  createAIChatBlock = async () => {
    // Only create AI chat block in edgeless mode
    const mode = this._modeService.getMode();
    if (mode !== 'edgeless') {
      return;
    }

    // If there is already a chat block, do not create a new one
    if (this.currentChatBlockId) {
      return;
    }

    // If there is no session id or chat messages, do not create a new chat block
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

    // Get fork session messages
    const messages = await constructChatBlockMessages(
      doc,
      this.currentSessionId
    );
    if (!messages.length) {
      return;
    }

    const aiChatBlockId = doc.addBlock(
      'affine:embed-ai-chat' as keyof BlockSuite.BlockModels,
      {
        xywh: bound.serialize(),
        messages: JSON.stringify(messages),
        sessionId: this.currentSessionId,
      },
      surfaceBlock.id
    );
    console.debug('created AI chat block', aiChatBlockId);

    if (!aiChatBlockId) {
      return;
    }

    this.currentChatBlockId = aiChatBlockId;

    // Connect the parent chat block to the AI chat block
    const edgelessService = this._rootService as EdgelessRootService;
    const connectorId = edgelessService.addElement(
      CanvasElementType.CONNECTOR,
      {
        mode: ConnectorMode.Curve,
        controllers: [],
        source: { id: this.parentChatBlockId },
        target: { id: aiChatBlockId },
      }
    );
    console.debug('created connector', connectorId);
  };

  /**
   * Update the current chat messages with the new message
   */
  updateChatBlockMessages = async () => {
    if (!this.currentChatBlockId || !this.currentSessionId) {
      return;
    }

    const { doc } = this.host;
    const chatBlock = doc.getBlock(this.currentChatBlockId);

    // Get fork session messages
    const messages = await constructChatBlockMessages(
      doc,
      this.currentSessionId
    );
    if (!messages.length) {
      return;
    }
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

    const {
      currentChatMessages,
      parentSessionId,
      updateCurrentChatMessages,
      updateChatBlockMessages,
      updateCurrentSessionId,
      createAIChatBlock,
      currentChatBlockId,
      currentSessionId,
    } = this;

    console.debug('chat block: ', _historyMessages);

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
            .messages=${currentChatMessages}
            .textRendererOptions=${textRendererOptions}
          ></ai-chat-messages>
        </div>
      </div>
      <chat-block-input
        .host=${host}
        .parentSessionId=${parentSessionId}
        .latestMessageId=${latestHistoryMessageId}
        .updateChatMessages=${updateCurrentChatMessages}
        .updateChatBlock=${updateChatBlockMessages}
        .updateCurrentSessionId=${updateCurrentSessionId}
        .createChatBlock=${createAIChatBlock}
        .currentChatBlockId=${currentChatBlockId}
        .currentSessionId=${currentSessionId}
      ></chat-block-input>
      <div class="peek-view-footer">
        <div>AI outputs can be misleading or wrong</div>
      </div>
    </div> `;
  }

  @query('.ai-chat-messages-container')
  accessor _chatMessagesContainer!: HTMLDivElement;

  @property({ attribute: false })
  accessor parentModel!: AIChatBlockModel;

  @property({ attribute: false })
  accessor host!: EditorHost;

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
  parentModel: AIChatBlockModel,
  host: EditorHost
) => {
  return html`<ai-chat-block-peek-view
    .parentModel=${parentModel}
    .host=${host}
  ></ai-chat-block-peek-view>`;
};
