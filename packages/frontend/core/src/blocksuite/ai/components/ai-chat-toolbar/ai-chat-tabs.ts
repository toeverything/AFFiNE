import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { CloseIcon } from '@blocksuite/icons/lit';
import { css, html, type PropertyValues } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

const DEFAULT_TAB_TITLE = 'New chat';
const TITLE_MAX_LENGTH = 28;

function truncate(text: string): string {
  if (text.length <= TITLE_MAX_LENGTH) return text;
  return `${text.slice(0, TITLE_MAX_LENGTH).trimEnd()}…`;
}

function deriveTabTitle(session: CopilotChatHistoryFragment): string {
  const explicit = session.title?.trim();
  if (explicit) return truncate(explicit);
  const firstUserMessage = session.messages?.find(m => m.role === 'user');
  const raw = firstUserMessage?.content?.trim();
  if (!raw) return DEFAULT_TAB_TITLE;
  const newlineIdx = raw.indexOf('\n');
  return truncate(newlineIdx === -1 ? raw : raw.slice(0, newlineIdx));
}

export class AIChatTabs extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor sessions: CopilotChatHistoryFragment[] = [];

  @property({ attribute: false })
  accessor activeSessionId: string | undefined;

  @property({ attribute: false })
  accessor showDraftTab = false;

  @property({ attribute: false })
  accessor onSelectTab!: (sessionId: string) => void;

  @property({ attribute: false })
  accessor onCloseTab!: (sessionId: string) => void;

  static override styles = css`
    ai-chat-tabs {
      display: flex;
      align-items: center;
      width: 100%;
      min-width: 0;
      height: 100%;
      overflow: hidden;
    }

    .ai-chat-tabs {
      display: flex;
      align-items: center;
      gap: 4px;
      width: 100%;
      min-width: 0;
      height: 100%;
    }

    .tabs-scroll {
      display: flex;
      align-items: center;
      gap: 4px;
      flex: 1;
      min-width: 0;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tabs-scroll::-webkit-scrollbar {
      display: none;
    }

    .tab {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
      max-width: 180px;
      height: 26px;
      padding: 0 6px 0 10px;
      border-radius: 6px;
      cursor: pointer;
      color: ${unsafeCSSVarV2('text/secondary')};
      font-size: 12px;
      font-weight: 500;
      user-select: none;
      transition: background-color 0.15s ease;
    }

    .tab:hover {
      background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
      color: ${unsafeCSSVarV2('text/primary')};
    }

    .tab[data-active='true'] {
      background-color: ${unsafeCSSVarV2('layer/background/secondary')};
      color: ${unsafeCSSVarV2('text/primary')};
    }

    .tab-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      min-width: 0;
    }

    .tab-close {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      border: none;
      padding: 0;
      border-radius: 3px;
      background: transparent;
      color: inherit;
      cursor: pointer;
      opacity: 0.6;
    }
    .tab-close:hover {
      opacity: 1;
      background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }
    .tab-close svg {
      width: 12px;
      height: 12px;
    }
  `;

  override render() {
    if (!this.sessions.length && !this.showDraftTab) return html``;
    return html`
      <div class="ai-chat-tabs" data-testid="ai-chat-tabs">
        <div class="tabs-scroll" @wheel=${this._handleWheel}>
          ${this.showDraftTab ? this._renderDraftTab() : null}
          ${repeat(
            this.sessions,
            session => session.sessionId,
            session => this._renderTab(session)
          )}
        </div>
      </div>
    `;
  }

  private readonly _handleWheel = (e: WheelEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollWidth <= el.clientWidth) return;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    }
  };

  private _renderTab(session: CopilotChatHistoryFragment) {
    const active = session.sessionId === this.activeSessionId;
    const title = deriveTabTitle(session);
    return html`
      <div
        class="tab"
        data-active=${active}
        data-session-id=${session.sessionId}
        data-testid="ai-chat-tab"
        title=${title}
        @click=${() => this._handleSelect(session.sessionId)}
      >
        <span class="tab-title">${title}</span>
        <button
          class="tab-close"
          data-testid="ai-chat-tab-close"
          aria-label="Close tab"
          @click=${(e: Event) => this._handleClose(e, session.sessionId)}
        >
          ${CloseIcon()}
        </button>
      </div>
    `;
  }

  private _renderDraftTab() {
    return html`
      <div
        class="tab"
        data-active="true"
        data-testid="ai-chat-draft-tab"
        title=${DEFAULT_TAB_TITLE}
      >
        <span class="tab-title">${DEFAULT_TAB_TITLE}</span>
      </div>
    `;
  }

  private readonly _handleSelect = (sessionId: string) => {
    if (sessionId === this.activeSessionId) return;
    this.onSelectTab(sessionId);
  };

  private readonly _handleClose = (e: Event, sessionId: string) => {
    e.stopPropagation();
    this.onCloseTab(sessionId);
  };

  override updated(changedProps: PropertyValues) {
    super.updated(changedProps);
    if (
      (changedProps.has('activeSessionId') || changedProps.has('sessions')) &&
      this.activeSessionId
    ) {
      const activeTab = this.renderRoot.querySelector(
        `[data-session-id="${this.activeSessionId}"]`
      );
      activeTab?.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-tabs': AIChatTabs;
  }
}
