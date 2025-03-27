import { stopPropagation } from '@affine/core/utils';
import type { EditorHost } from '@blocksuite/affine/block-std';
import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { openFileOrFiles } from '@blocksuite/affine/shared/utils';
import {
  BroomIcon,
  CloseIcon,
  ImageIcon,
  PublishIcon,
} from '@blocksuite/icons/lit';
import { css, html, LitElement, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { ChatAbortIcon, ChatSendIcon } from '../_common/icons';
import type { AIError } from '../components/ai-item/types';
import { AIProvider } from '../provider';
import { reportResponse } from '../utils/action-reporter';
import { readBlobAsURL } from '../utils/image';
import type { AINetworkSearchConfig } from './chat-config';
import type {
  ChatContextValue,
  ChatMessage,
  DocContext,
  FileChip,
  FileContext,
} from './chat-context';
import { isDocChip, isFileChip } from './components/utils';
import { PROMPT_NAME_AFFINE_AI, PROMPT_NAME_NETWORK_SEARCH } from './const';

const MaximumImageCount = 32;

function getFirstTwoLines(text: string) {
  const lines = text.split('\n');
  return lines.slice(0, 2);
}

export class ChatPanelInput extends SignalWatcher(WithDisposable(LitElement)) {
  static override styles = css`
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

      div {
        width: 24px;
        height: 24px;
        cursor: pointer;
      }

      div:nth-child(2) {
        margin-left: auto;
      }

      .image-upload,
      .chat-history-clear,
      .chat-network-search {
        display: flex;
        justify-content: center;
        align-items: center;
        svg {
          width: 20px;
          height: 20px;
          color: ${unsafeCSSVarV2('icon/primary')};
        }
      }
      .chat-history-clear svg {
        color: var(--affine-text-secondary-color);
      }
      .chat-network-search[data-active='true'] svg {
        color: ${unsafeCSSVarV2('icon/activated')};
      }

      .image-upload[aria-disabled='true'],
      .chat-network-search[aria-disabled='true'] {
        cursor: not-allowed;
      }
      .image-upload[aria-disabled='true'] svg,
      .chat-network-search[aria-disabled='true'] svg {
        color: var(--affine-text-disable-color) !important;
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
  accessor chatContextValue!: ChatContextValue;

  @property({ attribute: false })
  accessor getSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor getContextId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContextValue>) => void;

  @property({ attribute: false })
  accessor cleanupHistories!: () => Promise<void>;

  @property({ attribute: false })
  accessor networkSearchConfig!: AINetworkSearchConfig;

  private get _isNetworkActive() {
    return (
      !!this.networkSearchConfig.visible.value &&
      !!this.networkSearchConfig.enabled.value
    );
  }

  private get _isNetworkDisabled() {
    return (
      !!this.chatContextValue.images.length ||
      !!this.chatContextValue.chips.filter(chip => chip.state === 'finished')
        .length
    );
  }

  private _getPromptName() {
    if (this._isNetworkDisabled) {
      return PROMPT_NAME_AFFINE_AI;
    }
    return this._isNetworkActive
      ? PROMPT_NAME_NETWORK_SEARCH
      : PROMPT_NAME_AFFINE_AI;
  }

  private async _updatePromptName(promptName: string) {
    const sessionId = await this.getSessionId();
    if (sessionId && AIProvider.session) {
      await AIProvider.session.updateSession(sessionId, promptName);
    }
  }

  private _addImages(images: File[]) {
    const oldImages = this.chatContextValue.images;
    this.updateContext({
      images: [...oldImages, ...images].slice(0, MaximumImageCount),
    });
  }

  private readonly _handleImageRemove = (index: number) => {
    const oldImages = this.chatContextValue.images;
    const newImages = oldImages.filter((_, i) => i !== index);
    this.updateContext({ images: newImages });
  };

  private readonly _toggleNetworkSearch = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const enable = this.networkSearchConfig.enabled.value;
    this.networkSearchConfig.setEnabled(!enable);
  };

  private readonly _uploadImageFiles = async (_e: MouseEvent) => {
    const images = await openFileOrFiles({
      acceptType: 'Images',
      multiple: true,
    });
    if (!images) return;
    this._addImages(images);
  };

  override connectedCallback() {
    super.connectedCallback();

    this._disposables.add(
      AIProvider.slots.requestSendWithChat.subscribe(
        ({ input, context, host }) => {
          if (this.host === host) {
            context && this.updateContext(context);
            const { updateComplete, send } = this;
            updateComplete
              .then(() => {
                return send(input);
              })
              .catch(console.error);
          }
        }
      )
    );
  }

  protected override render() {
    const { images, status } = this.chatContextValue;
    const hasImages = images.length > 0;
    const maxHeight = hasImages ? 272 + 2 : 200 + 2;
    const uploadDisabled = this._isNetworkActive && !this._isNetworkDisabled;
    return html`<style>
        .chat-panel-input {
          border-color: ${this.focused
            ? 'var(--affine-primary-color)'
            : 'var(--affine-border-color)'};
          box-shadow: ${this.focused ? 'var(--affine-active-shadow)' : 'none'};
          max-height: ${maxHeight}px !important;
          user-select: none;
        }
      </style>
      <div
        class="chat-panel-input"
        @pointerdown=${(e: MouseEvent) => {
          if (e.target !== this.textarea) {
            // by default the div will be focused and will blur the textarea
            e.preventDefault();
            this.textarea.focus();
          }
        }}
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
          ? html`<div class="chat-selection-quote">
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
          @input=${() => {
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
          }}
          @keydown=${async (evt: KeyboardEvent) => {
            if (evt.key === 'Enter' && !evt.shiftKey && !evt.isComposing) {
              await this._onTextareaSend(evt);
            }
          }}
          @focus=${() => {
            this.focused = true;
          }}
          @blur=${() => {
            this.focused = false;
          }}
          @paste=${(event: ClipboardEvent) => {
            const items = event.clipboardData?.items;
            if (!items) return;

            for (const index in items) {
              const item = items[index];
              if (item.kind === 'file' && item.type.indexOf('image') >= 0) {
                const blob = item.getAsFile();
                if (!blob) continue;
                this._addImages([blob]);
              }
            }
          }}
          data-testid="chat-panel-input"
        ></textarea>
        <div class="chat-panel-input-actions">
          <div
            class="chat-history-clear"
            @click=${async () => {
              await this.cleanupHistories();
            }}
            data-testid="chat-panel-clear"
          >
            ${BroomIcon()}
          </div>
          ${this.networkSearchConfig.visible.value
            ? html`
                <div
                  class="chat-network-search"
                  data-testid="chat-network-search"
                  aria-disabled=${this._isNetworkDisabled}
                  data-active=${this._isNetworkActive}
                  @click=${this._isNetworkDisabled
                    ? undefined
                    : this._toggleNetworkSearch}
                  @pointerdown=${stopPropagation}
                >
                  ${PublishIcon()}
                </div>
              `
            : nothing}
          ${images.length < MaximumImageCount
            ? html`<div
                class="image-upload"
                aria-disabled=${uploadDisabled}
                @click=${uploadDisabled ? undefined : this._uploadImageFiles}
              >
                ${ImageIcon()}
              </div>`
            : nothing}
          ${status === 'transmitting'
            ? html`<div
                @click=${() => {
                  this.chatContextValue.abortController?.abort();
                  this.updateContext({ status: 'success' });
                  reportResponse('aborted:stop');
                }}
              >
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
    const { status, markdown, images } = this.chatContextValue;
    if (status === 'loading' || status === 'transmitting') return;
    if (!text) return;

    try {
      const { doc } = this.host;
      const promptName = this._getPromptName();

      this.updateContext({
        images: [],
        status: 'loading',
        error: null,
        quote: '',
        markdown: '',
      });

      const attachments = await Promise.all(
        images?.map(image => readBlobAsURL(image))
      );

      const userInput = (markdown ? `${markdown}\n` : '') + text;
      this.updateContext({
        items: [
          ...this.chatContextValue.items,
          {
            id: '',
            role: 'user',
            content: userInput,
            createdAt: new Date().toISOString(),
            attachments,
          },
          {
            id: '',
            role: 'assistant',
            content: '',
            createdAt: new Date().toISOString(),
          },
        ],
      });

      // must update prompt name after local chat message is updated
      // otherwise, the unauthorized error can not be rendered properly
      await this._updatePromptName(promptName);

      const abortController = new AbortController();
      const sessionId = await this.getSessionId();

      const contexts = await this._getMatchedContexts(userInput);
      const stream = AIProvider.actions.chat?.({
        sessionId,
        input: userInput,
        contexts,
        docId: doc.id,
        attachments: images,
        workspaceId: doc.workspace.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        where: 'chat-panel',
        control: 'chat-send',
        isRootSession: true,
      });

      if (stream) {
        this.updateContext({ abortController });

        for await (const text of stream) {
          const items = [...this.chatContextValue.items];
          const last = items[items.length - 1] as ChatMessage;
          last.content += text;
          this.updateContext({ items, status: 'transmitting' });
        }

        this.updateContext({ status: 'success' });

        const { items } = this.chatContextValue;
        const last = items[items.length - 1] as ChatMessage;
        if (!last.id) {
          const historyIds = await AIProvider.histories?.ids(
            doc.workspace.id,
            doc.id,
            { sessionId }
          );
          if (!historyIds || !historyIds[0]) return;
          last.id = historyIds[0].messages.at(-1)?.id ?? '';
        }
      }
    } catch (error) {
      this.updateContext({ status: 'error', error: error as AIError });
    } finally {
      this.updateContext({ abortController: null });
    }
  };

  private async _getMatchedContexts(userInput: string) {
    const contextId = await this.getContextId();
    if (!contextId) {
      return { files: [], docs: [] };
    }

    const docContexts = new Map<string, DocContext>();
    const fileContexts = new Map<string, FileContext>();

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
        const fileChip = this.chatContextValue.chips.find(
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

    this.chatContextValue.chips.forEach(chip => {
      if (isDocChip(chip) && !!chip.markdown?.value) {
        docContexts.set(chip.docId, {
          docId: chip.docId,
          docContent: chip.markdown.value,
        });
      }
    });

    return {
      docs: Array.from(docContexts.values()),
      files: Array.from(fileContexts.values()),
    };
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-panel-input': ChatPanelInput;
  }
}
