import './chat-block-input';
import './date-time';
import '../_common/components/chat-action-list';
import '../_common/components/copy-more';

import { type EditorHost } from '@blocksuite/block-std';
import {
  type AIError,
  CanvasElementType,
  ConnectorMode,
  DocModeProvider,
  type EdgelessRootService,
  TelemetryProvider,
} from '@blocksuite/blocks';
import { NotificationProvider } from '@blocksuite/blocks';
import {
  type AIChatBlockModel,
  type ChatMessage,
  ChatMessagesSchema,
} from '@blocksuite/presets';
import { html, LitElement, nothing } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  ChatBlockPeekViewActions,
  constructUserInfoWithMessages,
  queryHistoryMessages,
} from '../_common/chat-actions-handle';
import { SmallHintIcon } from '../_common/icons';
import { AIChatErrorRenderer } from '../messages/error';
import { AIProvider } from '../provider';
import { PeekViewStyles } from './styles';
import type { ChatContext } from './types';
import { calcChildBound } from './utils';

@customElement('ai-chat-block-peek-view')
export class AIChatBlockPeekView extends LitElement {
  static override styles = PeekViewStyles;

  private get _rootService() {
    return this.host.std.getService('affine:page');
  }

  private get _modeService() {
    return this.host.std.get(DocModeProvider);
  }

  private get parentSessionId() {
    return this.parentModel.sessionId;
  }

  private get historyMessagesString() {
    return this.parentModel.messages;
  }

  private get parentChatBlockId() {
    return this.parentModel.id;
  }

  private get parentRootDocId() {
    return this.parentModel.rootDocId;
  }

  private get parentRootWorkspaceId() {
    return this.parentModel.rootWorkspaceId;
  }

  private readonly _deserializeHistoryChatMessages = (
    historyMessagesString: string
  ) => {
    try {
      const result = ChatMessagesSchema.safeParse(
        JSON.parse(historyMessagesString)
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

  private readonly _constructBranchChatBlockMessages = async (
    rootWorkspaceId: string,
    rootDocId: string,
    forkSessionId: string
  ) => {
    const currentUserInfo = await AIProvider.userInfo;
    const forkMessages = await queryHistoryMessages(
      rootWorkspaceId,
      rootDocId,
      forkSessionId
    );
    const forkLength = forkMessages.length;
    const historyLength = this._historyMessages.length;

    if (!forkLength || forkLength <= historyLength) {
      return constructUserInfoWithMessages(forkMessages, currentUserInfo);
    }

    // Update history messages with the fork messages, keep user info
    const historyMessages = this._historyMessages.map((message, idx) => {
      return {
        ...message,
        id: forkMessages[idx]?.id ?? message.id,
        attachments: [],
      };
    });

    const currentChatMessages = constructUserInfoWithMessages(
      forkMessages.slice(historyLength),
      currentUserInfo
    );
    return [...historyMessages, ...currentChatMessages];
  };

  private readonly _resetContext = () => {
    const { abortController } = this.chatContext;
    if (abortController) {
      abortController.abort();
    }

    this.updateContext({
      status: 'idle',
      error: null,
      images: [],
      abortController: null,
      messages: [],
      currentSessionId: null,
      currentChatBlockId: null,
    });
  };

  /**
   * Create a new AI chat block based on the current session and history messages
   */
  createAIChatBlock = async () => {
    // Only create AI chat block in edgeless mode
    const mode = this._modeService.getEditorMode();
    if (mode !== 'edgeless') {
      return;
    }

    // If there is already a chat block, do not create a new one
    if (this.chatContext.currentChatBlockId) {
      return;
    }

    // If there is no session id or chat messages, do not create a new chat block
    if (
      !this.chatContext.currentSessionId ||
      !this.chatContext.messages.length
    ) {
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

    // Get fork session messages
    const { parentRootWorkspaceId, parentRootDocId } = this;
    const messages = await this._constructBranchChatBlockMessages(
      parentRootWorkspaceId,
      parentRootDocId,
      this.chatContext.currentSessionId
    );
    if (!messages.length) {
      return;
    }

    const edgelessService = this._rootService as EdgelessRootService;
    const bound = calcChildBound(this.parentModel, edgelessService);
    const aiChatBlockId = edgelessService.addBlock(
      'affine:embed-ai-chat' as keyof BlockSuite.BlockModels,
      {
        xywh: bound.serialize(),
        messages: JSON.stringify(messages),
        sessionId: this.chatContext.currentSessionId,
        rootWorkspaceId: parentRootWorkspaceId,
        rootDocId: parentRootDocId,
      },
      surfaceBlock.id
    );

    if (!aiChatBlockId) {
      return;
    }

    this.updateContext({ currentChatBlockId: aiChatBlockId });

    // Connect the parent chat block to the AI chat block
    edgelessService.addElement(CanvasElementType.CONNECTOR, {
      mode: ConnectorMode.Curve,
      controllers: [],
      source: { id: this.parentChatBlockId },
      target: { id: aiChatBlockId },
    });

    const telemetryService = this.host.std.getOptional(TelemetryProvider);
    telemetryService?.track('CanvasElementAdded', {
      control: 'conversation',
      page: 'whiteboard editor',
      module: 'canvas',
      segment: 'whiteboard',
      type: 'chat block',
      category: 'branch',
    });
  };

  /**
   * Update the current chat messages with the new message
   */
  updateChatBlockMessages = async () => {
    if (
      !this.chatContext.currentChatBlockId ||
      !this.chatContext.currentSessionId
    ) {
      return;
    }

    const { doc } = this.host;
    const chatBlock = doc.getBlock(this.chatContext.currentChatBlockId);
    if (!chatBlock) return;

    // Get fork session messages
    const { parentRootWorkspaceId, parentRootDocId } = this;
    const messages = await this._constructBranchChatBlockMessages(
      parentRootWorkspaceId,
      parentRootDocId,
      this.chatContext.currentSessionId
    );
    if (!messages.length) {
      return;
    }
    doc.updateBlock(chatBlock.model, {
      messages: JSON.stringify(messages),
    });
  };

  updateContext = (context: Partial<ChatContext>) => {
    this.chatContext = { ...this.chatContext, ...context };
  };

  /**
   * Clean current chat messages and delete the newly created AI chat block
   */
  cleanCurrentChatHistories = async () => {
    if (!this._rootService) return;
    const notificationService = this.host.std.getOptional(NotificationProvider);
    if (!notificationService) return;

    const { currentChatBlockId, currentSessionId } = this.chatContext;
    if (!currentChatBlockId && !currentSessionId) {
      return;
    }

    if (
      await notificationService.confirm({
        title: 'Clear History',
        message:
          'Are you sure you want to clear all history? This action will permanently delete all content, including all chat logs and data, and cannot be undone.',
        confirmText: 'Confirm',
        cancelText: 'Cancel',
      })
    ) {
      const { doc } = this.host;
      if (currentSessionId) {
        await AIProvider.histories?.cleanup(doc.collection.id, doc.id, [
          currentSessionId,
        ]);
      }

      if (currentChatBlockId) {
        const edgelessService = this._rootService as EdgelessRootService;
        const chatBlock = doc.getBlock(currentChatBlockId)?.model;
        if (chatBlock) {
          const connectors = edgelessService.getConnectors(
            chatBlock as AIChatBlockModel
          );
          doc.transact(() => {
            // Delete the AI chat block
            edgelessService.removeElement(currentChatBlockId);
            // Delete the connectors
            connectors.forEach(connector => {
              edgelessService.removeElement(connector.id);
            });
          });
        }
      }

      notificationService.toast('History cleared');
      this._resetContext();
    }
  };

  /**
   * Retry the last chat message
   */
  retry = async () => {
    const { doc } = this.host;
    const { currentChatBlockId, currentSessionId } = this.chatContext;
    if (!currentChatBlockId || !currentSessionId) {
      return;
    }

    let content = '';
    try {
      const abortController = new AbortController();

      const messages = [...this.chatContext.messages];
      const last = messages[messages.length - 1];
      if ('content' in last) {
        last.content = '';
        last.createdAt = new Date().toISOString();
      }
      this.updateContext({ messages, status: 'loading', error: null });

      const stream = AIProvider.actions.chat?.({
        sessionId: currentSessionId,
        retry: true,
        docId: doc.id,
        workspaceId: doc.collection.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        where: 'ai-chat-block',
        control: 'chat-send',
      });

      if (stream) {
        this.updateContext({ abortController });
        for await (const text of stream) {
          const messages = [...this.chatContext.messages];
          const last = messages[messages.length - 1] as ChatMessage;
          last.content += text;
          this.updateContext({ messages, status: 'transmitting' });
          content += text;
        }

        this.updateContext({ status: 'success' });
      }
    } catch (error) {
      this.updateContext({ status: 'error', error: error as AIError });
    } finally {
      this.updateContext({ abortController: null });
      if (content) {
        // Update new chat block messages if there are contents returned from AI
        await this.updateChatBlockMessages();
      }
    }
  };

  CurrentMessages = (currentMessages: ChatMessage[]) => {
    if (!currentMessages.length) {
      return nothing;
    }

    const { host } = this;
    const actions = ChatBlockPeekViewActions;

    return html`${repeat(currentMessages, (message, idx) => {
      const { status, error } = this.chatContext;
      const isAssistantMessage = message.role === 'assistant';
      const isLastReply =
        idx === currentMessages.length - 1 && isAssistantMessage;
      const messageState =
        isLastReply && (status === 'transmitting' || status === 'loading')
          ? 'generating'
          : 'finished';
      const shouldRenderError = isLastReply && status === 'error' && !!error;
      const isNotReady = status === 'transmitting' || status === 'loading';
      const shouldRenderCopyMore =
        isAssistantMessage && !(isLastReply && isNotReady);
      const shouldRenderActions =
        isLastReply && !!message.content && !isNotReady;

      const messageClasses = classMap({
        'assistant-message-container': isAssistantMessage,
      });

      const { attachments, role, content } = message;
      const userInfo = {
        userId: message.userId,
        userName: message.userName,
        avatarUrl: message.avatarUrl,
      };

      return html`<div class=${messageClasses}>
        <ai-chat-message
          .host=${host}
          .state=${messageState}
          .content=${content}
          .attachments=${attachments}
          .messageRole=${role}
          .userInfo=${userInfo}
        ></ai-chat-message>
        ${shouldRenderError ? AIChatErrorRenderer(host, error) : nothing}
        ${shouldRenderCopyMore
          ? html` <chat-copy-more
              .host=${host}
              .actions=${actions}
              .content=${message.content}
              .isLast=${isLastReply}
              .chatSessionId=${this.chatContext.currentSessionId ?? undefined}
              .messageId=${message.id ?? undefined}
              .retry=${() => this.retry()}
            ></chat-copy-more>`
          : nothing}
        ${shouldRenderActions
          ? html`<chat-action-list
              .host=${host}
              .actions=${actions}
              .content=${message.content}
              .chatSessionId=${this.chatContext.currentSessionId ?? undefined}
              .messageId=${message.id ?? undefined}
              .layoutDirection=${'horizontal'}
            ></chat-action-list>`
          : nothing}
      </div>`;
    })}`;
  };

  override connectedCallback() {
    super.connectedCallback();
    this._historyMessages = this._deserializeHistoryChatMessages(
      this.historyMessagesString
    );
    const { parentRootWorkspaceId, parentRootDocId, parentSessionId } = this;
    queryHistoryMessages(
      parentRootWorkspaceId,
      parentRootDocId,
      parentSessionId
    )
      .then(messages => {
        this._historyMessages = this._historyMessages.map((message, idx) => {
          return {
            ...message,
            attachments: messages[idx]?.attachments ?? [],
          };
        });
      })
      .catch((err: Error) => {
        console.error('Query history messages failed', err);
      });
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
    const {
      parentSessionId,
      updateChatBlockMessages,
      createAIChatBlock,
      cleanCurrentChatHistories,
      chatContext,
      updateContext,
    } = this;

    const { messages: currentChatMessages } = chatContext;

    return html`<div class="ai-chat-block-peek-view-container">
      <div class="ai-chat-messages-container">
        <ai-chat-messages
          .host=${host}
          .messages=${_historyMessages}
        ></ai-chat-messages>
        <date-time .date=${latestMessageCreatedAt}></date-time>
        <div class="new-chat-messages-container">
          ${this.CurrentMessages(currentChatMessages)}
        </div>
      </div>
      <chat-block-input
        .host=${host}
        .parentSessionId=${parentSessionId}
        .latestMessageId=${latestHistoryMessageId}
        .updateChatBlock=${updateChatBlockMessages}
        .createChatBlock=${createAIChatBlock}
        .cleanupHistories=${cleanCurrentChatHistories}
        .chatContext=${chatContext}
        .updateContext=${updateContext}
      ></chat-block-input>
      <div class="peek-view-footer">
        ${SmallHintIcon}
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
  accessor _historyMessages: ChatMessage[] = [];

  @state()
  accessor chatContext: ChatContext = {
    status: 'idle',
    error: null,
    images: [],
    abortController: null,
    messages: [],
    currentSessionId: null,
    currentChatBlockId: null,
  };
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
