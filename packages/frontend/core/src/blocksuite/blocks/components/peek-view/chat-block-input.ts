import {
  ChatClearIcon,
  ChatSendIcon,
} from '@affine/core/blocksuite/presets/ai/_common/icons';
import { AIProvider } from '@affine/core/blocksuite/presets/ai/provider';
import type { EditorHost } from '@blocksuite/block-std';
import { type ChatMessage } from '@blocksuite/presets';
import { css, html, LitElement } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';

@customElement('chat-block-input')
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
  `;

  override render() {
    return html`<style>
        .chat-panel-send svg rect {
          fill: ${this._isInputEmpty
            ? 'var(--affine-text-disable-color)'
            : 'var(--affine-primary-color)'};
        }

        .chat-panel-input {
          border-color: ${this._focused
            ? 'var(--affine-primary-color)'
            : 'var(--affine-border-color)'};
          box-shadow: ${this._focused ? 'var(--affine-active-shadow)' : 'none'};
        }
      </style>
      <div class="ai-chat-input">
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
        ></textarea>
        <div class="chat-panel-input-actions">
          <div class="chat-history-clear">${ChatClearIcon}</div>
          <div class="chat-panel-send" @click="${this._send}">
            ${ChatSendIcon}
          </div>
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
  accessor updateChatMessages!: (chatMessage: ChatMessage) => void;

  @property({ attribute: false })
  accessor updateCurrentSessionId!: (sessionId: string) => void;

  @property({ attribute: false })
  accessor updateChatBlock!: () => void;

  @property({ attribute: false })
  accessor createChatBlock!: () => void;

  @property({ attribute: false })
  accessor currentChatBlockId: string | null = null;

  @property({ attribute: false })
  accessor currentSessionId: string | null = null;

  @query('textarea')
  accessor textarea!: HTMLTextAreaElement;

  @state()
  accessor _isInputEmpty = true;

  @state()
  accessor _focused = false;

  private readonly _send = async () => {
    const text = this.textarea.value;
    if (!text) {
      return;
    }
    const { doc } = this.host;
    this.textarea.value = '';

    const userInfo = await AIProvider.userInfo;
    this.updateChatMessages({
      id: '',
      content: text,
      role: 'user',
      createdAt: new Date().toISOString(),
      attachments: [],
      userId: userInfo?.id,
      userName: userInfo?.name,
      avatarUrl: userInfo?.avatarUrl ?? undefined,
    });

    let content = '';
    const chatBlockExists = !!this.currentChatBlockId;
    try {
      const abortController = new AbortController();
      // fork session
      let chatSessionId = this.currentSessionId;
      if (!chatSessionId) {
        console.debug(
          'parentSessionId: ',
          this.parentSessionId,
          'latestMessageId: ',
          this.latestMessageId
        );
        const forkSessionId = await AIProvider.forkChat?.({
          workspaceId: doc.collection.id,
          docId: doc.id,
          sessionId: this.parentSessionId,
          latestMessageId: this.latestMessageId,
        });
        if (!forkSessionId) return;
        this.updateCurrentSessionId(forkSessionId);
        chatSessionId = forkSessionId;
      }

      const stream = AIProvider.actions.chat?.({
        sessionId: chatSessionId, // FIXME: should be this._chatSessionId
        input: text,
        docId: doc.id,
        attachments: [],
        workspaceId: doc.collection.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        where: 'chat-panel',
        control: 'chat-send',
      });

      if (stream) {
        for await (const text of stream) {
          content += text;
          this.updateChatMessages({
            id: '',
            content: content,
            role: 'assistant',
            createdAt: new Date().toISOString(),
            attachments: [],
          });
        }
      }
    } catch (error) {
      console.error(error);
    } finally {
      if (content) {
        if (!chatBlockExists) {
          this.createChatBlock();
        }
        // Update new chat block messages if there are contents returned from AI
        this.updateChatBlock();
      }
    }
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-block-input': ChatBlockInput;
  }
}
