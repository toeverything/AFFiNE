import type {
  AIDraftService,
  AIToolsConfigService,
} from '@affine/core/modules/ai-button';
import type { AIModelService } from '@affine/core/modules/ai-button/services/models';
import type {
  ServerService,
  SubscriptionService,
} from '@affine/core/modules/cloud';
import type { FeatureFlagService } from '@affine/core/modules/feature-flag';
import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { NotificationService } from '@blocksuite/affine-shared/services';
import { ArrowUpBigIcon, CloseIcon } from '@blocksuite/icons/lit';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { ChatAbortIcon } from '../../_common/icons';
import { type AIError, AIProvider, type AISendParams } from '../../provider';
import { reportResponse } from '../../utils/action-reporter';
import { readBlobAsURL } from '../../utils/image';
import { mergeStreamObjects } from '../../utils/stream-objects';
import type { SearchMenuConfig } from '../ai-chat-add-context';
import type { ChatChip, DocDisplayConfig } from '../ai-chat-chips/type';
import { isDocChip } from '../ai-chat-chips/utils';
import {
  type ChatMessage,
  isChatMessage,
  StreamObjectSchema,
} from '../ai-chat-messages';
import type { AIChatInputContext, AIReasoningConfig } from './type';

function getFirstTwoLines(text: string) {
  const lines = text.split('\n');
  return lines.slice(0, 2);
}

export class AIChatInput extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    :host {
      width: 100%;
    }

    [data-theme='dark'] .chat-panel-input {
      box-shadow:
        var(--border-shadow),
        0px 0px 0px 0px rgba(28, 158, 228, 0),
        0px 0px 0px 2px transparent;
    }
    [data-theme='light'] .chat-panel-input,
    .chat-panel-input {
      box-shadow:
        var(--border-shadow),
        0px 0px 0px 3px transparent,
        0px 2px 3px rgba(0, 0, 0, 0.05);
    }
    .chat-panel-input[data-if-focused='true'] {
      box-shadow:
        var(--border-shadow),
        0px 0px 0px 3px transparent,
        0px 4px 6px rgba(0, 0, 0, 0.05);
    }
    [data-theme='dark'] .chat-panel-input[data-if-focused='true'] {
      box-shadow:
        var(--border-shadow),
        0px 0px 0px 3px rgba(28, 158, 228, 0.3),
        0px 2px 3px rgba(0, 0, 0, 0.05);
    }

    .chat-panel-input {
      --input-border-width: 0.5px;
      --input-border-color: var(--affine-v2-layer-insideBorder-border);
      --border-shadow: 0px 0px 0px var(--input-border-width)
        var(--input-border-color);
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 4px;
      position: relative;
      border-radius: 12px;
      padding: 8px 6px 6px 8px;
      min-height: 94px;
      box-sizing: border-box;
      transition: box-shadow 0.23s ease;
      background-color: var(--affine-v2-input-background);

      &[data-independent-mode='true'] {
        padding: 12px;
        border-radius: 16px;
      }

      .chat-selection-quote {
        padding: 4px 0px 8px 0px;
        padding-left: 15px;
        max-height: 56px;
        font-size: 14px;
        font-weight: 400;
        line-height: 22px;
        color: var(--affine-text-secondary-color);
        position: relative;

        div {
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .chat-quote-close {
          position: absolute;
          right: 0;
          top: 0;
          cursor: pointer;
          display: none;
          width: 16px;
          height: 16px;
          border-radius: 4px;
          border: 1px solid var(--affine-border-color);
          background-color: var(--affine-white);
        }
      }

      .chat-selection-quote:hover .chat-quote-close {
        display: flex;
        justify-content: center;
        align-items: center;
      }

      .chat-selection-quote::after {
        content: '';
        width: 2px;
        height: calc(100% - 10px);
        margin-top: 5px;
        position: absolute;
        left: 0;
        top: 0;
        background: var(--affine-quote-color);
        border-radius: 18px;
      }
    }

    .chat-panel-input-actions {
      display: flex;
      gap: 8px;
      align-items: center;

      .chat-input-icon {
        cursor: pointer;
        padding: 2px;
        display: flex;
        justify-content: center;
        align-items: center;
        border-radius: 4px;

        svg {
          width: 20px;
          height: 20px;
          color: ${unsafeCSSVarV2('icon/primary')};
        }

        .chat-input-icon-label {
          font-size: 14px;
          line-height: 22px;
          font-weight: 500;
          color: ${unsafeCSSVarV2('icon/primary')};
          margin: 0 4px 0 4px;
        }
      }

      .chat-input-icon:nth-child(2) {
        margin-left: auto;
      }

      .chat-input-icon:hover {
        background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
      }

      .chat-input-icon[data-active='true'] {
        background-color: #1e96eb14;

        svg {
          color: ${unsafeCSSVarV2('icon/activated')};
        }

        .chat-input-icon-label {
          color: ${unsafeCSSVarV2('icon/activated')};
        }
      }

      .chat-input-icon[aria-disabled='true'] {
        cursor: not-allowed;

        svg {
          color: ${unsafeCSSVarV2('icon/secondary')} !important;
        }
      }
    }

    .chat-panel-input {
      textarea {
        width: 100%;
        padding: 0;
        margin: 0;
        border: none;
        line-height: 22px;
        font-size: var(--affine-font-sm);
        font-weight: 400;
        font-family: var(--affine-font-family);
        color: var(--affine-text-primary-color);
        box-sizing: border-box;
        resize: none;
        overflow-y: scroll;
        background-color: transparent;
      }

      textarea::-webkit-scrollbar {
        -webkit-appearance: none;
        width: 4px;
        display: block;
      }

      textarea::-webkit-scrollbar:horizontal {
        height: 8px;
      }

      textarea::-webkit-scrollbar-thumb {
        border-radius: 2px;
        background-color: transparent;
      }

      textarea:hover::-webkit-scrollbar-thumb {
        border-radius: 16px;
        background-color: ${unsafeCSSVar('black30')};
      }

      textarea::placeholder {
        font-size: 14px;
        font-weight: 400;
        font-family: var(--affine-font-family);
        color: var(--affine-v2-text-placeholder);
      }

      textarea:focus {
        outline: none;
      }
    }

    .chat-panel-input[data-if-focused='true'] {
      --input-border-width: 1px;
      --input-border-color: var(--affine-v2-layer-insideBorder-primaryBorder);
      user-select: none;
    }

    .chat-panel-send {
      display: flex;
      justify-content: center;
      align-items: center;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      border-radius: 50%;
      font-size: 20px;
      background: var(--affine-v2-icon-activated);
      color: var(--affine-v2-layer-pureWhite);
      border: none;
      padding: 0;
      cursor: pointer;
    }
    .chat-panel-send[aria-disabled='true'] {
      cursor: not-allowed;
      background: var(--affine-v2-button-disable);
    }
    .chat-panel-stop {
      cursor: pointer;
      width: 28px;
      height: 28px;
      flex-shrink: 0;
      display: flex;
      justify-content: center;
      align-items: center;
      border-radius: 50%;
      font-size: 24px;
      color: var(--affine-v2-icon-activated);
      border: none;
      padding: 0;
      background: transparent;
    }
    .chat-input-footer-spacer {
      flex: 1;
    }
  `;

  @property({ attribute: false })
  accessor independentMode: boolean | undefined;

  @property({ attribute: false })
  accessor host: EditorHost | null | undefined;

  @property({ attribute: false })
  accessor workspaceId!: string;

  @property({ attribute: false })
  accessor docId: string | undefined;

  @property({ attribute: false })
  accessor session!: CopilotChatHistoryFragment | null | undefined;

  @property({ attribute: false })
  accessor isContextProcessing!: boolean | undefined;

  @query('image-preview-grid')
  accessor imagePreviewGrid: HTMLDivElement | null = null;

  @query('textarea')
  accessor textarea!: HTMLTextAreaElement;

  @state()
  accessor isInputEmpty = true;

  @state()
  accessor focused = false;

  @property({ attribute: false })
  accessor chatContextValue!: AIChatInputContext;

  @property({ attribute: false })
  accessor chips: ChatChip[] = [];

  @property({ attribute: false })
  accessor createSession!: () => Promise<
    CopilotChatHistoryFragment | undefined
  >;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<AIChatInputContext>) => void;

  @property({ attribute: false })
  accessor addImages!: (images: File[]) => void;

  @property({ attribute: false })
  accessor addChip!: (chip: ChatChip, silent?: boolean) => Promise<void>;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor searchMenuConfig!: SearchMenuConfig;

  @property({ attribute: false })
  accessor serverService!: ServerService;

  @property({ attribute: false })
  accessor aiDraftService: AIDraftService | undefined;

  @property({ attribute: false })
  accessor aiToolsConfigService!: AIToolsConfigService;

  @property({ attribute: false })
  accessor affineFeatureFlagService!: FeatureFlagService;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @property({ attribute: false })
  accessor subscriptionService!: SubscriptionService;

  @property({ attribute: false })
  accessor aiModelService!: AIModelService;

  @property({ attribute: false })
  accessor onAISubscribe!: () => Promise<void>;

  @property({ attribute: false })
  accessor isRootSession: boolean = true;

  @property({ attribute: false })
  accessor onChatSuccess: (() => void) | undefined;

  @property({ attribute: false })
  accessor trackOptions: BlockSuitePresets.TrackerOptions | undefined;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'chat-panel-input-container';

  @property({ attribute: false })
  accessor portalContainer: HTMLElement | null = null;

  private get _isReasoningActive() {
    return !!this.reasoningConfig.enabled.value;
  }

  override connectedCallback() {
    super.connectedCallback();

    this._disposables.add(
      AIProvider.slots.requestSendWithChat.subscribe(
        (params: AISendParams | null) => {
          if (!params) {
            return;
          }
          const { input, context, host } = params;
          if (this.host === host) {
            if (context) {
              this.updateContext(context);
            }
            setTimeout(() => {
              this.send(input).catch(console.error);
            }, 0);
          }
          AIProvider.slots.requestSendWithChat.next(null);
        }
      )
    );

    this._disposables.add(
      AIProvider.slots.requestOpenWithChat.subscribe(params => {
        if (!params) return;

        const { input, host } = params;
        if (this.host !== host) return;

        if (input) {
          this.textarea.value = input;
          this.isInputEmpty = !this.textarea.value.trim();
        }
      })
    );
  }

  protected override firstUpdated(changedProperties: PropertyValues): void {
    super.firstUpdated(changedProperties);
    if (this.aiDraftService) {
      this.aiDraftService
        .getDraft()
        .then(draft => {
          this.textarea.value = draft.input;
          this.isInputEmpty = !this.textarea.value.trim();
        })
        .catch(console.error);
    }
  }

  protected override render() {
    const { images, status } = this.chatContextValue;
    const hasImages = images.length > 0;
    const maxHeight = hasImages ? 272 + 2 : 200 + 2;

    return html`<div
      class="chat-panel-input"
      data-independent-mode=${this.independentMode}
      data-if-focused=${this.focused}
      style=${styleMap({
        maxHeight: `${maxHeight}px !important`,
      })}
      @pointerdown=${this._handlePointerDown}
    >
      ${hasImages
        ? html`
            <image-preview-grid
              .images=${images}
              .onImageRemove=${this._handleImageRemove}
            ></image-preview-grid>
          `
        : nothing}
      ${this.chatContextValue.quote
        ? html`<div
            class="chat-selection-quote"
            data-testid="chat-selection-quote"
          >
            ${repeat(
              getFirstTwoLines(this.chatContextValue.quote),
              line => line,
              line => html`<div>${line}</div>`
            )}
            <div
              class="chat-quote-close"
              @click=${() => {
                this.updateContext({ quote: '', markdown: '' });
              }}
            >
              ${CloseIcon()}
            </div>
          </div>`
        : nothing}
      <textarea
        rows="1"
        placeholder="What are your thoughts?"
        @input=${this._handleInput}
        @keydown=${this._handleKeyDown}
        @focus=${() => {
          this.focused = true;
        }}
        @blur=${() => {
          this.focused = false;
        }}
        @paste=${this._handlePaste}
        data-testid="chat-panel-input"
      ></textarea>
      <div class="chat-panel-input-actions">
        <div class="chat-input-icon">
          <ai-chat-add-context
            .docId=${this.docId}
            .independentMode=${this.independentMode}
            .addChip=${this.addChip}
            .addImages=${this.addImages}
            .docDisplayConfig=${this.docDisplayConfig}
            .searchMenuConfig=${this.searchMenuConfig}
            .portalContainer=${this.portalContainer}
          ></ai-chat-add-context>
        </div>
        <div class="chat-input-footer-spacer"></div>
        <chat-input-preference
          .session=${this.session}
          .extendedThinking=${this._isReasoningActive}
          .onExtendedThinkingChange=${this._toggleReasoning}
          .serverService=${this.serverService}
          .toolsConfigService=${this.aiToolsConfigService}
          .notificationService=${this.notificationService}
          .subscriptionService=${this.subscriptionService}
          .aiModelService=${this.aiModelService}
          .onAISubscribe=${this.onAISubscribe}
        ></chat-input-preference>
        ${status === 'transmitting' || status === 'loading'
          ? html`<button
              class="chat-panel-stop"
              @click=${this._handleAbort}
              data-testid="chat-panel-stop"
            >
              ${ChatAbortIcon}
            </button>`
          : html`<button
              @click="${this._onTextareaSend}"
              class="chat-panel-send"
              aria-disabled=${this.isSendDisabled}
              data-testid="chat-panel-send"
            >
              ${ArrowUpBigIcon()}
            </button>`}
      </div>
    </div>`;
  }

  private get isSendDisabled() {
    if (this.isInputEmpty) {
      return true;
    }

    if (this.isContextProcessing) {
      return true;
    }

    return false;
  }

  private readonly _handlePointerDown = (e: MouseEvent) => {
    if (e.target !== this.textarea) {
      // by default the div will be focused and will blur the textarea
      e.preventDefault();
      this.textarea.focus();
    }
  };

  private readonly _handleInput = async () => {
    const { textarea } = this;
    const value = textarea.value.trim();
    this.isInputEmpty = !value;

    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    let imagesHeight = this.imagePreviewGrid?.scrollHeight ?? 0;
    if (imagesHeight) imagesHeight += 12;
    if (this.scrollHeight >= 200 + imagesHeight) {
      textarea.style.height = '148px';
      textarea.style.overflowY = 'scroll';
    }

    if (this.aiDraftService) {
      await this.aiDraftService.setDraft({
        input: value,
      });
    }
  };

  private readonly _handleKeyDown = async (evt: KeyboardEvent) => {
    if (evt.key === 'Enter' && !evt.shiftKey && !evt.isComposing) {
      await this._onTextareaSend(evt);
    }
  };

  private readonly _handlePaste = (event: ClipboardEvent) => {
    event.stopPropagation();
    const items = event.clipboardData?.items;
    if (!items) return;

    for (const index in items) {
      const item = items[index];
      if (item.kind === 'file' && item.type.indexOf('image') >= 0) {
        const blob = item.getAsFile();
        if (!blob) continue;
        this.addImages([blob]);
      }
    }
  };

  private readonly _handleAbort = () => {
    this.chatContextValue.abortController?.abort();
    this.updateContext({ status: 'success' });
    reportResponse('aborted:stop');
  };

  private readonly _toggleReasoning = (extendedThinking: boolean) => {
    this.reasoningConfig.setEnabled(extendedThinking);
  };

  private readonly _handleImageRemove = (index: number) => {
    const oldImages = this.chatContextValue.images;
    const newImages = oldImages.filter((_, i) => i !== index);
    this.updateContext({ images: newImages });
  };

  private readonly _onTextareaSend = async (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const value = this.textarea.value.trim();
    if (value.length === 0) return;

    this.textarea.value = '';
    this.isInputEmpty = true;
    this.textarea.style.height = 'unset';

    if (this.aiDraftService) {
      await this.aiDraftService.setDraft({
        input: '',
      });
    }
    await this.send(value);
  };

  send = async (text: string) => {
    try {
      const {
        status,
        markdown,
        images,
        snapshot,
        combinedElementsMarkdown,
        html,
      } = this.chatContextValue;

      if (status === 'loading' || status === 'transmitting') return;
      if (!text) return;
      if (!AIProvider.actions.chat) return;

      const abortController = new AbortController();
      this.updateContext({
        images: [],
        status: 'loading',
        error: null,
        quote: '',
        markdown: '',
        abortController,
      });

      const imageAttachments = await Promise.all(
        images?.map(image => readBlobAsURL(image))
      );
      const userInput = (markdown ? `${markdown}\n` : '') + text;

      // optimistic update messages
      await this._preUpdateMessages(userInput, imageAttachments);

      const sessionId = (await this.createSession())?.sessionId;
      let contexts = await this._getMatchedContexts();
      if (abortController.signal.aborted) {
        return;
      }

      const enableSendDetailedObject =
        this.affineFeatureFlagService.flags.enable_send_detailed_object_to_ai
          .value;

      const modelId = this.aiModelService.modelId.value;
      const stream = await AIProvider.actions.chat({
        sessionId,
        input: userInput,
        contexts: {
          ...contexts,
          selectedSnapshot:
            snapshot && enableSendDetailedObject ? snapshot : undefined,
          selectedMarkdown:
            combinedElementsMarkdown && enableSendDetailedObject
              ? combinedElementsMarkdown
              : undefined,
          html: html || undefined,
        },
        docId: this.docId,
        attachments: images,
        workspaceId: this.workspaceId,
        stream: true,
        signal: abortController.signal,
        isRootSession: this.isRootSession,
        where: this.trackOptions?.where,
        control: this.trackOptions?.control,
        reasoning: this._isReasoningActive,
        toolsConfig: this.aiToolsConfigService.config.value,
        modelId,
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
      this.onChatSuccess?.();
      // update message id from server
      await this._postUpdateMessages();
    } catch (error) {
      this.updateContext({ status: 'error', error: error as AIError });
    } finally {
      this.updateContext({ abortController: null });
    }
  };

  private readonly _preUpdateMessages = async (
    userInput: string,
    attachments: string[]
  ) => {
    const userInfo = await AIProvider.userInfo;
    this.updateContext({
      messages: [
        ...this.chatContextValue.messages,
        {
          id: '',
          role: 'user',
          content: userInput,
          createdAt: new Date().toISOString(),
          attachments,
          userId: userInfo?.id,
          userName: userInfo?.name,
          avatarUrl: userInfo?.avatarUrl ?? undefined,
        },
        {
          id: '',
          role: 'assistant',
          content: '',
          createdAt: new Date().toISOString(),
        },
      ],
    });
  };

  private readonly _postUpdateMessages = async () => {
    const sessionId = this.session?.sessionId;
    if (!sessionId || !AIProvider.histories) return;

    const { messages } = this.chatContextValue;
    const last = messages[messages.length - 1] as ChatMessage;
    if (!last.id) {
      const historyIds = await AIProvider.histories.ids(
        this.workspaceId,
        this.docId,
        { sessionId, withMessages: true }
      );
      if (!historyIds || !historyIds[0]) return;
      last.id = historyIds[0].messages.at(-1)?.id ?? '';
    }
  };

  private async _getMatchedContexts() {
    const docContexts = new Map<
      string,
      { docId: string; docContent: string }
    >();

    this.chips.forEach(chip => {
      if (isDocChip(chip) && !!chip.markdown?.value) {
        docContexts.set(chip.docId, {
          docId: chip.docId,
          docContent: chip.markdown.value,
        });
      }
    });

    const docs: BlockSuitePresets.AIDocContextOption[] = Array.from(
      docContexts.values()
    ).map(doc => {
      const docMeta = this.docDisplayConfig.getDocMeta(doc.docId);
      const docTitle = this.docDisplayConfig.getTitle(doc.docId);
      const tags = docMeta?.tags
        ? docMeta.tags
            .map(tagId => this.docDisplayConfig.getTagTitle(tagId))
            .join(',')
        : '';
      return {
        docId: doc.docId,
        docContent: doc.docContent,
        docTitle,
        tags,
        createDate: docMeta?.createDate
          ? new Date(docMeta.createDate).toISOString()
          : '',
        updatedDate: docMeta?.updatedDate
          ? new Date(docMeta.updatedDate).toISOString()
          : '',
      };
    });

    return { docs, files: [] };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-input': AIChatInput;
  }
}
