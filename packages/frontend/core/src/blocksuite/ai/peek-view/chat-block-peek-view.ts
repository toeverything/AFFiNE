import type {
  AIDraftService,
  AIToolsConfigService,
} from '@affine/core/modules/ai-button';
import type { AIModelService } from '@affine/core/modules/ai-button/services/models';
import type {
  ServerService,
  SubscriptionService,
} from '@affine/core/modules/cloud';
import type { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type {
  ContextEmbedStatus,
  CopilotChatHistoryFragment,
} from '@affine/graphql';
import {
  CanvasElementType,
  EdgelessCRUDIdentifier,
  getSurfaceBlock,
} from '@blocksuite/affine/blocks/surface';
import { ViewExtensionManagerIdentifier } from '@blocksuite/affine/ext-loader';
import { ConnectorMode } from '@blocksuite/affine/model';
import {
  DocModeProvider,
  NotificationProvider,
  TelemetryProvider,
} from '@blocksuite/affine/shared/services';
import type { EditorHost } from '@blocksuite/affine/std';
import { html, LitElement, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { throttle } from 'lodash-es';

import {
  ChatBlockPeekViewActions,
  constructUserInfoWithMessages,
  queryHistoryMessages,
} from '../_common/chat-actions-handle';
import { type AIChatBlockModel } from '../blocks';
import type { SearchMenuConfig } from '../components/ai-chat-add-context';
import type { DocDisplayConfig } from '../components/ai-chat-chips';
import type { AIReasoningConfig } from '../components/ai-chat-input';
import type { ChatMessage } from '../components/ai-chat-messages';
import {
  ChatMessagesSchema,
  isChatMessage,
  StreamObjectSchema,
} from '../components/ai-chat-messages';
import type { TextRendererOptions } from '../components/text-renderer';
import { AIChatErrorRenderer } from '../messages/error';
import { type AIError, AIProvider } from '../provider';
import {
  mergeStreamContent,
  mergeStreamObjects,
} from '../utils/stream-objects';
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

  private get _isReasoningActive() {
    return !!this.reasoningConfig.enabled.value;
  }

  private _textRendererOptions: TextRendererOptions = {};

  private _forkBlockId: string | undefined = undefined;

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
    forkSessionId: string,
    docId?: string
  ) => {
    const currentUserInfo = await AIProvider.userInfo;
    const forkMessages = (await queryHistoryMessages(
      rootWorkspaceId,
      forkSessionId,
      docId
    )) as ChatMessage[];
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
  };

  private readonly initSession = async () => {
    const session = await AIProvider.session?.getSession(
      this.rootWorkspaceId,
      this._sessionId
    );
    this.session = session ?? null;
  };

  private readonly createForkSession = async () => {
    if (this.forkSession) {
      return this.forkSession;
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
    if (forkSessionId) {
      const session = await AIProvider.session?.getSession(
        this.rootWorkspaceId,
        forkSessionId
      );
      this.forkSession = session ?? null;
    }
    return this.forkSession;
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
    const forkSessionId = this.forkSession?.sessionId;
    if (!forkSessionId || !this.chatContext.messages.length) {
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
      forkSessionId,
      rootDocId
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
        sessionId: forkSessionId,
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
    const forkSessionId = this.forkSession?.sessionId;
    if (!this._forkBlockId || !forkSessionId) {
      return;
    }

    const { store } = this.host;
    const chatBlock = store.getBlock(this._forkBlockId);
    if (!chatBlock) return;

    // Get fork session messages
    const { rootWorkspaceId, rootDocId } = this;
    const messages = await this._constructBranchChatBlockMessages(
      rootWorkspaceId,
      forkSessionId,
      rootDocId
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

  private readonly onEmbeddingProgressChange = (
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

  private readonly _scrollToEnd = () => {
    requestAnimationFrame(() => {
      if (!this._chatMessagesContainer) return;
      this._chatMessagesContainer.scrollTo({
        top: this._chatMessagesContainer.scrollHeight,
        behavior: 'smooth',
      });
    });
  };

  private readonly _throttledScrollToEnd = throttle(this._scrollToEnd, 600);

  /**
   * Retry the last chat message
   */
  retry = async () => {
    try {
      const forkSessionId = this.forkSession?.sessionId;
      if (!this._forkBlockId || !forkSessionId) return;
      if (!AIProvider.actions.chat) return;

      const abortController = new AbortController();
      const messages = [...this.chatContext.messages];
      const last = messages[messages.length - 1];
      if ('content' in last) {
        last.content = '';
        last.streamObjects = [];
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
        sessionId: forkSessionId,
        retry: true,
        docId: store.id,
        workspaceId: store.workspace.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        where: 'ai-chat-block',
        control: 'chat-send',
        reasoning: this._isReasoningActive,
        toolsConfig: this.aiToolsConfigService.config.value,
      });

      for await (const text of stream) {
        const messages = this.chatContext.messages.slice(0);
        const last = messages.at(-1);
        if (last && isChatMessage(last)) {
          try {
            const parsed = StreamObjectSchema.parse(JSON.parse(text));
            const streamObjects = mergeStreamObjects([
              ...(last.streamObjects ?? []),
              parsed,
            ]);
            messages[messages.length - 1] = {
              ...last,
              streamObjects,
            };
          } catch {
            messages[messages.length - 1] = {
              ...last,
              content: last.content + text,
            };
          }
          this.updateContext({ messages, status: 'transmitting' });
        }
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
      (_, index) => index,
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
        const markdown = message.streamObjects?.length
          ? mergeStreamContent(message.streamObjects)
          : message.content;
        const shouldRenderActions = isLastReply && !!markdown && !isNotReady;

        const messageClasses = classMap({
          'assistant-message-container': isAssistantMessage,
        });

        if (status === 'loading' && isLastReply) {
          return html`<ai-loading></ai-loading>`;
        }

        const notificationService = this.host.std.get(NotificationProvider);

        return html`<div class=${messageClasses}>
          <ai-chat-block-message
            .host=${host}
            .state=${messageState}
            .message=${message}
            .textRendererOptions=${this._textRendererOptions}
          ></ai-chat-block-message>
          ${shouldRenderError ? AIChatErrorRenderer(error, host) : nothing}
          ${shouldRenderCopyMore
            ? html` <chat-copy-more
                .host=${host}
                .session=${this.forkSession}
                .actions=${actions}
                .content=${markdown}
                .isLast=${isLastReply}
                .messageId=${message.id ?? undefined}
                .retry=${() => this.retry()}
                .notificationService=${notificationService}
              ></chat-copy-more>`
            : nothing}
          ${shouldRenderActions
            ? html`<chat-action-list
                .host=${host}
                .session=${this.forkSession}
                .actions=${actions}
                .content=${markdown}
                .messageId=${message.id ?? undefined}
                .layoutDirection=${'horizontal'}
                .notificationService=${notificationService}
              ></chat-action-list>`
            : nothing}
        </div>`;
      }
    )}`;
  };

  override connectedCallback() {
    super.connectedCallback();
    this.initSession().catch(console.error);
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
    const { rootWorkspaceId, _sessionId } = this;
    queryHistoryMessages(rootWorkspaceId, _sessionId)
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
    this._scrollToEnd();
  }

  protected override updated(changedProperties: PropertyValues) {
    if (
      changedProperties.has('chatContext') &&
      (this.chatContext.status === 'loading' ||
        this.chatContext.status === 'error' ||
        this.chatContext.status === 'success')
    ) {
      setTimeout(this._scrollToEnd, 500);
    }

    if (
      changedProperties.has('chatContext') &&
      this.chatContext.status === 'transmitting'
    ) {
      this._throttledScrollToEnd();
    }
  }

  override render() {
    const { host, _historyMessages } = this;
    if (!_historyMessages.length) {
      return nothing;
    }

    const latestHistoryMessage = _historyMessages[_historyMessages.length - 1];
    const latestMessageCreatedAt = latestHistoryMessage.createdAt;
    const { chatContext, updateContext, _textRendererOptions } = this;

    const { messages: currentChatMessages } = chatContext;
    const notificationService = this.host.std.get(NotificationProvider);

    return html`<div class="ai-chat-block-peek-view-container">
      <div class="history-clear-container">
        <ai-history-clear
          .doc=${this.host.store}
          .session=${this.forkSession}
          .onHistoryCleared=${this._onHistoryCleared}
          .chatContextValue=${chatContext}
          .notificationService=${notificationService}
        ></ai-history-clear>
      </div>
      <div class="ai-chat-messages-container">
        <ai-chat-block-messages
          .host=${host}
          .messages=${_historyMessages}
          .textRendererOptions=${_textRendererOptions}
        ></ai-chat-block-messages>
        <date-time .date=${latestMessageCreatedAt}></date-time>
        <div class="new-chat-messages-container">
          ${this.CurrentMessages(currentChatMessages)}
        </div>
      </div>
      <ai-chat-composer
        .host=${host}
        .workspaceId=${this.rootWorkspaceId}
        .docId=${this.rootDocId}
        .session=${this.forkSession ?? this.session}
        .createSession=${this.createForkSession}
        .chatContextValue=${chatContext}
        .updateContext=${updateContext}
        .onEmbeddingProgressChange=${this.onEmbeddingProgressChange}
        .docDisplayConfig=${this.docDisplayConfig}
        .searchMenuConfig=${this.searchMenuConfig}
        .affineWorkspaceDialogService=${this.affineWorkspaceDialogService}
        .notificationService=${notificationService}
        .aiToolsConfigService=${this.aiToolsConfigService}
        .affineFeatureFlagService=${this.affineFeatureFlagService}
        .onChatSuccess=${this._onChatSuccess}
        .trackOptions=${{
          where: 'ai-chat-block',
          control: 'chat-send',
        }}
        .portalContainer=${this.parentElement}
        .reasoningConfig=${this.reasoningConfig}
        .serverService=${this.serverService}
        .subscriptionService=${this.subscriptionService}
        .aiModelService=${this.aiModelService}
        .onAISubscribe=${this.onAISubscribe}
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
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor serverService!: ServerService;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor affineWorkspaceDialogService!: WorkspaceDialogService;

  @property({ attribute: false })
  accessor aiDraftService!: AIDraftService;

  @property({ attribute: false })
  accessor aiToolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor aiModelService!: AIModelService;

  @property({ attribute: false })
  accessor subscriptionService!: SubscriptionService;

  @property({ attribute: false })
  accessor onAISubscribe!: () => Promise<void>;

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

  @state()
  accessor session: CopilotChatHistoryFragment | null | undefined;

  @state()
  accessor forkSession: CopilotChatHistoryFragment | null | undefined;
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
  reasoningConfig: AIReasoningConfig,
  serverService: ServerService,
  affineFeatureFlagService: FeatureFlagService,
  affineWorkspaceDialogService: WorkspaceDialogService,
  aiDraftService: AIDraftService,
  aiToolsConfigService: AIToolsConfigService,
  subscriptionService: SubscriptionService,
  aiModelService: AIModelService,
  onAISubscribe: (() => Promise<void>) | undefined
) => {
  return html`<ai-chat-block-peek-view
    .blockModel=${blockModel}
    .host=${host}
    .docDisplayConfig=${docDisplayConfig}
    .searchMenuConfig=${searchMenuConfig}
    .reasoningConfig=${reasoningConfig}
    .serverService=${serverService}
    .affineFeatureFlagService=${affineFeatureFlagService}
    .affineWorkspaceDialogService=${affineWorkspaceDialogService}
    .aiDraftService=${aiDraftService}
    .aiToolsConfigService=${aiToolsConfigService}
    .subscriptionService=${subscriptionService}
    .aiModelService=${aiModelService}
    .onAISubscribe=${onAISubscribe}
  ></ai-chat-block-peek-view>`;
};
