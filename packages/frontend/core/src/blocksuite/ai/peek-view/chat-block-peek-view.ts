import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { ContextEmbedStatus } from '@affine/graphql';
import {
  CanvasElementType,
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
} from '@blocksuite/affine/blocks/surface';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine/ext-loader';
import { ConnectorMode } from '@blocksuite/affine/model';
import {
  DocModeProvider,
  TelemetryProvider,
} from '@blocksuite/affine/shared/services';
import type { Signal } from '@blocksuite/affine/shared/utils';
import type { EditorHost } from '@blocksuite/affine/std';
import { signal } from '@preact/signals-core';
import { html, LitElement, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  ChatBlockPeekViewActions,
  constructUserInfoWithMessages,
  queryHistoryMessages,
} from '../_common/chat-actions-handle';
import { type AIChatBlockModel } from '../blocks';
import type {
  DocDisplayConfig,
  SearchMenuConfig,
} from '../components/ai-chat-chips';
import type {
  AINetworkSearchConfig,
  AIReasoningConfig,
} from '../components/ai-chat-input';
import type { ChatMessage } from '../components/ai-chat-messages';
import {
  ChatMessagesSchema,
  StreamObjectSchema,
} from '../components/ai-chat-messages';
import type { TextRendererOptions } from '../components/text-renderer';
import { AIChatErrorRenderer } from '../messages/error';
import { type AIError, AIProvider } from '../provider';
import { mergeStreamObjects } from '../utils/stream-objects';
import { PeekViewStyles } from './styles';
import type { ChatContext } from './types';
import { calcChildBound } from './utils';

export class AIChatBlockPeekView extends LitElement {
  static override styles = PeekViewStyles;

  private get _modeService() {
    return this.host.std.get(DocModeProvider);
  }

  private get _sessionId() {
    return this.blockModel.props.sessionId;
  }

  private get historyMessagesString() {
    return this.blockModel.props.messages;
  }

  private get blockId() {
    return this.blockModel.id;
  }

  private get rootDocId() {
    return this.blockModel.props.rootDocId;
  }

  private get rootWorkspaceId() {
    return this.blockModel.props.rootWorkspaceId;
  }

  private get _isNetworkActive() {
    return (
      !!this.networkSearchConfig.visible.value &&
      !!this.networkSearchConfig.enabled.value
    );
  }

  private get _isReasoningActive() {
    return !!this.reasoningConfig.enabled.value;
  }

  private _textRendererOptions: TextRendererOptions = {};

  private _forkBlockId: string | undefined = undefined;

  private _forkSessionId: string | undefined = undefined;

  accessor isComposerVisible: Signal<boolean | undefined> = signal(true);

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
    });
    this._forkBlockId = undefined;
    this._forkSessionId = undefined;
  };

  private readonly _getSessionId = async () => {
    return this._forkSessionId ?? this._sessionId;
  };

  private readonly _createSessionId = async () => {
    if (this._forkSessionId) {
      return this._forkSessionId;
    }

    const lastMessage = this._historyMessages.at(-1);
    if (!lastMessage) return;

    const { store } = this.host;
    const forkSessionId = await AIProvider.forkChat?.({
      workspaceId: store.workspace.id,
      docId: store.id,
      sessionId: this._sessionId,
      latestMessageId: lastMessage.id,
    });
    this._forkSessionId = forkSessionId;
    return this._forkSessionId;
  };

  private readonly _onChatSuccess = async () => {
    if (!this._forkBlockId) {
      await this._createForkChatBlock();
    }
    // Update new chat block messages if there are contents returned from AI
    await this.updateChatBlockMessages();
  };

  /**
   * Create a new AI chat block based on the current session and history messages
   */
  private readonly _createForkChatBlock = async () => {
    // Only create AI chat block in edgeless mode
    const mode = this._modeService.getEditorMode();
    if (mode !== 'edgeless') {
      return;
    }

    // If there is already a chat block, do not create a new one
    if (this._forkBlockId) {
      return;
    }

    // If there is no session id or chat messages, do not create a new chat block
    if (!this._forkSessionId || !this.chatContext.messages.length) {
      return;
    }

    const { store } = this.host;
    // create a new AI chat block
    const surfaceBlock = store
      .getAllModels()
      .find(block => block.flavour === 'affine:surface');
    if (!surfaceBlock) {
      return;
    }

    // Get fork session messages
    const { rootWorkspaceId, rootDocId } = this;
    const messages = await this._constructBranchChatBlockMessages(
      rootWorkspaceId,
      rootDocId,
      this._forkSessionId
    );
    if (!messages.length) {
      return;
    }

    const bound = calcChildBound(this.blockModel, this.host.std);

    const crud = this.host.std.get(EdgelessCRUDIdentifier);
    const forkBlockId = crud.addBlock(
      'affine:embed-ai-chat',
      {
        xywh: bound.serialize(),
        messages: JSON.stringify(messages),
        sessionId: this._forkSessionId,
        rootWorkspaceId: rootWorkspaceId,
        rootDocId: rootDocId,
      },
      surfaceBlock.id
    );

    if (!forkBlockId) {
      return;
    }
    this._forkBlockId = forkBlockId;

    // Connect the parent chat block to the AI chat block
    crud.addElement(CanvasElementType.CONNECTOR, {
      mode: ConnectorMode.Curve,
      controllers: [],
      source: { id: this.blockId },
      target: { id: forkBlockId },
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
    if (!this._forkBlockId || !this._forkSessionId) {
      return;
    }

    const { store } = this.host;
    const chatBlock = store.getBlock(this._forkBlockId);
    if (!chatBlock) return;

    // Get fork session messages
    const { rootWorkspaceId, rootDocId } = this;
    const messages = await this._constructBranchChatBlockMessages(
      rootWorkspaceId,
      rootDocId,
      this._forkSessionId
    );
    if (!messages.length) {
      return;
    }
    store.updateBlock(chatBlock.model, {
      messages: JSON.stringify(messages),
    });
  };

  updateContext = (context: Partial<ChatContext>) => {
    this.chatContext = { ...this.chatContext, ...context };
  };

  private readonly _updateEmbeddingProgress = (
    count: Record<ContextEmbedStatus, number>
  ) => {
    const total = count.finished + count.processing + count.failed;
    this.embeddingProgress = [count.finished, total];
  };

  /**
   * Clean current chat messages and delete the newly created AI chat block
   */
  private readonly _onHistoryCleared = async () => {
    const { _forkBlockId, host } = this;
    if (_forkBlockId) {
      const surface = getSurfaceBlock(host.store);
      const crud = host.std.get(EdgelessCRUDIdentifier);
      const chatBlock = host.store.getBlock(_forkBlockId)?.model;
      if (chatBlock) {
        const connectors = surface?.getConnectors(chatBlock.id);
        host.store.transact(() => {
          // Delete the AI chat block
          crud.removeElement(_forkBlockId);
          // Delete the connectors
          connectors?.forEach(connector => {
            crud.removeElement(connector.id);
          });
        });
      }
    }
    this._resetContext();
  };

  /**
   * Retry the last chat message
   */
  retry = async () => {
    try {
      const { _forkBlockId, _forkSessionId } = this;
      if (!_forkBlockId || !_forkSessionId) return;
      if (!AIProvider.actions.chat) return;

      const abortController = new AbortController();
      const messages = [...this.chatContext.messages];
      const last = messages[messages.length - 1];
      if ('content' in last) {
        last.content = '';
        last.id = '';
        last.createdAt = new Date().toISOString();
      }
      this.updateContext({
        messages,
        status: 'loading',
        error: null,
        abortController,
      });

      const { store } = this.host;
      const stream = await AIProvider.actions.chat({
        sessionId: _forkSessionId,
        retry: true,
        docId: store.id,
        workspaceId: store.workspace.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        where: 'ai-chat-block',
        control: 'chat-send',
        reasoning: this._isReasoningActive,
        webSearch: this._isNetworkActive,
      });

      for await (const text of stream) {
        const messages = [...this.chatContext.messages];
        const last = messages[messages.length - 1] as ChatMessage;
        try {
          const parsed = StreamObjectSchema.safeParse(JSON.parse(text));
          if (parsed.success) {
            last.streamObjects = mergeStreamObjects([
              ...(last.streamObjects ?? []),
              parsed.data,
            ]);
          } else {
            last.content += text;
          }
        } catch {
          last.content += text;
        }
        this.updateContext({ messages, status: 'transmitting' });
      }

      this.updateContext({ status: 'success' });
      // Update new chat block messages if there are contents returned from AI
      await this.updateChatBlockMessages();
    } catch (error) {
      this.updateContext({ status: 'error', error: error as AIError });
    } finally {
      this.updateContext({ abortController: null });
    }
  };

  CurrentMessages = (currentMessages: ChatMessage[]) => {
    if (!currentMessages.length) {
      return nothing;
    }

    const { host } = this;
    const actions = ChatBlockPeekViewActions;

    return html`${repeat(
      currentMessages,
      message => message.id || message.createdAt,
      (message, idx) => {
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

        const { attachments, role, content, userId, userName, avatarUrl } =
          message;

        return html`<div class=${messageClasses}>
          <ai-chat-message
            .host=${host}
            .state=${messageState}
            .content=${content}
            .attachments=${attachments}
            .messageRole=${role}
            .userId=${userId}
            .userName=${userName}
            .avatarUrl=${avatarUrl}
            .textRendererOptions=${this._textRendererOptions}
          ></ai-chat-message>
          ${shouldRenderError ? AIChatErrorRenderer(host, error) : nothing}
          ${shouldRenderCopyMore
            ? html` <chat-copy-more
                .host=${host}
                .actions=${actions}
                .content=${message.content}
                .isLast=${isLastReply}
                .getSessionId=${this._getSessionId}
                .messageId=${message.id ?? undefined}
                .retry=${() => this.retry()}
              ></chat-copy-more>`
            : nothing}
          ${shouldRenderActions
            ? html`<chat-action-list
                .host=${host}
                .actions=${actions}
                .content=${message.content}
                .getSessionId=${this._getSessionId}
                .messageId=${message.id ?? undefined}
                .layoutDirection=${'horizontal'}
              ></chat-action-list>`
            : nothing}
        </div>`;
      }
    )}`;
  };

  override connectedCallback() {
    super.connectedCallback();
    const extensions = this.host.std
      .get(ViewExtensionManagerIdentifier)
      .get('preview-page');

    this._textRendererOptions = {
      extensions,
      affineFeatureFlagService: this.affineFeatureFlagService,
    };
    this._historyMessages = this._deserializeHistoryChatMessages(
      this.historyMessagesString
    );
    const { rootWorkspaceId, rootDocId, _sessionId } = this;
    queryHistoryMessages(rootWorkspaceId, rootDocId, _sessionId)
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
    const {
      chatContext,
      updateContext,
      networkSearchConfig,
      _textRendererOptions,
    } = this;

    const { messages: currentChatMessages } = chatContext;

    return html`<div class="ai-chat-block-peek-view-container">
      <div class="ai-chat-messages-container">
        <ai-chat-messages
          .host=${host}
          .messages=${_historyMessages}
          .textRendererOptions=${_textRendererOptions}
        ></ai-chat-messages>
        <date-time .date=${latestMessageCreatedAt}></date-time>
        <div class="new-chat-messages-container">
          ${this.CurrentMessages(currentChatMessages)}
        </div>
        <div class="history-clear-container">
          <ai-history-clear
            .host=${this.host}
            .doc=${this.host.store}
            .getSessionId=${this._getSessionId}
            .onHistoryCleared=${this._onHistoryCleared}
            .chatContextValue=${chatContext}
          ></ai-history-clear>
        </div>
      </div>
      <ai-chat-composer
        .host=${host}
        .doc=${this.host.store}
        .getSessionId=${this._getSessionId}
        .createSessionId=${this._createSessionId}
        .chatContextValue=${chatContext}
        .updateContext=${updateContext}
        .isVisible=${this.isComposerVisible}
        .updateEmbeddingProgress=${this._updateEmbeddingProgress}
        .networkSearchConfig=${networkSearchConfig}
        .docDisplayConfig=${this.docDisplayConfig}
        .searchMenuConfig=${this.searchMenuConfig}
        .onChatSuccess=${this._onChatSuccess}
        .trackOptions=${{
          where: 'ai-chat-block',
          control: 'chat-send',
        }}
        .portalContainer=${this.parentElement}
        .reasoningConfig=${this.reasoningConfig}
      ></ai-chat-composer>
    </div> `;
  }

  @query('.ai-chat-messages-container')
  accessor _chatMessagesContainer!: HTMLDivElement;

  @property({ attribute: false })
  accessor blockModel!: AIChatBlockModel;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @state()
  accessor _historyMessages: ChatMessage[] = [];

  @state()
  accessor chatContext: ChatContext = {
    status: 'idle',
    error: null,
    images: [],
    abortController: null,
    messages: [],
  };

  @state()
  accessor embeddingProgress: [number, number] = [0, 0];
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-block-peek-view': AIChatBlockPeekView;
  }
}

export const AIChatBlockPeekViewTemplate = (
  blockModel: AIChatBlockModel,
  host: EditorHost,
  docDisplayConfig: DocDisplayConfig,
  searchMenuConfig: SearchMenuConfig,
  networkSearchConfig: AINetworkSearchConfig,
  reasoningConfig: AIReasoningConfig,
  affineFeatureFlagService: FeatureFlagService
) => {
  return html`<ai-chat-block-peek-view
    .blockModel=${blockModel}
    .host=${host}
    .networkSearchConfig=${networkSearchConfig}
    .docDisplayConfig=${docDisplayConfig}
    .searchMenuConfig=${searchMenuConfig}
    .reasoningConfig=${reasoningConfig}
    .affineFeatureFlagService=${affineFeatureFlagService}
  ></ai-chat-block-peek-view>`;
};
