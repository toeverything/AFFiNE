import type {
  BlockSelection,
  EditorHost,
  TextSelection,
} from '@blocksuite/block-std';
import { WithDisposable } from '@blocksuite/block-std';
import { type AIError, createButtonPopper, Tooltip } from '@blocksuite/blocks';
import { noop } from '@blocksuite/global/utils';
import { css, html, LitElement, nothing, type PropertyValues } from 'lit';
import { customElement, property, query, state } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { CopyIcon, MoreIcon, RetryIcon } from '../../_common/icons';
import { AIProvider } from '../../provider';
import { copyText } from '../../utils/editor-actions';
import type { ChatContextValue, ChatMessage } from '../chat-context';
import { PageEditorActions } from './actions-handle';

noop(Tooltip);

@customElement('chat-copy-more')
export class ChatCopyMore extends WithDisposable(LitElement) {
  static override styles = css`
    .copy-more {
      display: flex;
      gap: 8px;
      height: 36px;
      justify-content: flex-end;
      align-items: center;
      margin-top: 8px;
      margin-bottom: 12px;

      div {
        cursor: pointer;
        border-radius: 4px;
      }

      div:hover {
        background-color: var(--affine-hover-color);
      }

      svg {
        color: var(--affine-icon-color);
      }
    }

    .more-menu {
      width: 226px;
      border-radius: 8px;
      background-color: var(--affine-background-overlay-panel-color);
      box-shadow: var(--affine-menu-shadow);
      display: flex;
      flex-direction: column;
      gap: 4px;
      position: absolute;
      z-index: 1;
      user-select: none;

      > div {
        height: 30px;
        display: flex;
        gap: 8px;
        align-items: center;
        cursor: pointer;

        svg {
          margin-left: 12px;
        }
      }

      > div:hover {
        background-color: var(--affine-hover-color);
      }
    }
  `;

  @state()
  private accessor _showMoreMenu = false;

  @query('.more-button')
  private accessor _moreButton!: HTMLDivElement;

  @query('.more-menu')
  private accessor _moreMenu!: HTMLDivElement;

  private _morePopper: ReturnType<typeof createButtonPopper> | null = null;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor content!: string;

  @property({ attribute: false })
  accessor isLast!: boolean;

  @property({ attribute: false })
  accessor curTextSelection: TextSelection | undefined = undefined;

  @property({ attribute: false })
  accessor curBlockSelections: BlockSelection[] | undefined = undefined;

  @property({ attribute: false })
  accessor chatContextValue!: ChatContextValue;

  @property({ attribute: false })
  accessor updateContext!: (context: Partial<ChatContextValue>) => void;

  private _toggle() {
    this._morePopper?.toggle();
  }

  private async _retry() {
    const { doc } = this.host;
    try {
      const abortController = new AbortController();

      const items = [...this.chatContextValue.items];
      const last = items[items.length - 1];
      if ('content' in last) {
        last.content = '';
        last.createdAt = new Date().toISOString();
      }
      this.updateContext({ items, status: 'loading', error: null });

      const stream = AIProvider.actions.chat?.({
        retry: true,
        docId: doc.id,
        workspaceId: doc.collection.id,
        host: this.host,
        stream: true,
        signal: abortController.signal,
        where: 'chat-panel',
        control: 'chat-send',
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
      }
    } catch (error) {
      this.updateContext({ status: 'error', error: error as AIError });
    } finally {
      this.updateContext({ abortController: null });
    }
  }

  protected override updated(changed: PropertyValues): void {
    if (changed.has('isLast')) {
      if (this.isLast) {
        this._morePopper?.dispose();
        this._morePopper = null;
      } else if (!this._morePopper) {
        this._morePopper = createButtonPopper(
          this._moreButton,
          this._moreMenu,
          ({ display }) => (this._showMoreMenu = display === 'show'),
          {
            mainAxis: 0,
            crossAxis: -100,
          }
        );
      }
    }
  }

  override render() {
    const { host, content, isLast } = this;
    return html`<style>
        .more-menu {
          padding: ${this._showMoreMenu ? '8px' : '0px'};
        }
      </style>
      <div class="copy-more">
        ${content
          ? html`<div @click=${() => copyText(host, content)}>
              ${CopyIcon}
              <affine-tooltip>Copy</affine-tooltip>
            </div>`
          : nothing}
        ${isLast
          ? html`<div @click=${() => this._retry()}>
              ${RetryIcon}
              <affine-tooltip>Retry</affine-tooltip>
            </div>`
          : nothing}
        ${isLast
          ? nothing
          : html`<div class="more-button" @click=${this._toggle}>
              ${MoreIcon}
            </div> `}
      </div>

      <div class="more-menu">
        ${this._showMoreMenu
          ? repeat(
              PageEditorActions,
              action => action.title,
              action => {
                return html`<div
                  @click=${() =>
                    action.handler(
                      host,
                      content,
                      this.curTextSelection,
                      this.curBlockSelections
                    )}
                >
                  ${action.icon}
                  <div>${action.title}</div>
                </div>`;
              }
            )
          : nothing}
      </div>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'chat-copy-more': ChatCopyMore;
  }
}
