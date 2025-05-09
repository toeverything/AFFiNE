import { stopPropagation } from '@affine/core/utils';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { openFileOrFiles } from '@blocksuite/affine/shared/utils';
import type { EditorHost } from '@blocksuite/affine/std';
import {
  CloseIcon,
  ImageIcon,
  PublishIcon,
  ThinkingIcon,
} from '@blocksuite/icons/lit';
import { type Signal, signal } from '@preact/signals-core';
import { css, html, LitElement, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { ChatAbortIcon, ChatSendIcon } from '../../_common/icons';
import { type AIError, AIProvider } from '../../provider';
import { reportResponse } from '../../utils/action-reporter';
import { readBlobAsURL } from '../../utils/image';
import type {
  ChatChip,
  DocDisplayConfig,
  FileChip,
} from '../ai-chat-chips/type';
import {
  isCollectionChip,
  isDocChip,
  isFileChip,
  isTagChip,
} from '../ai-chat-chips/utils';
import type { ChatMessage } from '../ai-chat-messages';
import { MAX_IMAGE_COUNT } from './const';
import type {
  AIChatInputContext,
  AINetworkSearchConfig,
  AIReasoningConfig,
} from './type';

function getFirstTwoLines(text: string) {
  const lines = text.split('\n');
  return lines.slice(0, 2);
}

export class AIChatInput extends SignalWatcher(WithDisposable(LitElement)) {
  static override styles = css`
    :host {
      width: 100%;
    }
    .chat-panel-input {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      position: relative;
      margin-top: 12px;
      border-radius: 4px;
      padding: 8px;
      min-height: 94px;
      box-sizing: border-box;
      border-width: 1px;
      border-style: solid;
      border-color: var(--affine-border-color);

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
        overflow-y: hidden;
        background-color: transparent;
      }

      textarea::placeholder {
        font-size: 14px;
        font-weight: 400;
        font-family: var(--affine-font-family);
        color: var(--affine-placeholder-color);
      }

      textarea:focus {
        outline: none;
      }
    }

    .chat-panel-input[data-if-focused='true'] {
      border-color: var(--affine-primary-color);
      box-shadow: var(--affine-active-shadow);
      user-select: none;
    }

    .chat-panel-send svg rect {
      fill: var(--affine-primary-color);
    }
    .chat-panel-send[aria-disabled='true'] {
      cursor: not-allowed;
    }
    .chat-panel-send[aria-disabled='true'] svg rect {
      fill: var(--affine-text-disable-color);
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

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
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor isRootSession: boolean = true;

  @property({ attribute: false })
  accessor onChatSuccess: (() => void) | undefined;

  @property({ attribute: false })
  accessor trackOptions!: BlockSuitePresets.TrackerOptions;

  @property({ attribute: 'data-testid', reflect: true })
  accessor testId = 'chat-panel-input-container';

  @property({ attribute: false })
  accessor sideBarWidth: Signal<number | undefined> = signal(undefined);

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
    const showLabel = this.sideBarWidth.value && this.sideBarWidth.value > 400;

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
        ${this.networkSearchConfig.visible.value
          ? html`
              <div
                class="chat-input-icon"
                data-testid="chat-network-search"
                data-active=${this._isNetworkActive}
                @click=${this._toggleNetworkSearch}
                @pointerdown=${stopPropagation}
              >
                ${PublishIcon()}
                ${!showLabel
                  ? html`<affine-tooltip>Search</affine-tooltip>`
                  : nothing}
                ${showLabel
                  ? html`<span class="chat-input-icon-label">Search</span>`
                  : nothing}
              </div>
            `
          : nothing}
        <div
          class="chat-input-icon"
          data-testid="chat-reasoning"
          data-active=${this._isReasoningActive}
          @click=${this._toggleReasoning}
          @pointerdown=${stopPropagation}
        >
          ${ThinkingIcon()}
          ${!showLabel
            ? html`<affine-tooltip>Reason</affine-tooltip>`
            : nothing}
          ${showLabel
            ? html`<span class="chat-input-icon-label">Reason</span>`
            : nothing}
        </div>
        ${status === 'transmitting'
          ? html`<div @click=${this._handleAbort} data-testid="chat-panel-stop">
              ${ChatAbortIcon}
            </div>`
          : html`<div
              @click="${this._onTextareaSend}"
              class="chat-panel-send"
              aria-disabled=${this.isInputEmpty}
              data-testid="chat-panel-send"
            >
              ${ChatSendIcon}
            </div>`}
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

  private readonly _toggleNetworkSearch = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const enable = this.networkSearchConfig.enabled.value;
    this.networkSearchConfig.setEnabled(!enable);
  };

  private readonly _toggleReasoning = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const enable = this.reasoningConfig.enabled.value;
    this.reasoningConfig.setEnabled(!enable);
  };

  private readonly _handleImageRemove = (index: number) => {
    const oldImages = this.chatContextValue.images;
    const newImages = oldImages.filter((_, i) => i !== index);
    this.updateContext({ images: newImages });
  };

  private readonly _uploadImageFiles = async (_e: MouseEvent) => {
    if (this._isImageUploadDisabled) return;

    const images = await openFileOrFiles({
      acceptType: 'Images',
      multiple: true,
    });
    if (!images) return;
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
      contexts = this._filterContexts(contexts);
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
        where: this.trackOptions.where,
        control: this.trackOptions.control,
        webSearch: this._isNetworkActive,
        reasoning: this._isReasoningActive,
      });

      for await (const text of stream) {
        const messages = [...this.chatContextValue.messages];
        const last = messages[messages.length - 1] as ChatMessage;
        last.content += text;
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
    if (!contextId) {
      return { files: [], docs: [] };
    }

    const docContexts = new Map<
      string,
      { docId: string; docContent: string }
    >();
    const fileContexts = new Map<
      string,
      BlockSuitePresets.AIFileContextOption
    >();

    const { files: matchedFiles = [], docs: matchedDocs = [] } =
      (await AIProvider.context?.matchContext(contextId, userInput)) ?? {};

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
        const fileChip = this.chips.find(
          chip => isFileChip(chip) && chip.fileId === file.fileId
        ) as FileChip | undefined;
        if (fileChip && fileChip.blobId) {
          fileContexts.set(file.fileId, {
            blobId: fileChip.blobId,
            fileName: fileChip.file.name,
            fileType: fileChip.file.type,
            fileContent: file.content,
          });
        }
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

  // TODO: remove this function after workspace embedding is ready
  private _filterContexts(contexts: {
    docs: BlockSuitePresets.AIDocContextOption[];
    files: BlockSuitePresets.AIFileContextOption[];
  }) {
    const docIds = this.chips.reduce((acc, chip) => {
      if (isDocChip(chip)) {
        acc.push(chip.docId);
      }
      if (isTagChip(chip)) {
        const docIds = this.docDisplayConfig.getTagPageIds(chip.tagId);
        acc.push(...docIds);
      }
      if (isCollectionChip(chip)) {
        const docIds = this.docDisplayConfig.getCollectionPageIds(
          chip.collectionId
        );
        acc.push(...docIds);
      }
      return acc;
    }, [] as string[]);

    const fileIds = this.chips.reduce((acc, chip) => {
      if (isFileChip(chip) && chip.blobId) {
        acc.push(chip.blobId);
      }
      return acc;
    }, [] as string[]);

    const { docs, files } = contexts;
    return {
      docs: docs.filter(doc => docIds.includes(doc.docId)),
      files: files.filter(file => fileIds.includes(file.blobId)),
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-input': AIChatInput;
  }
}
