import type { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { ContextEmbedStatus, CopilotSessionType } from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import { type Signal } from '@preact/signals-core';
import {
  css,
  html,
  nothing,
  type PropertyValues,
  type TemplateResult,
} from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { createRef, type Ref, ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';
import { throttle } from 'lodash-es';

import { HISTORY_IMAGE_ACTIONS } from '../../chat-panel/const';
import { type AIChatParams, AIProvider } from '../../provider/ai-provider';
import { extractSelectedContent } from '../../utils/extract';
import type { DocDisplayConfig, SearchMenuConfig } from '../ai-chat-chips';
import type {
  AINetworkSearchConfig,
  AIReasoningConfig,
} from '../ai-chat-input';
import {
  type AIChatMessages,
  type ChatAction,
  type ChatMessage,
  type HistoryMessage,
  isChatMessage,
} from '../ai-chat-messages';
import type { ChatContextValue } from './type';

const DEFAULT_CHAT_CONTEXT_VALUE: ChatContextValue = {
  quote: '',
  images: [],
  abortController: null,
  messages: [],
  status: 'idle',
  error: null,
  markdown: '',
};

export class AIChatContent extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    ai-chat-content {
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 100%;

      .ai-chat-title {
        background: var(--affine-background-primary-color);
        position: relative;
        padding: 8px 0px;
        width: 100%;
        height: 36px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        z-index: 1;

        svg {
          width: 18px;
          height: 18px;
          color: var(--affine-text-secondary-color);
        }
      }

      ai-chat-messages {
        flex: 1;
        overflow-y: hidden;
        transition:
          flex-grow 0.32s cubic-bezier(0.07, 0.83, 0.46, 1),
          padding-top 0.32s ease,
          padding-bottom 0.32s ease;
      }
      ai-chat-messages.independent-mode.no-message {
        flex-grow: 0;
        flex-shrink: 0;
        overflow-y: visible;
      }
    }
  `;

  @property({ attribute: false })
  accessor independentMode!: boolean;

  @property({ attribute: false })
  accessor onboardingOffsetY!: number;

  @property({ attribute: false })
  accessor chatTitle: TemplateResult<1> | undefined;

  @property({ attribute: false })
  accessor host: EditorHost | null | undefined;

  @property({ attribute: false })
  accessor session!: CopilotSessionType | null | undefined;

  @property({ attribute: false })
  accessor createSession!: () => Promise<CopilotSessionType | undefined>;

  @property({ attribute: false })
  accessor workspaceId!: string;

  @property({ attribute: false })
  accessor docId: string | undefined;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor extensions!: ExtensionType[];

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor affineWorkspaceDialogService!: WorkspaceDialogService;

  @property({ attribute: false })
  accessor updateEmbeddingProgress!: (
    count: Record<ContextEmbedStatus, number>
  ) => void;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @state()
  accessor chatContextValue: ChatContextValue = DEFAULT_CHAT_CONTEXT_VALUE;

  @state()
  accessor isHistoryLoading = false;

  private readonly chatMessagesRef: Ref<AIChatMessages> =
    createRef<AIChatMessages>();

  // request counter to track the latest request
  private updateHistoryCounter = 0;

  private wheelTriggered = false;

  private lastScrollTop: number | undefined;

  get messages() {
    return this.chatContextValue.messages.filter(item => {
      return (
        isChatMessage(item) ||
        item.messages?.length === 3 ||
        (HISTORY_IMAGE_ACTIONS.includes(item.action) &&
          item.messages?.length === 2)
      );
    });
  }

  private readonly updateHistory = async () => {
    const currentRequest = ++this.updateHistoryCounter;
    if (!AIProvider.histories) {
      return;
    }

    const sessionId = this.session?.id;
    const pinned = this.session?.pinned;
    const [histories, actions] = await Promise.all([
      sessionId
        ? AIProvider.histories.chats(
            this.workspaceId,
            sessionId,
            pinned ? undefined : this.docId
          )
        : Promise.resolve([]),
      this.docId
        ? AIProvider.histories.actions(this.workspaceId, this.docId)
        : Promise.resolve([]),
    ]);

    // Check if this is still the latest request
    if (currentRequest !== this.updateHistoryCounter) {
      return;
    }

    const messages: HistoryMessage[] = this.chatContextValue.messages
      .slice()
      .filter(isChatMessage);

    const chatActions = (actions || []) as ChatAction[];
    messages.push(...chatActions);

    const chatMessages = (histories?.[0]?.messages || []) as ChatMessage[];
    messages.push(...chatMessages);

    this.updateContext({
      messages: messages.sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      ),
    });

    this.wheelTriggered = false;
    this.scrollToEnd();
  };

  private readonly updateActions = async () => {
    if (!this.docId || !AIProvider.histories) {
      return;
    }
    const actions = await AIProvider.histories.actions(
      this.workspaceId,
      this.docId
    );
    if (actions && actions.length) {
      const chatMessages = this.chatContextValue.messages.filter(message =>
        isChatMessage(message)
      );
      const chatActions = actions as ChatAction[];
      const messages: HistoryMessage[] = [...chatMessages, ...chatActions];
      this.updateContext({
        messages: messages.sort(
          (a, b) =>
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
        ),
      });
    }

    this.wheelTriggered = false;
    this.scrollToEnd();
  };

  private readonly updateContext = (context: Partial<ChatContextValue>) => {
    this.chatContextValue = { ...this.chatContextValue, ...context };
  };

  private readonly scrollToEnd = () => {
    if (!this.wheelTriggered) {
      this.chatMessagesRef.value?.scrollToEnd();
    }
  };

  private readonly _throttledScrollToEnd = throttle(this.scrollToEnd, 600);

  private readonly initChatContent = async () => {
    this.isHistoryLoading = true;
    await this.updateHistory();
    this.isHistoryLoading = false;
  };

  protected override firstUpdated(): void {
    const chatMessages = this.chatMessagesRef.value;
    if (chatMessages) {
      chatMessages.updateComplete
        .then(() => {
          const scrollContainer = chatMessages.getScrollContainer();
          scrollContainer?.addEventListener('wheel', () => {
            this.wheelTriggered = true;
          });
          scrollContainer?.addEventListener('scrollend', () => {
            this.lastScrollTop = scrollContainer.scrollTop;
          });
        })
        .catch(console.error);
    }
  }

  protected override updated(changedProperties: PropertyValues) {
    if (this.chatContextValue.status === 'loading') {
      // reset the wheel triggered flag when the status is loading
      this.wheelTriggered = false;
    }

    if (
      changedProperties.has('chatContextValue') &&
      (this.chatContextValue.status === 'loading' ||
        this.chatContextValue.status === 'error' ||
        this.chatContextValue.status === 'success')
    ) {
      setTimeout(this.scrollToEnd, 500);
    }

    if (
      changedProperties.has('chatContextValue') &&
      this.chatContextValue.status === 'transmitting'
    ) {
      this._throttledScrollToEnd();
    }

    // restore pinned chat scroll position
    if (
      changedProperties.has('host') &&
      this.session?.pinned &&
      this.lastScrollTop !== undefined
    ) {
      this.chatMessagesRef.value?.scrollToPos(this.lastScrollTop);
    }
  }

  public reset() {
    this.updateContext(DEFAULT_CHAT_CONTEXT_VALUE);
  }

  override connectedCallback() {
    super.connectedCallback();
    this.initChatContent().catch(console.error);

    this._disposables.add(
      AIProvider.slots.actions.subscribe(({ event }) => {
        const { status } = this.chatContextValue;
        if (
          event === 'finished' &&
          (status === 'idle' || status === 'success')
        ) {
          this.updateActions().catch(console.error);
        }
      })
    );

    this._disposables.add(
      AIProvider.slots.requestOpenWithChat.subscribe(
        (params: AIChatParams | null) => {
          if (!params) {
            return;
          }
          if (this.host === params.host) {
            extractSelectedContent(params.host)
              .then(context => {
                if (!context) return;
                this.updateContext(context);
              })
              .catch(console.error);
          }
        }
      )
    );
  }

  override render() {
    return html`${this.chatTitle
        ? html`<div class="ai-chat-title">${this.chatTitle}</div>`
        : nothing}
      <ai-chat-messages
        class=${classMap({
          'ai-chat-messages': true,
          'independent-mode': this.independentMode,
          'no-message': this.messages.length === 0,
        })}
        ${ref(this.chatMessagesRef)}
        .host=${this.host}
        .workspaceId=${this.workspaceId}
        .docId=${this.docId}
        .session=${this.session}
        .createSession=${this.createSession}
        .chatContextValue=${this.chatContextValue}
        .updateContext=${this.updateContext}
        .isHistoryLoading=${this.isHistoryLoading}
        .extensions=${this.extensions}
        .affineFeatureFlagService=${this.affineFeatureFlagService}
        .networkSearchConfig=${this.networkSearchConfig}
        .reasoningConfig=${this.reasoningConfig}
        .width=${this.width}
        .independentMode=${this.independentMode}
        .messages=${this.messages}
      ></ai-chat-messages>
      <ai-chat-composer
        style=${styleMap({
          [this.onboardingOffsetY > 0 ? 'paddingTop' : 'paddingBottom']:
            `${this.messages.length === 0 ? Math.abs(this.onboardingOffsetY) * 2 : 0}px`,
        })}
        .independentMode=${this.independentMode}
        .host=${this.host}
        .workspaceId=${this.workspaceId}
        .docId=${this.docId}
        .session=${this.session}
        .createSession=${this.createSession}
        .chatContextValue=${this.chatContextValue}
        .updateContext=${this.updateContext}
        .updateEmbeddingProgress=${this.updateEmbeddingProgress}
        .networkSearchConfig=${this.networkSearchConfig}
        .reasoningConfig=${this.reasoningConfig}
        .docDisplayConfig=${this.docDisplayConfig}
        .searchMenuConfig=${this.searchMenuConfig}
        .affineWorkspaceDialogService=${this.affineWorkspaceDialogService}
        .trackOptions=${{
          where: 'chat-panel',
          control: 'chat-send',
        }}
      ></ai-chat-composer>`;
  }
}
