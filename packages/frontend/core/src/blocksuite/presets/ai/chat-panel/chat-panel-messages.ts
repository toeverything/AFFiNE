import '../messages/slides-renderer';
import './ai-loading';
import '../messages/text';
import './actions/text';
import './actions/action-wrapper';
import './actions/make-real';
import './actions/slides';
import './actions/mindmap';
import './actions/chat-text';
import './actions/copy-more';
import './actions/image-to-text';
import './actions/image';
import './chat-cards';

import type {
  BaseSelection,
  BlockSelection,
  EditorHost,
  TextSelection,
} from '@blocksuite/block-std';
import { ShadowlessElement, WithDisposable } from '@blocksuite/block-std';
import type { ImageSelection } from '@blocksuite/blocks';
import {
  isInsidePageEditor,
  PaymentRequiredError,
  UnauthorizedError,
} from '@blocksuite/blocks';
import { css, html, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';

import { AffineAvatarIcon, AffineIcon, DownArrowIcon } from '../_common/icons';
import {
  GeneralErrorRenderer,
  PaymentRequiredErrorRenderer,
} from '../messages/error';
import { AIProvider } from '../provider';
import { insertBelow } from '../utils/editor-actions';
import {
  EdgelessEditorActions,
  PageEditorActions,
} from './actions/actions-handle';
import type { ChatContextValue, ChatItem, ChatMessage } from './chat-context';
import { HISTORY_IMAGE_ACTIONS } from './const';

@customElement('chat-panel-messages')
export class ChatPanelMessages extends WithDisposable(ShadowlessElement) {
  private get _currentTextSelection(): TextSelection | undefined {
    return this._selectionValue.find(v => v.type === 'text') as TextSelection;
  }

  private get _currentBlockSelections(): BlockSelection[] | undefined {
    return this._selectionValue.filter(v => v.type === 'block');
  }

  private get _currentImageSelections(): ImageSelection[] | undefined {
    return this._selectionValue.filter(v => v.type === 'image');
  }

  static override styles = css`
    chat-panel-messages {
      position: relative;
    }

    .chat-panel-messages {
      display: flex;
      flex-direction: column;
      gap: 24px;
      height: 100%;
      position: relative;
      overflow-y: auto;

      chat-cards {
        position: absolute;
        bottom: 0;
        width: 100%;
      }
    }

    .chat-panel-messages-placeholder {
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

    .item-wrapper {
      margin-left: 32px;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 4px;
      color: var(--affine-text-primary-color);
      font-size: 14px;
      font-weight: 500;
      user-select: none;
    }

    .avatar-container {
      width: 24px;
      height: 24px;
    }

    .avatar {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      background-color: var(--affine-primary-color);
    }

    .avatar-container img {
      width: 100%;
      height: 100%;
      border-radius: 50%;
      object-fit: cover;
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

  private _selectionValue: BaseSelection[] = [];

  @state()
  accessor showDownIndicator = false;

  @state()
  accessor avatarUrl = '';

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor isLoading!: boolean;

  @property({ attribute: false })
  accessor chatContextValue!: ChatContextValue;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContextValue>) => void;

  @query('.chat-panel-messages')
  accessor messagesContainer!: HTMLDivElement;

  protected override updated(_changedProperties: PropertyValues) {
    if (_changedProperties.has('host')) {
      const { disposables } = this;

      disposables.add(
        this.host.selection.slots.changed.on(() => {
          this._selectionValue = this.host.selection.value;
          this.requestUpdate();
        })
      );
      const { docModeService } = this.host.spec.getService('affine:page');
      disposables.add(docModeService.onModeChange(() => this.requestUpdate()));
    }
  }

  protected override render() {
    const { items } = this.chatContextValue;
    const { isLoading } = this;
    const filteredItems = items.filter(item => {
      return (
        'role' in item ||
        item.messages?.length === 3 ||
        (HISTORY_IMAGE_ACTIONS.includes(item.action) &&
          item.messages?.length === 2)
      );
    });

    return html`<style>
        .chat-panel-messages-placeholder div {
          color: ${isLoading
            ? 'var(--affine-text-secondary-color)'
            : 'var(--affine-text-primary-color)'};
          font-size: ${isLoading ? 'var(--affine-font-sm)' : '18px'};
          font-weight: 600;
        }
      </style>

      <div
        class="chat-panel-messages"
        @scroll=${(evt: Event) => {
          const element = evt.target as HTMLDivElement;
          this.showDownIndicator =
            element.scrollHeight - element.scrollTop - element.clientHeight >
            200;
        }}
      >
        ${items.length === 0
          ? html`<div class="chat-panel-messages-placeholder">
                ${AffineIcon(
                  isLoading
                    ? 'var(--affine-icon-secondary)'
                    : 'var(--affine-primary-color)'
                )}
                <div>
                  ${this.isLoading
                    ? 'AFFiNE AI is loading history...'
                    : 'What can I help you with?'}
                </div>
              </div>
              <chat-cards
                .chatContextValue=${this.chatContextValue}
                .updateContext=${this.updateContext}
                .host=${this.host}
                .selectionValue=${this._selectionValue}
              ></chat-cards> `
          : repeat(filteredItems, (item, index) => {
              const isLast = index === filteredItems.length - 1;
              return html`<div class="message">
                ${this.renderAvatar(item)}
                <div class="item-wrapper">${this.renderItem(item, isLast)}</div>
              </div>`;
            })}
      </div>
      ${this.showDownIndicator
        ? html`<div class="down-indicator" @click=${() => this.scrollToDown()}>
            ${DownArrowIcon}
          </div>`
        : nothing} `;
  }

  override async connectedCallback() {
    super.connectedCallback();

    const res = await AIProvider.userInfo;
    this.avatarUrl = res?.avatarUrl ?? '';
    this.disposables.add(
      AIProvider.slots.userInfo.on(userInfo => {
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
  }

  renderError() {
    const { error } = this.chatContextValue;

    if (error instanceof PaymentRequiredError) {
      return PaymentRequiredErrorRenderer(this.host);
    } else if (error instanceof UnauthorizedError) {
      return GeneralErrorRenderer(
        html`You need to login to AFFiNE Cloud to continue using AFFiNE AI.`,
        html`<div
          style=${styleMap({
            padding: '4px 12px',
            borderRadius: '8px',
            border: '1px solid var(--affine-border-color)',
            cursor: 'pointer',
            backgroundColor: 'var(--affine-hover-color)',
          })}
          @click=${() =>
            AIProvider.slots.requestLogin.emit({ host: this.host })}
        >
          Login
        </div>`
      );
    } else {
      return GeneralErrorRenderer();
    }
  }

  renderItem(item: ChatItem, isLast: boolean) {
    const { status, error } = this.chatContextValue;

    if (isLast && status === 'loading') {
      return this.renderLoading();
    }

    if (
      isLast &&
      status === 'error' &&
      (error instanceof PaymentRequiredError ||
        error instanceof UnauthorizedError)
    ) {
      return this.renderError();
    }

    if ('role' in item) {
      const state = isLast
        ? status !== 'loading' && status !== 'transmitting'
          ? 'finished'
          : 'generating'
        : 'finished';
      return html`<chat-text
          .host=${this.host}
          .attachments=${item.attachments}
          .text=${item.content}
          .state=${state}
        ></chat-text>
        ${isLast && status === 'error' ? this.renderError() : nothing}
        ${this.renderEditorActions(item, isLast)}`;
    } else {
      switch (item.action) {
        case 'Create a presentation':
          return html`<action-slides
            .host=${this.host}
            .item=${item}
          ></action-slides>`;
        case 'Make it real':
          return html`<action-make-real
            .host=${this.host}
            .item=${item}
          ></action-make-real>`;
        case 'Brainstorm mindmap':
          return html`<action-mindmap
            .host=${this.host}
            .item=${item}
          ></action-mindmap>`;
        case 'Explain this image':
        case 'Generate a caption':
          return html`<action-image-to-text
            .host=${this.host}
            .item=${item}
          ></action-image-to-text>`;
        default:
          if (HISTORY_IMAGE_ACTIONS.includes(item.action)) {
            return html`<action-image
              .host=${this.host}
              .item=${item}
            ></action-image>`;
          }

          return html`<action-text
            .item=${item}
            .host=${this.host}
            .isCode=${item.action === 'Explain this code' ||
            item.action === 'Check code error'}
          ></action-text>`;
      }
    }
  }

  renderAvatar(item: ChatItem) {
    const isUser = 'role' in item && item.role === 'user';

    return html`<div class="user-info">
      ${isUser
        ? html`<div class="avatar-container">
            ${this.avatarUrl
              ? html`<img .src=${this.avatarUrl} />`
              : html`<div class="avatar"></div>`}
          </div>`
        : AffineAvatarIcon}
      ${isUser ? 'You' : 'AFFINE AI'}
    </div>`;
  }

  renderLoading() {
    return html` <ai-loading></ai-loading>`;
  }

  scrollToDown() {
    this.messagesContainer.scrollTo(0, this.messagesContainer.scrollHeight);
  }

  renderEditorActions(item: ChatMessage, isLast: boolean) {
    const { status } = this.chatContextValue;

    if (item.role !== 'assistant') return nothing;

    if (
      isLast &&
      status !== 'success' &&
      status !== 'idle' &&
      status !== 'error'
    )
      return nothing;

    const { host } = this;
    const { content } = item;
    const actions = isInsidePageEditor(host)
      ? PageEditorActions
      : EdgelessEditorActions;

    return html`
      <style>
        .actions-container {
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
          margin-top: 8px;
        }

        .actions-container > div {
          display: flex;
          gap: 8px;
        }

        .action {
          width: fit-content;
          height: 32px;
          padding: 12px;
          border-radius: 8px;
          border: 1px solid var(--affine-border-color);
          background-color: var(--affine-white-10);
          display: flex;
          flex-direction: row;
          align-items: center;
          gap: 4px;
          font-size: 15px;
          font-weight: 500;
          color: var(--affine-text-primary-color);
          cursor: pointer;
          user-select: none;
        }

        .action svg {
          color: var(--affine-icon-color);
        }
      </style>
      <chat-copy-more
        .host=${host}
        .content=${content}
        .isLast=${isLast}
        .curTextSelection=${this._currentTextSelection}
        .curBlockSelections=${this._currentBlockSelections}
        .chatContextValue=${this.chatContextValue}
        .updateContext=${this.updateContext}
      ></chat-copy-more>
      ${isLast
        ? html`<div class="actions-container">
            ${repeat(
              actions.filter(action => {
                if (!content) return false;

                if (
                  action.title === 'Replace selection' &&
                  (!this._currentTextSelection ||
                    this._currentTextSelection.from.length === 0) &&
                  this._currentBlockSelections?.length === 0
                ) {
                  return false;
                }
                return true;
              }),
              action => action.title,
              action => {
                return html`<div class="action">
                  ${action.icon}
                  <div
                    @click=${async () => {
                      if (
                        action.title === 'Insert below' &&
                        this._selectionValue.length === 1 &&
                        this._selectionValue[0].type === 'database'
                      ) {
                        const element = this.host.view.getBlock(
                          this._selectionValue[0].blockId
                        );
                        if (!element) return;
                        await insertBelow(host, content, element);
                        return;
                      }

                      await action.handler(
                        host,
                        content,
                        this._currentTextSelection,
                        this._currentBlockSelections,
                        this._currentImageSelections
                      );
                    }}
                  >
                    ${action.title}
                  </div>
                </div>`;
              }
            )}
          </div>`
        : nothing}
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-panel-messages': ChatPanelMessages;
  }
}
