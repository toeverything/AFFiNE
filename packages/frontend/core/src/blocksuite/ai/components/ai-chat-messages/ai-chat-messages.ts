import type { AIToolsConfigService } from '@affine/core/modules/ai-button';
import type { PeekViewService } from '@affine/core/modules/peek-view';
import type { AppThemeService } from '@affine/core/modules/theme';
import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import {
  DocModeProvider,
  type FeatureFlagService,
  type NotificationService,
} from '@blocksuite/affine/shared/services';
import { type EditorHost, ShadowlessElement } from '@blocksuite/affine/std';
import type { BaseSelection, ExtensionType } from '@blocksuite/affine/store';
import { ArrowDownBigIcon as ArrowDownIcon } from '@blocksuite/icons/lit';
import type { Signal } from '@preact/signals-core';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';
import { debounce } from 'lodash-es';

import { AffineIcon } from '../../_common/icons';
import { type AIError, AIProvider, UnauthorizedError } from '../../provider';
import { mergeStreamObjects } from '../../utils/stream-objects';
import type { DocDisplayConfig } from '../ai-chat-chips';
import { type ChatContextValue } from '../ai-chat-content/type';
import type { AIReasoningConfig } from '../ai-chat-input';
import { AIPreloadConfig } from './preload-config';
import {
  type HistoryMessage,
  isChatAction,
  isChatMessage,
  StreamObjectSchema,
} from './type';

export class AIChatMessages extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    ai-chat-messages {
      position: relative;
    }

    .chat-panel-messages-container {
      display: flex;
      flex-direction: column;
      gap: 24px;
      min-height: 100%;
      position: relative;
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
    .independent-mode .messages-placeholder {
      position: static;
      transform: none;
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
      position: fixed;
      left: 50%;
      transform: translate(-50%, 0);
      bottom: 166px;
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
  accessor independentMode: boolean | undefined;

  @property({ attribute: false })
  accessor messages!: HistoryMessage[];

  @property({ attribute: false })
  accessor host: EditorHost | null | undefined;

  @property({ attribute: false })
  accessor workspaceId!: string;

  @property({ attribute: false })
  accessor docId: string | undefined;

  @property({ attribute: false })
  accessor isHistoryLoading!: boolean;

  @property({ attribute: false })
  accessor chatContextValue!: ChatContextValue;

  @property({ attribute: false })
  accessor session!: CopilotChatHistoryFragment | null | undefined;

  @property({ attribute: false })
  accessor createSession!: () => Promise<
    CopilotChatHistoryFragment | undefined
  >;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContextValue>) => void;

  @property({ attribute: false })
  accessor extensions!: ExtensionType[];

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor affineThemeService!: AppThemeService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor width: Signal<number | undefined> | undefined;

  @property({ attribute: false })
  accessor docDisplayService!: DocDisplayConfig;

  @property({ attribute: false })
  accessor aiToolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor peekViewService!: PeekViewService;

  @property({ attribute: false })
  accessor onOpenDoc!: (docId: string, sessionId?: string) => void;

  @property({
    type: String,
    attribute: 'data-testid',
    reflect: true,
  })
  accessor testId = 'chat-panel-messages';

  private get _isReasoningActive() {
    return !!this.reasoningConfig.enabled.value;
  }

  private _renderAIOnboarding() {
    return this.isHistoryLoading
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
    const { clientHeight, scrollTop, scrollHeight } = this;
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
    const { status, error } = this.chatContextValue;
    const { isHistoryLoading } = this;
    const filteredItems = this.messages;

    const showDownIndicator = this.canScrollDown && filteredItems.length > 0;

    return html`
      <div
        class=${classMap({
          'chat-panel-messages-container': true,
          'independent-mode': !!this.independentMode,
        })}
        data-testid="chat-panel-messages-container"
      >
        ${filteredItems.length === 0
          ? html`<div
              class="messages-placeholder"
              data-testid="chat-panel-messages-placeholder"
            >
              ${AffineIcon(
                isHistoryLoading
                  ? 'var(--affine-icon-secondary)'
                  : 'var(--affine-primary-color)'
              )}
              <div
                class="messages-placeholder-title"
                data-loading=${isHistoryLoading}
              >
                ${this.isHistoryLoading
                  ? html`<span data-testid="chat-panel-loading-state"
                      >AFFiNE AI is loading history...</span
                    >`
                  : html`<span data-testid="chat-panel-empty-state"
                      >What can I help you with?</span
                    >`}
              </div>
              ${this.independentMode ? nothing : this._renderAIOnboarding()}
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
                    .session=${this.session}
                    .item=${item}
                    .isLast=${isLast}
                    .status=${isLast ? status : 'idle'}
                    .error=${isLast ? error : null}
                    .extensions=${this.extensions}
                    .affineFeatureFlagService=${this.affineFeatureFlagService}
                    .affineThemeService=${this.affineThemeService}
                    .notificationService=${this.notificationService}
                    .retry=${() => this.retry()}
                    .width=${this.width}
                    .independentMode=${this.independentMode}
                    .docDisplayService=${this.docDisplayService}
                    .peekViewService=${this.peekViewService}
                    .onOpenDoc=${this.onOpenDoc}
                  ></chat-message-assistant>`;
                } else if (isChatAction(item) && this.host) {
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

    const selection$ = this.host?.selection.slots.changed;
    if (selection$) {
      disposables.add(
        selection$.subscribe(() => {
          this._selectionValue = this.host?.selection.value ?? [];
        })
      );
    }

    const docModeService = this.host?.std.get(DocModeProvider);
    if (docModeService && this.docId) {
      disposables.add(
        docModeService.onPrimaryModeChange(
          () => this.requestUpdate(),
          this.docId
        )
      );
    }

    // Add scroll event listener to the host element
    this.addEventListener('scroll', this._debouncedOnScroll);
    disposables.add(() => {
      this.removeEventListener('scroll', this._debouncedOnScroll);
    });
  }

  protected override updated(_changedProperties: PropertyValues) {
    if (_changedProperties.has('isHistoryLoading')) {
      this.canScrollDown = false;
    }

    if (
      _changedProperties.has('chatContextValue') &&
      this.chatContextValue.status === 'transmitting'
    ) {
      this._onScroll();
    }
  }

  scrollToEnd() {
    requestAnimationFrame(() => {
      this.scrollTo({
        top: this.scrollHeight,
        behavior: 'smooth',
      });
    });
  }

  scrollToPos(top: number) {
    requestAnimationFrame(() => {
      this.scrollTo({ top });
    });
  }

  retry = async () => {
    try {
      const sessionId = (await this.createSession())?.sessionId;
      if (!sessionId) return;
      if (!AIProvider.actions.chat) return;

      const abortController = new AbortController();
      const messages = [...this.chatContextValue.messages];
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

      const stream = await AIProvider.actions.chat({
        sessionId,
        retry: true,
        docId: this.docId,
        workspaceId: this.workspaceId,
        stream: true,
        signal: abortController.signal,
        where: 'chat-panel',
        control: 'chat-send',
        isRootSession: true,
        reasoning: this._isReasoningActive,
        toolsConfig: this.aiToolsConfigService.config.value,
      });

      for await (const text of stream) {
        const messages = this.chatContextValue.messages.slice(0);
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
    } catch (error) {
      this.updateContext({ status: 'error', error: error as AIError });
    } finally {
      this.updateContext({ abortController: null });
    }
  };
}
