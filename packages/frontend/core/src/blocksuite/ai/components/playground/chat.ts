import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { ContextEmbedStatus, CopilotSessionType } from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { ExtensionType, Store } from '@blocksuite/affine/store';
import { DeleteIcon, NewPageIcon } from '@blocksuite/icons/lit';
import { type Signal, signal } from '@preact/signals-core';
import { css, html, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { createRef, type Ref, ref } from 'lit/directives/ref.js';
import { throttle } from 'lodash-es';

import type { AppSidebarConfig } from '../../chat-panel/chat-config';
import type { ChatContextValue } from '../../chat-panel/chat-context';
import type { ChatPanelMessages } from '../../chat-panel/chat-panel-messages';
import { AIProvider } from '../../provider';
import type { DocDisplayConfig, SearchMenuConfig } from '../ai-chat-chips';
import type {
  AIModelSwitchConfig,
  AINetworkSearchConfig,
  AIReasoningConfig,
} from '../ai-chat-input';
import { type HistoryMessage } from '../ai-chat-messages';

const DEFAULT_CHAT_CONTEXT_VALUE: ChatContextValue = {
  quote: '',
  images: [],
  abortController: null,
  messages: [],
  status: 'idle',
  error: null,
  markdown: '',
};

export class PlaygroundChat extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    playground-chat {
      .chat-panel-container {
        display: flex;
        flex-direction: column;
        height: 100%;
        padding: 0 16px;
      }

      .chat-panel-title {
        background: var(--affine-background-primary-color);
        position: relative;
        padding: 8px 0px;
        width: 100%;
        height: 36px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 1;

        .chat-panel-title-text {
          font-size: 14px;
          font-weight: 500;
          color: var(--affine-text-secondary-color);
        }

        svg {
          width: 18px;
          height: 18px;
          color: var(--affine-text-secondary-color);
        }
      }

      chat-panel-messages {
        flex: 1;
        overflow-y: hidden;
      }

      .chat-panel-hints {
        margin: 0 4px;
        padding: 8px 12px;
        border-radius: 8px;
        border: 1px solid var(--affine-border-color);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
      }

      .chat-panel-hints :first-child {
        color: var(--affine-text-primary-color);
      }

      .chat-panel-hints :nth-child(2) {
        color: var(--affine-text-secondary-color);
      }

      .chat-panel-add,
      .chat-panel-delete {
        cursor: pointer;
        padding: 2px;
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .chat-panel-add {
        margin-left: 8px;
        margin-right: auto;
      }

      .chat-panel-delete {
        margin-left: 8px;
        display: none;
      }

      .chat-panel-add:hover svg,
      .chat-panel-delete:hover svg {
        color: ${unsafeCSSVarV2('icon/activated')};
      }
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor modelSwitchConfig!: AIModelSwitchConfig;

  @property({ attribute: false })
  accessor appSidebarConfig!: AppSidebarConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor extensions!: ExtensionType[];

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor session: CopilotSessionType | undefined = undefined;

  @property({ attribute: false })
  accessor addChat!: () => Promise<void>;

  @state()
  accessor isLoading = false;

  @state()
  accessor chatContextValue: ChatContextValue = DEFAULT_CHAT_CONTEXT_VALUE;

  @state()
  accessor embeddingProgress: [number, number] = [0, 0];

  private readonly _isVisible: Signal<boolean | undefined> = signal(true);

  private readonly _chatMessagesRef: Ref<ChatPanelMessages> =
    createRef<ChatPanelMessages>();

  // request counter to track the latest request
  private _updateHistoryCounter = 0;

  private readonly _initPanel = async () => {
    const userId = (await AIProvider.userInfo)?.id;
    if (!userId) return;

    this.isLoading = true;
    await this._updateHistory();
    this.isLoading = false;
  };

  private readonly _getSessionId = async () => {
    return this.session?.id;
  };

  private readonly _createSessionId = async () => {
    return this.session?.id;
  };

  private readonly _updateHistory = async () => {
    const { doc } = this;

    const currentRequest = ++this._updateHistoryCounter;

    const [histories, actions] = await Promise.all([
      AIProvider.histories?.chats(doc.workspace.id, doc.id),
      AIProvider.histories?.actions(doc.workspace.id, doc.id),
    ]);

    // Check if this is still the latest request
    if (currentRequest !== this._updateHistoryCounter) {
      return;
    }

    const messages: HistoryMessage[] = actions ? [...actions] : [];

    const sessionId = await this._getSessionId();
    const history = histories?.find(history => history.sessionId === sessionId);
    if (history) {
      messages.push(...history.messages);
    }

    this.chatContextValue = {
      ...this.chatContextValue,
      messages: messages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    };

    this._scrollToEnd();
  };

  private readonly _updateEmbeddingProgress = (
    count: Record<ContextEmbedStatus, number>
  ) => {
    const total = count.finished + count.processing + count.failed;
    this.embeddingProgress = [count.finished, total];
  };

  private readonly updateContext = (context: Partial<ChatContextValue>) => {
    this.chatContextValue = { ...this.chatContextValue, ...context };
  };

  private readonly _scrollToEnd = () => {
    this._chatMessagesRef.value?.scrollToEnd();
  };

  private readonly _throttledScrollToEnd = throttle(this._scrollToEnd, 600);

  override connectedCallback() {
    super.connectedCallback();
    this._initPanel().catch(console.error);
  }

  protected override updated(_changedProperties: PropertyValues) {
    if (
      _changedProperties.has('chatContextValue') &&
      (this.chatContextValue.status === 'loading' ||
        this.chatContextValue.status === 'error' ||
        this.chatContextValue.status === 'success')
    ) {
      setTimeout(this._scrollToEnd, 500);
    }

    if (
      _changedProperties.has('chatContextValue') &&
      this.chatContextValue.status === 'transmitting'
    ) {
      this._throttledScrollToEnd();
    }
  }

  override render() {
    const [done, total] = this.embeddingProgress;
    const isEmbedding = total > 0 && done < total;

    return html`<div class="chat-panel-container">
      <div class="chat-panel-title">
        <div class="chat-panel-title-text">
          ${isEmbedding
            ? html`<span data-testid="chat-panel-embedding-progress"
                >Embedding ${done}/${total}</span
              >`
            : 'AFFiNE AI'}
        </div>
        <div class="chat-panel-add" @click=${this.addChat}>
          ${NewPageIcon()}
          <affine-tooltip>Add chat</affine-tooltip>
        </div>
        <ai-history-clear
          .host=${this.host}
          .doc=${this.doc}
          .getSessionId=${this._getSessionId}
          .onHistoryCleared=${this._updateHistory}
          .chatContextValue=${this.chatContextValue}
        ></ai-history-clear>
        <div class="chat-panel-delete">${DeleteIcon()}</div>
      </div>
      <chat-panel-messages
        ${ref(this._chatMessagesRef)}
        .chatContextValue=${this.chatContextValue}
        .getSessionId=${this._getSessionId}
        .createSessionId=${this._createSessionId}
        .updateContext=${this.updateContext}
        .host=${this.host}
        .isLoading=${this.isLoading}
        .extensions=${this.extensions}
        .affineFeatureFlagService=${this.affineFeatureFlagService}
        .networkSearchConfig=${this.networkSearchConfig}
        .reasoningConfig=${this.reasoningConfig}
      ></chat-panel-messages>
      <ai-chat-composer
        .host=${this.host}
        .doc=${this.doc}
        .session=${this.session}
        .getSessionId=${this._getSessionId}
        .createSessionId=${this._createSessionId}
        .chatContextValue=${this.chatContextValue}
        .updateContext=${this.updateContext}
        .updateEmbeddingProgress=${this._updateEmbeddingProgress}
        .isVisible=${this._isVisible}
        .networkSearchConfig=${this.networkSearchConfig}
        .reasoningConfig=${this.reasoningConfig}
        .modelSwitchConfig=${this.modelSwitchConfig}
        .docDisplayConfig=${this.docDisplayConfig}
        .searchMenuConfig=${this.searchMenuConfig}
      ></ai-chat-composer>
    </div>`;
  }
}
