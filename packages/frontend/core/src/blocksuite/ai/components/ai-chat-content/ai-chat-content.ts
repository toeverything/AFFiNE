import type {
  AIDraftService,
  AIToolsConfigService,
} from '@affine/core/modules/ai-button';
import type { AIDraftState } from '@affine/core/modules/ai-button/services/ai-draft';
import type { AIModelService } from '@affine/core/modules/ai-button/services/models';
import type {
  ServerService,
  SubscriptionService,
} from '@affine/core/modules/cloud';
import type { WorkspaceDialogService } from '@affine/core/modules/dialogs';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { PeekViewService } from '@affine/core/modules/peek-view';
import type { AppThemeService } from '@affine/core/modules/theme';
import type {
  ContextEmbedStatus,
  CopilotChatHistoryFragment,
} from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import type { ExtensionType } from '@blocksuite/affine/store';
import type { NotificationService } from '@blocksuite/affine-shared/services';
import { type Signal } from '@preact/signals-core';
import { css, html, type PropertyValues, type TemplateResult } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { createRef, type Ref, ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';
import { pick } from 'lodash-es';

import { type AIChatParams, AIProvider } from '../../provider/ai-provider';
import { extractSelectedContent } from '../../utils/extract';
import { HISTORY_IMAGE_ACTIONS } from '../../utils/history-image-actions';
import type { SearchMenuConfig } from '../ai-chat-add-context';
import type { DocDisplayConfig } from '../ai-chat-chips';
import type { AIReasoningConfig } from '../ai-chat-input';
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
  snapshot: null,
  attachments: [],
  combinedElementsMarkdown: null,
  docs: [],
  html: null,
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

      ai-chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 0 var(--h-padding);
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
    chat-panel-split-view {
      height: 100%;
      width: 100%;
      container-type: inline-size;
      container-name: chat-panel-split-view;
    }
    .chat-panel-main {
      --h-padding: 8px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      height: 100%;
      width: 100%;
      padding: 8px calc(24px - var(--h-padding)) 0 calc(24px - var(--h-padding));
      max-width: 800px;
      margin: 0 auto;
    }

    ai-chat-composer {
      padding: 0 var(--h-padding);
    }

    @container chat-panel-split-view (width < 540px) {
      .chat-panel-main {
        padding: 8px calc(12px - var(--h-padding)) 0
          calc(12px - var(--h-padding));
      }
    }
  `;

  @property({ attribute: false })
  accessor independentMode: boolean | undefined;

  @property({ attribute: false })
  accessor onboardingOffsetY!: number;

  @property({ attribute: false })
  accessor host: EditorHost | null | undefined;

  @property({ attribute: false })
  accessor session!: CopilotChatHistoryFragment | null | undefined;

  @property({ attribute: false })
  accessor createSession!: () => Promise<
    CopilotChatHistoryFragment | undefined
  >;

  @property({ attribute: false })
  accessor workspaceId!: string;

  @property({ attribute: false })
  accessor docId: string | undefined;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor extensions!: ExtensionType[];

  @property({ attribute: false })
  accessor serverService!: ServerService;

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor affineWorkspaceDialogService!: WorkspaceDialogService;

  @property({ attribute: false })
  accessor affineThemeService!: AppThemeService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor aiDraftService: AIDraftService | undefined;

  @property({ attribute: false })
  accessor aiToolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor aiModelService!: AIModelService;

  @property({ attribute: false })
  accessor onEmbeddingProgressChange:
    | ((count: Record<ContextEmbedStatus, number>) => void)
    | undefined;

  @property({ attribute: false })
  accessor onContextChange!: (context: Partial<ChatContextValue>) => void;

  @property({ attribute: false })
  accessor onOpenDoc!: (docId: string, sessionId?: string) => void;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @property({ attribute: false })
  accessor peekViewService!: PeekViewService;

  @property({ attribute: false })
  accessor subscriptionService!: SubscriptionService;

  @property({ attribute: false })
  accessor onAISubscribe!: () => Promise<void>;

  @state()
  accessor chatContextValue: ChatContextValue = DEFAULT_CHAT_CONTEXT_VALUE;

  @state()
  accessor isHistoryLoading = false;

  @state()
  private accessor showPreviewPanel = false;

  @state()
  private accessor previewPanelContent: TemplateResult<1> | null = null;

  private readonly chatMessagesRef: Ref<AIChatMessages> =
    createRef<AIChatMessages>();

  // request counter to track the latest request
  private updateHistoryCounter = 0;

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

  get showActions() {
    return false;
  }

  private readonly updateHistory = async () => {
    const currentRequest = ++this.updateHistoryCounter;
    if (!AIProvider.histories) {
      return;
    }

    const sessionId = this.session?.sessionId;
    const [histories, actions] = await Promise.all([
      sessionId
        ? AIProvider.histories.chats(this.workspaceId, sessionId)
        : Promise.resolve([]),
      this.docId && this.showActions
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
  };

  private readonly updateActions = async () => {
    if (!this.docId || !AIProvider.histories || !this.showActions) {
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
  };

  private readonly updateContext = (context: Partial<ChatContextValue>) => {
    this.chatContextValue = { ...this.chatContextValue, ...context };
    this.onContextChange?.(context);
    this.updateDraft(context).catch(console.error);
  };

  private readonly updateDraft = async (context: Partial<ChatContextValue>) => {
    if (!this.aiDraftService) {
      return;
    }
    const draft: Partial<AIDraftState> = pick(context, [
      'quote',
      'images',
      'markdown',
    ]);
    if (!Object.keys(draft).length) {
      return;
    }
    await this.aiDraftService.setDraft(draft);
  };

  private readonly initChatContent = async () => {
    this.isHistoryLoading = true;
    await this.updateHistory();
    this.isHistoryLoading = false;
  };

  protected override firstUpdated(): void {}

  private _scrollListenersInitialized = false;
  private _initializeScrollListeners() {
    const chatMessages = this.chatMessagesRef.value;
    if (chatMessages) {
      chatMessages.updateComplete
        .then(() => {
          chatMessages.addEventListener('scrollend', () => {
            this.lastScrollTop = chatMessages.scrollTop;
          });
          this._scrollListenersInitialized = true;
        })
        .catch(console.error);
    }
  }

  protected override updated(changedProperties: PropertyValues) {
    // restore pinned chat scroll position
    if (
      changedProperties.has('host') &&
      this.session?.pinned &&
      this.lastScrollTop !== undefined
    ) {
      this.chatMessagesRef.value?.scrollToPos(this.lastScrollTop);
    }

    if (!this._scrollListenersInitialized) {
      this._initializeScrollListeners();
    }
  }

  public openPreviewPanel(content?: TemplateResult<1>) {
    this.showPreviewPanel = true;
    if (content) this.previewPanelContent = content;
    AIProvider.slots.previewPanelOpenChange.next(true);
  }

  public closePreviewPanel(destroyContent: boolean = false) {
    this.showPreviewPanel = false;
    if (destroyContent) this.previewPanelContent = null;
    AIProvider.slots.previewPanelOpenChange.next(false);
  }

  public get isPreviewPanelOpen() {
    return this.showPreviewPanel;
  }

  override connectedCallback() {
    super.connectedCallback();

    this.initChatContent().catch(console.error);

    if (this.aiDraftService) {
      this.aiDraftService
        .getDraft()
        .then(draft => {
          this.chatContextValue = {
            ...this.chatContextValue,
            ...draft,
          };
        })
        .catch(console.error);
    }

    // revalidate subscription to get the latest status
    this.subscriptionService.subscription.revalidate();

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
            if (params.fromAnswer && params.context) {
              this.updateContext(params.context);
            } else {
              extractSelectedContent(params.host)
                .then(context => {
                  if (!context) return;
                  this.updateContext(context);
                })
                .catch(console.error);
            }
          }
          AIProvider.slots.requestOpenWithChat.next(null);
        }
      )
    );
  }

  override render() {
    const left = html` <ai-chat-messages
        class=${classMap({
          'ai-chat-messages': true,
          'independent-mode': !!this.independentMode,
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
        .affineThemeService=${this.affineThemeService}
        .notificationService=${this.notificationService}
        .aiToolsConfigService=${this.aiToolsConfigService}
        .reasoningConfig=${this.reasoningConfig}
        .width=${this.width}
        .independentMode=${this.independentMode}
        .messages=${this.messages}
        .docDisplayService=${this.docDisplayConfig}
        .peekViewService=${this.peekViewService}
        .onOpenDoc=${this.onOpenDoc}
      ></ai-chat-messages>
      <ai-chat-composer
        style=${styleMap({
          [this.onboardingOffsetY > 0 ? 'paddingTop' : 'paddingBottom']:
            `${this.messages.length === 0 ? Math.abs(this.onboardingOffsetY) * 2 : 0}px`,
        })}
        .affineFeatureFlagService=${this.affineFeatureFlagService}
        .independentMode=${this.independentMode}
        .host=${this.host}
        .workspaceId=${this.workspaceId}
        .docId=${this.docId}
        .session=${this.session}
        .createSession=${this.createSession}
        .chatContextValue=${this.chatContextValue}
        .updateContext=${this.updateContext}
        .onEmbeddingProgressChange=${this.onEmbeddingProgressChange}
        .reasoningConfig=${this.reasoningConfig}
        .docDisplayConfig=${this.docDisplayConfig}
        .searchMenuConfig=${this.searchMenuConfig}
        .serverService=${this.serverService}
        .affineWorkspaceDialogService=${this.affineWorkspaceDialogService}
        .notificationService=${this.notificationService}
        .aiDraftService=${this.aiDraftService}
        .aiToolsConfigService=${this.aiToolsConfigService}
        .subscriptionService=${this.subscriptionService}
        .aiModelService=${this.aiModelService}
        .onAISubscribe=${this.onAISubscribe}
        .trackOptions=${{
          where: 'chat-panel',
          control: 'chat-send',
        }}
      ></ai-chat-composer>`;

    const right = this.previewPanelContent;

    return html`<chat-panel-split-view
      .left=${html`<div class="chat-panel-main">${left}</div>`}
      .right=${right}
      .open=${this.showPreviewPanel}
    >
    </chat-panel-split-view>`;
  }
}
