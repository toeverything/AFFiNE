import type { EditorHost } from '@blocksuite/affine/block-std';
import { type AIError, openFileOrFiles } from '@blocksuite/affine/blocks';
import type { ChatMessage } from '@toeverything/infra';
import { css, html, LitElement, nothing } from 'lit';
import { property, query, state } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { repeat } from 'lit/directives/repeat.js';

import {
  ChatAbortIcon,
  ChatClearIcon,
  ChatSendIcon,
  CloseIcon,
  ImageIcon,
} from '../_common/icons';
import { AIProvider } from '../provider';
import { reportResponse } from '../utils/action-reporter';
import { readBlobAsURL } from '../utils/image';
import type { ChatContext } from './types';

const MaximumImageCount = 8;

export class ChatBlockInput extends LitElement {
  static override styles = css`
    :host {
      width: 100%;
    }
    .ai-chat-input {
      display: flex;
      width: 100%;
      min-height: 100px;
      max-height: 206px;
      padding: 8px 12px;
      box-sizing: border-box;
      border: 1px solid var(--affine-border-color);
      border-radius: 4px;
      flex-direction: column;
      justify-content: space-between;
      gap: 12px;
      position: relative;
      background-color: var(--affine-white-10);
    }
    .ai-chat-input {
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
        user-select: none;
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
    .chat-input-images {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      position: relative;
      .image-container {
        width: 58px;
        height: 58px;
        border-radius: 4px;
        border: 1px solid var(--affine-border-color);
        cursor: pointer;
        overflow: hidden;
        position: relative;
        display: flex;
        justify-content: center;
        align-items: center;
        img {
          max-width: 100%;
          max-height: 100%;
          width: auto;
          height: auto;
        }
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

    .close-wrapper {
      width: 16px;
      height: 16px;
      border-radius: 4px;
      border: 1px solid var(--affine-border-color);
      justify-content: center;
      align-items: center;
      display: none;
      position: absolute;
      background-color: var(--affine-white);
      z-index: 1;
      cursor: pointer;
    }
    .close-wrapper:hover {
      background-color: var(--affine-background-error-color);
      border: 1px solid var(--affine-error-color);
    }
    .close-wrapper:hover svg path {
      fill: var(--affine-error-color);
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
    }

    .chat-history-clear.disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
  `;

  override render() {
    const { images, status, messages } = this.chatContext;
    const hasImages = images.length > 0;
    const maxHeight = hasImages ? 272 + 2 : 200 + 2;
    const disableCleanUp =
      status === 'loading' || status === 'transmitting' || !messages.length;
    const cleanButtonClasses = classMap({
      'chat-history-clear': true,
      disabled: disableCleanUp,
    });

    return html`<style>
        .chat-panel-input {
          border-color: ${this._focused
            ? 'var(--affine-primary-color)'
            : 'var(--affine-border-color)'};
          box-shadow: ${this._focused ? 'var(--affine-active-shadow)' : 'none'};
          max-height: ${maxHeight}px;
          user-select: none;
        }
      </style>
      <div class="ai-chat-input">
        ${hasImages ? this._renderImages(images) : nothing}
        <textarea
          rows="1"
          placeholder="What are your thoughts?"
          @keydown=${async (evt: KeyboardEvent) => {
            if (evt.key === 'Enter' && !evt.shiftKey && !evt.isComposing) {
              evt.preventDefault();
              await this._send();
            }
          }}
          @input=${() => {
            const { textarea } = this;
            this._isInputEmpty = !textarea.value.trim();
            textarea.style.height = 'auto';
            textarea.style.height = textarea.scrollHeight + 'px';
            if (this.scrollHeight >= 202) {
              textarea.style.height = '168px';
              textarea.style.overflowY = 'scroll';
            }
          }}
          @focus=${() => {
            this._focused = true;
          }}
          @blur=${() => {
            this._focused = false;
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
        ></textarea>
        <div class="chat-panel-input-actions">
          <div
            class=${cleanButtonClasses}
            @click=${async () => {
              if (disableCleanUp) {
                return;
              }
              await this.cleanupHistories();
            }}
          >
            ${ChatClearIcon}
          </div>
          ${images.length < MaximumImageCount
            ? html`<div
                class="image-upload"
                @click=${async () => {
                  const images = await openFileOrFiles({
                    acceptType: 'Images',
                    multiple: true,
                  });
                  if (!images) return;
                  this._addImages(images);
                }}
              >
                ${ImageIcon}
              </div>`
            : nothing}
          ${status === 'transmitting'
            ? html`<div
                @click=${() => {
                  this.chatContext.abortController?.abort();
                  this.updateContext({ status: 'success' });
                  reportResponse('aborted:stop');
                }}
              >
                ${ChatAbortIcon}
              </div>`
            : html`<div
                @click="${this._send}"
                class="chat-panel-send"
                aria-disabled=${this._isInputEmpty}
              >
                ${ChatSendIcon}
              </div>`}
        </div>
      </div>`;
  }

  @property({ attribute: false })
  accessor parentSessionId!: string;

  @property({ attribute: false })
  accessor latestMessageId!: string;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor updateChatBlock!: () => Promise<void>;

  @property({ attribute: false })
  accessor createChatBlock!: () => Promise<void>;

  @property({ attribute: false })
  accessor cleanupHistories!: () => Promise<void>;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContext>) => void;

  @property({ attribute: false })
  accessor chatContext!: ChatContext;

  @query('textarea')
  accessor textarea!: HTMLTextAreaElement;

  @state()
  accessor _isInputEmpty = true;

  @state()
  accessor _focused = false;

  @query('.close-wrapper')
  accessor closeWrapper: HTMLDivElement | null = null;

  @state()
  accessor _curIndex = -1;

  private readonly _addImages = (images: File[]) => {
    const oldImages = this.chatContext.images;
    this.updateContext({
      images: [...oldImages, ...images].slice(0, MaximumImageCount),
    });
  };

  private _renderImages(images: File[]) {
    return html`
      <div
        class="chat-input-images"
        @mouseleave=${() => {
          if (!this.closeWrapper) return;
          this.closeWrapper.style.display = 'none';
          this._curIndex = -1;
        }}
      >
        ${repeat(
          images,
          image => image.name,
          (image, index) =>
            html`<div
              class="image-container"
              @mouseenter=${(evt: MouseEvent) => {
                const ele = evt.target as HTMLImageElement;
                const rect = ele.getBoundingClientRect();
                if (!ele.parentElement) return;
                const parentRect = ele.parentElement.getBoundingClientRect();
                const left = Math.abs(rect.right - parentRect.left) - 8;
                const top = Math.abs(parentRect.top - rect.top) - 8;
                this._curIndex = index;
                if (!this.closeWrapper) return;
                this.closeWrapper.style.display = 'flex';
                this.closeWrapper.style.left = left + 'px';
                this.closeWrapper.style.top = top + 'px';
              }}
            >
              <img src="${URL.createObjectURL(image)}" alt="${image.name}" />
            </div>`
        )}
        <div
          class="close-wrapper"
          @click=${() => {
            if (this._curIndex >= 0 && this._curIndex < images.length) {
              const newImages = [...images];
              newImages.splice(this._curIndex, 1);
              this.updateContext({ images: newImages });
              this._curIndex = -1;
              if (!this.closeWrapper) return;
              this.closeWrapper.style.display = 'none';
            }
          }}
        >
          ${CloseIcon}
        </div>
      </div>
    `;
  }

  private readonly _send = async () => {
    const { images, status } = this.chatContext;
    if (status === 'loading' || status === 'transmitting') return;

    const text = this.textarea.value;
    if (!text && !images.length) {
      return;
    }

    const { doc } = this.host;
    this.textarea.value = '';
    this._isInputEmpty = true;
    this.textarea.style.height = 'unset';
    this.updateContext({
      images: [],
      status: 'loading',
      error: null,
    });

    const attachments = await Promise.all(
      images?.map(image => readBlobAsURL(image))
    );

    const userInfo = await AIProvider.userInfo;
    this.updateContext({
      messages: [
        ...this.chatContext.messages,
        {
          id: '',
          content: text,
          role: 'user',
          createdAt: new Date().toISOString(),
          attachments,
          userId: userInfo?.id,
          userName: userInfo?.name,
          avatarUrl: userInfo?.avatarUrl ?? undefined,
        },
        {
          id: '',
          content: '',
          role: 'assistant',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    const { currentChatBlockId, currentSessionId } = this.chatContext;
    let content = '';
    const chatBlockExists = !!currentChatBlockId;
    try {
      // If has not forked a chat session, fork a new one
      let chatSessionId = currentSessionId;
      if (!chatSessionId) {
        const forkSessionId = await AIProvider.forkChat?.({
          workspaceId: doc.collection.id,
          docId: doc.id,
          sessionId: this.parentSessionId,
          latestMessageId: this.latestMessageId,
        });
        if (!forkSessionId) return;
        this.updateContext({
          currentSessionId: forkSessionId,
        });
        chatSessionId = forkSessionId;
      }

      const abortController = new AbortController();
      const stream = AIProvider.actions.chat?.({
        input: text,
        sessionId: chatSessionId,
        docId: doc.id,
        attachments: images,
        workspaceId: doc.collection.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        where: 'ai-chat-block',
        control: 'chat-send',
      });

      if (stream) {
        this.updateContext({
          abortController,
        });

        for await (const text of stream) {
          const messages = [...this.chatContext.messages];
          const last = messages[messages.length - 1] as ChatMessage;
          last.content += text;
          this.updateContext({ messages, status: 'transmitting' });
          content += text;
        }

        this.updateContext({ status: 'success' });
      }
    } catch (error) {
      console.error(error);
      this.updateContext({ status: 'error', error: error as AIError });
    } finally {
      if (content) {
        if (!chatBlockExists) {
          await this.createChatBlock();
        }
        // Update new chat block messages if there are contents returned from AI
        await this.updateChatBlock();
      }

      this.updateContext({ abortController: null });
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-block-input': ChatBlockInput;
  }
}
