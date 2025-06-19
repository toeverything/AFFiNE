import { WithDisposable } from '@blocksuite/affine/global/lit';
import {
  DocModeProvider,
  FeatureFlagService,
} from '@blocksuite/affine/shared/services';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { BaseSelection, ExtensionType } from '@blocksuite/affine/store';
import { ArrowDownBigIcon as ArrowDownIcon } from '@blocksuite/icons/lit';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { debounce } from 'lodash-es';

import { AffineIcon } from '../_common/icons';
import type {
  AINetworkSearchConfig,
  AIReasoningConfig,
} from '../components/ai-chat-input';
import {
  type ChatMessage,
  isChatAction,
  isChatMessage,
  StreamObjectSchema,
} from '../components/ai-chat-messages';
import { type AIError, AIProvider, UnauthorizedError } from '../provider';
import { mergeStreamObjects } from '../utils/stream-objects';
import { type ChatContextValue } from './chat-context';
import { HISTORY_IMAGE_ACTIONS } from './const';
import { AIPreloadConfig } from './preload-config';

export class ChatPanelMessages extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    chat-panel-messages {
      position: relative;
    }

    .chat-panel-messages-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
      height: 100%;
      position: relative;
      overflow-y: auto;
    }

    chat-panel-assistant-message,
    chat-panel-user-message {
      display: contents;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
      color: var(--affine-text-primary-color);
      font-size: var(--affine-font-sm);
      font-weight: 500;
      user-select: none;
    }

    .messages-placeholder {
      width: 100%;
      position: absolute;
      z-index: 1;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }

    .messages-placeholder-title {
      font-size: 18px;
      font-weight: 600;
      color: var(--affine-text-primary-color);
    }

    .messages-placeholder-title[data-loading='true'] {
      font-size: var(--affine-font-sm);
      color: var(--affine-text-secondary-color);
    }

    .onboarding-wrapper {
      display: flex;
      gap: 8px;
      flex-direction: column;
      margin-top: 16px;
    }

    .onboarding-item {
      display: flex;
      height: 28px;
      gap: 8px;
      align-items: center;
      justify-content: start;
      cursor: pointer;
    }

    .onboarding-item-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: var(--affine-text-secondary-color);
    }

    .onboarding-item-text {
      font-size: var(--affine-font-xs);
      font-weight: 400;
      color: var(--affine-text-primary-color);
      white-space: nowrap;
    }

    .down-indicator {
      position: absolute;
      left: 50%;
      transform: translate(-50%, 0);
      bottom: 24px;
      z-index: 1;
      border-radius: 50%;
      width: 32px;
      height: 32px;
      border: 0.5px solid var(--affine-border-color);
      background-color: var(--affine-background-primary-color);
      box-shadow: var(--affine-shadow-2);
      display: flex;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    }
  `;

  @state()
  accessor _selectionValue: BaseSelection[] = [];

  @state()
  accessor canScrollDown = false;

  @state()
  accessor avatarUrl = '';

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor isLoading!: boolean;

  @property({ attribute: false })
  accessor chatContextValue!: ChatContextValue;

  @property({ attribute: false })
  accessor getSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor createSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContextValue>) => void;

  @property({ attribute: false })
  accessor extensions!: ExtensionType[];

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @query('.chat-panel-messages-container')
  accessor messagesContainer: HTMLDivElement | null = null;

  @property({
    type: String,
    attribute: 'data-testid',
    reflect: true,
  })
  accessor testId = 'chat-panel-messages';

  getScrollContainer(): HTMLDivElement | null {
    return this.messagesContainer;
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

  private _renderAIOnboarding() {
    return this.isLoading ||
      !this.host?.store.get(FeatureFlagService).getFlag('enable_ai_onboarding')
      ? nothing
      : html`<div class="onboarding-wrapper" data-testid="ai-onboarding">
          ${repeat(
            AIPreloadConfig,
            config => config.text,
            config => {
              return html`<div
                data-testid=${config.testId}
                @click=${() => config.handler()}
                class="onboarding-item"
              >
                <div class="onboarding-item-icon">${config.icon}</div>
                <div class="onboarding-item-text">${config.text}</div>
              </div>`;
            }
          )}
        </div>`;
  }

  private readonly _onScroll = () => {
    if (!this.messagesContainer) return;
    const { clientHeight, scrollTop, scrollHeight } = this.messagesContainer;
    this.canScrollDown = scrollHeight - scrollTop - clientHeight > 200;
  };

  private readonly _debouncedOnScroll = debounce(
    this._onScroll.bind(this),
    100
  );

  private readonly _onDownIndicatorClick = () => {
    this.canScrollDown = false;
    this.scrollToEnd();
  };

  protected override render() {
    const { messages, status, error } = this.chatContextValue;
    const { isLoading } = this;
    const filteredItems = messages.filter(item => {
      return (
        isChatMessage(item) ||
        item.messages?.length === 3 ||
        (HISTORY_IMAGE_ACTIONS.includes(item.action) &&
          item.messages?.length === 2)
      );
    });

    const showDownIndicator =
      this.canScrollDown &&
      filteredItems.length > 0 &&
      this.chatContextValue.status !== 'transmitting';

    return html`
      <div
        class="chat-panel-messages-container"
        data-testid="chat-panel-messages-container"
        @scroll=${() => this._debouncedOnScroll()}
      >
        ${filteredItems.length === 0
          ? html`<div
              class="messages-placeholder"
              data-testid="chat-panel-messages-placeholder"
            >
              ${AffineIcon(
                isLoading
                  ? 'var(--affine-icon-secondary)'
                  : 'var(--affine-primary-color)'
              )}
              <div class="messages-placeholder-title" data-loading=${isLoading}>
                ${this.isLoading
                  ? html`<span data-testid="chat-panel-loading-state"
                      >AFFiNE AI is loading history...</span
                    >`
                  : html`<span data-testid="chat-panel-empty-state"
                      >What can I help you with?</span
                    >`}
              </div>
              ${this._renderAIOnboarding()}
            </div> `
          : repeat(
              filteredItems,
              (_, index) => index,
              (item, index) => {
                const isLast = index === filteredItems.length - 1;
                if (isChatMessage(item) && item.role === 'user') {
                  return html`<chat-message-user
                    .item=${item}
                  ></chat-message-user>`;
                } else if (isChatMessage(item) && item.role === 'assistant') {
                  return html`<chat-message-assistant
                    .host=${this.host}
                    .item=${item}
                    .isLast=${isLast}
                    .status=${isLast ? status : 'idle'}
                    .error=${isLast ? error : null}
                    .extensions=${this.extensions}
                    .affineFeatureFlagService=${this.affineFeatureFlagService}
                    .getSessionId=${this.getSessionId}
                    .retry=${() => this.retry()}
                  ></chat-message-assistant>`;
                } else if (isChatAction(item)) {
                  return html`<chat-message-action
                    .host=${this.host}
                    .item=${item}
                  ></chat-message-action>`;
                }
                return nothing;
              }
            )}
      </div>
      ${showDownIndicator && filteredItems.length > 0
        ? html`<div
            data-testid="chat-panel-scroll-down-indicator"
            class="down-indicator"
            @click=${this._onDownIndicatorClick}
          >
            ${ArrowDownIcon()}
          </div>`
        : nothing}
    `;
  }

  override connectedCallback() {
    super.connectedCallback();
    const { disposables } = this;
    const docModeService = this.host.std.get(DocModeProvider);

    Promise.resolve(AIProvider.userInfo)
      .then(res => {
        this.avatarUrl = res?.avatarUrl ?? '';
      })
      .catch(console.error);

    disposables.add(
      AIProvider.slots.userInfo.subscribe(userInfo => {
        const { status, error } = this.chatContextValue;
        this.avatarUrl = userInfo?.avatarUrl ?? '';
        if (
          status === 'error' &&
          error instanceof UnauthorizedError &&
          userInfo
        ) {
          this.updateContext({ status: 'idle', error: null });
        }
      })
    );
    disposables.add(
      this.host.selection.slots.changed.subscribe(() => {
        this._selectionValue = this.host.selection.value;
      })
    );
    disposables.add(
      docModeService.onPrimaryModeChange(
        () => this.requestUpdate(),
        this.host.store.id
      )
    );
  }

  protected override updated(_changedProperties: PropertyValues) {
    if (_changedProperties.has('isLoading')) {
      this.canScrollDown = false;
    }
  }

  scrollToEnd() {
    requestAnimationFrame(() => {
      if (!this.messagesContainer) return;
      this.messagesContainer.scrollTo({
        top: this.messagesContainer.scrollHeight,
        behavior: 'smooth',
      });
    });
  }

  retry = async () => {
    try {
      const sessionId = await this.createSessionId();
      if (!sessionId) return;
      if (!AIProvider.actions.chat) return;

      const abortController = new AbortController();
      const messages = [...this.chatContextValue.messages];
      const last = messages[messages.length - 1];
      if ('content' in last) {
        last.content = '';
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
        sessionId,
        retry: true,
        docId: store.id,
        workspaceId: store.workspace.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        where: 'chat-panel',
        control: 'chat-send',
        isRootSession: true,
        reasoning: this._isReasoningActive,
        webSearch: this._isNetworkActive,
      });

      for await (const text of stream) {
        const messages = [...this.chatContextValue.messages];
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
    } catch (error) {
      this.updateContext({ status: 'error', error: error as AIError });
    } finally {
      this.updateContext({ abortController: null });
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-panel-messages': ChatPanelMessages;
  }
}
