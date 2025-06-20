import { toast } from '@affine/component';
import type { CopilotSessionType } from '@affine/graphql';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { openFilesWith } from '@blocksuite/affine/shared/utils';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { ArrowUpBigIcon, CloseIcon, ImageIcon } from '@blocksuite/icons/lit';
import { type Signal, signal } from '@preact/signals-core';
import { css, html, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { ChatAbortIcon } from '../../_common/icons';
import { type AIError, AIProvider } from '../../provider';
import { reportResponse } from '../../utils/action-reporter';
import { readBlobAsURL } from '../../utils/image';
import { mergeStreamObjects } from '../../utils/stream-objects';
import type { ChatChip, DocDisplayConfig } from '../ai-chat-chips/type';
import { isDocChip } from '../ai-chat-chips/utils';
import { type ChatMessage, StreamObjectSchema } from '../ai-chat-messages';
import { MAX_IMAGE_COUNT } from './const';
import type {
  AIChatInputContext,
  AIModelSwitchConfig,
  AINetworkSearchConfig,
  AIReasoningConfig,
} from './type';

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
    [data-theme='light'] .chat-panel-input {
      box-shadow:
        var(--border-shadow),
        0px 0px 0px 3px transparent,
        0px 2px 3px rgba(0, 0, 0, 0.05);
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
    }
    .chat-input-footer-spacer {
      flex: 1;
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor session!: CopilotSessionType | undefined;

  @query('image-preview-grid')
  accessor imagePreviewGrid: HTMLDivElement | null = null;

  @query('textarea')
  accessor textarea!: HTMLTextAreaElement;

  @state()
  accessor isInputEmpty = true;

  @state()
  accessor focused = false;

  @state()
  accessor modelId: string | undefined = undefined;

  @property({ attribute: false })
  accessor chatContextValue!: AIChatInputContext;

  @property({ attribute: false })
  accessor chips: ChatChip[] = [];

  @property({ attribute: false })
  accessor getSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor createSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor getContextId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<AIChatInputContext>) => void;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  @property({ attribute: false })
  accessor reasoningConfig!: AIReasoningConfig;

  @property({ attribute: false })
  accessor modelSwitchConfig: AIModelSwitchConfig | undefined = undefined;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor isRootSession: boolean = true;

  @property({ attribute: false })
  accessor onChatSuccess: (() => void) | undefined;

  @property({ attribute: false })
  accessor trackOptions: BlockSuitePresets.TrackerOptions | undefined;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'chat-panel-input-container';

  @property({ attribute: false })
  accessor panelWidth: Signal<number | undefined> = signal(undefined);

  @property({ attribute: false })
  accessor addImages!: (images: File[]) => void;

  private get _isNetworkActive() {
    return (
      !!this.networkSearchConfig.visible.value &&
      !!this.networkSearchConfig.enabled.value
    );
  }

  private get _isReasoningActive() {
    return !!this.reasoningConfig.enabled.value;
  }

  private get _isImageUploadDisabled() {
    return this.chatContextValue.images.length >= MAX_IMAGE_COUNT;
  }

  override connectedCallback() {
    super.connectedCallback();
    this._disposables.add(
      AIProvider.slots.requestSendWithChat.subscribe(
        ({ input, context, host }) => {
          if (this.host === host) {
            context && this.updateContext(context);
            setTimeout(() => {
              this.send(input).catch(console.error);
            }, 0);
          }
        }
      )
    );
  }

  protected override render() {
    const { images, status } = this.chatContextValue;
    const hasImages = images.length > 0;
    const maxHeight = hasImages ? 272 + 2 : 200 + 2;

    return html` <div
      class="chat-panel-input"
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
        <div
          class="chat-input-icon"
          data-testid="chat-panel-input-image-upload"
          aria-disabled=${this._isImageUploadDisabled}
          @click=${this._uploadImageFiles}
        >
          ${ImageIcon()}
          <affine-tooltip>Upload</affine-tooltip>
        </div>
        <div class="chat-input-footer-spacer"></div>
        <chat-input-preference
          .modelSwitchConfig=${this.modelSwitchConfig}
          .session=${this.session}
          .onModelChange=${this._handleModelChange}
          .modelId=${this.modelId}
          .extendedThinking=${this._isReasoningActive}
          .onExtendedThinkingChange=${this._toggleReasoning}
          .networkSearchVisible=${!!this.networkSearchConfig.visible.value}
          .isNetworkActive=${this._isNetworkActive}
          .onNetworkActiveChange=${this._toggleNetworkSearch}
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
              aria-disabled=${this.isInputEmpty}
              data-testid="chat-panel-send"
            >
              ${ArrowUpBigIcon()}
            </button>`}
      </div>
    </div>`;
  }

  private readonly _handlePointerDown = (e: MouseEvent) => {
    if (e.target !== this.textarea) {
      // by default the div will be focused and will blur the textarea
      e.preventDefault();
      this.textarea.focus();
    }
  };

  private readonly _handleInput = () => {
    const { textarea } = this;
    this.isInputEmpty = !textarea.value.trim();
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
    let imagesHeight = this.imagePreviewGrid?.scrollHeight ?? 0;
    if (imagesHeight) imagesHeight += 12;
    if (this.scrollHeight >= 200 + imagesHeight) {
      textarea.style.height = '148px';
      textarea.style.overflowY = 'scroll';
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

  private readonly _toggleNetworkSearch = (isNetworkActive: boolean) => {
    this.networkSearchConfig.setEnabled(isNetworkActive);
  };

  private readonly _toggleReasoning = (extendedThinking: boolean) => {
    this.reasoningConfig.setEnabled(extendedThinking);
  };

  private readonly _handleImageRemove = (index: number) => {
    const oldImages = this.chatContextValue.images;
    const newImages = oldImages.filter((_, i) => i !== index);
    this.updateContext({ images: newImages });
  };

  private readonly _uploadImageFiles = async (_e: MouseEvent) => {
    if (this._isImageUploadDisabled) return;

    const images = await openFilesWith('Images');
    if (!images) return;
    if (this.chatContextValue.images.length + images.length > MAX_IMAGE_COUNT) {
      toast(`You can only upload up to ${MAX_IMAGE_COUNT} images`);
      return;
    }
    this.addImages(images);
  };

  private readonly _onTextareaSend = async (e: MouseEvent | KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const value = this.textarea.value.trim();
    if (value.length === 0) return;

    this.textarea.value = '';
    this.isInputEmpty = true;
    this.textarea.style.height = 'unset';

    await this.send(value);
  };

  private readonly _handleModelChange = (modelId: string) => {
    this.modelId = modelId;
  };

  send = async (text: string) => {
    try {
      const { status, markdown, images } = this.chatContextValue;
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

      const attachments = await Promise.all(
        images?.map(image => readBlobAsURL(image))
      );
      const userInput = (markdown ? `${markdown}\n` : '') + text;

      // optimistic update messages
      await this._preUpdateMessages(userInput, attachments);

      const sessionId = await this.createSessionId();
      let contexts = await this._getMatchedContexts(userInput);
      if (abortController.signal.aborted) {
        return;
      }
      const stream = await AIProvider.actions.chat({
        sessionId,
        input: userInput,
        contexts,
        docId: this.host.store.id,
        attachments: images,
        workspaceId: this.host.store.workspace.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        isRootSession: this.isRootSession,
        where: this.trackOptions?.where,
        control: this.trackOptions?.control,
        webSearch: this._isNetworkActive,
        reasoning: this._isReasoningActive,
        modelId: this.modelId,
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
    const { messages } = this.chatContextValue;
    const last = messages[messages.length - 1] as ChatMessage;
    if (!last.id) {
      const sessionId = await this.getSessionId();
      const historyIds = await AIProvider.histories?.ids(
        this.host.store.workspace.id,
        this.host.store.id,
        { sessionId }
      );
      if (!historyIds || !historyIds[0]) return;
      last.id = historyIds[0].messages.at(-1)?.id ?? '';
    }
  };

  private async _getMatchedContexts(userInput: string) {
    const contextId = await this.getContextId();
    const workspaceId = this.host.store.workspace.id;

    const docContexts = new Map<
      string,
      { docId: string; docContent: string }
    >();
    const fileContexts = new Map<
      string,
      BlockSuitePresets.AIFileContextOption
    >();

    const { files: matchedFiles = [], docs: matchedDocs = [] } =
      (await AIProvider.context?.matchContext(
        userInput,
        contextId,
        workspaceId
      )) ?? {};

    matchedDocs.forEach(doc => {
      docContexts.set(doc.docId, {
        docId: doc.docId,
        docContent: doc.content,
      });
    });

    matchedFiles.forEach(file => {
      const context = fileContexts.get(file.fileId);
      if (context) {
        context.fileContent += `\n${file.content}`;
      } else {
        fileContexts.set(file.fileId, {
          blobId: file.blobId,
          fileName: file.name,
          fileType: file.mimeType,
          fileContent: file.content,
        });
      }
    });

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

    return {
      docs,
      files: Array.from(fileContexts.values()),
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-input': AIChatInput;
  }
}
