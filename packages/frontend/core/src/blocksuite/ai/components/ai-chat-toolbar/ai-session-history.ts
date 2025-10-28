import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { scrollbarStyle } from '@blocksuite/affine/shared/styles';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { DeleteIcon } from '@blocksuite/icons/lit';
import { css, html, nothing, type PropertyValues } from 'lit';
import { property, query, state } from 'lit/decorators.js';

import { AIProvider } from '../../provider';
import type { DocDisplayConfig } from '../ai-chat-chips';

interface GroupedSessions {
  today: BlockSuitePresets.AIRecentSession[];
  last7Days: BlockSuitePresets.AIRecentSession[];
  last30Days: BlockSuitePresets.AIRecentSession[];
  older: BlockSuitePresets.AIRecentSession[];
}

export class AISessionHistory extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .ai-session-history {
      width: 316px;
      max-height: 344px;
      padding: 12px 8px;
      overflow-y: auto;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      background: ${unsafeCSSVarV2('layer/background/primary')};
      border-radius: 4px;
      background: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      box-shadow: ${unsafeCSSVar('overlayPanelShadow')};

      .loading-container,
      .empty-container {
        display: flex;
        align-items: center;
        justify-content: center;
        height: 344px;
      }

      .loading-title,
      .empty-title {
        font-weight: 600;
        font-size: var(--affine-font-sm);
        color: var(--affine-text-secondary-color);
      }

      .ai-session-group {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }

      .ai-session-group-title {
        font-size: 12px;
        font-weight: 400;
        line-height: 20px;
        height: 20px;
        color: ${unsafeCSSVarV2('text/secondary')};
      }

      .ai-session-item {
        position: relative;
        display: flex;
        height: 24px;
        justify-content: space-between;
        align-items: center;
        border-radius: 4px;
        cursor: pointer;
      }

      .ai-session-item:hover:not(:has(.ai-session-doc:hover)) {
        background: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
      }

      .ai-session-item[aria-selected='true'] .ai-session-title {
        color: ${unsafeCSSVarV2('text/emphasis')};
      }

      .ai-session-doc:hover {
        background: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
      }

      .ai-session-title {
        font-size: 12px;
        font-weight: 400;
        line-height: 20px;
        padding: 2px 4px;
        color: ${unsafeCSSVarV2('text/primary')};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ai-session-doc {
        display: flex;
        width: 120px;
        padding: 2px;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
        border-radius: 2px;
        cursor: pointer;

        svg {
          width: 16px;
          height: 16px;
          color: ${unsafeCSSVarV2('icon/primary')};
        }

        .doc-title {
          font-size: 12px;
          font-weight: 400;
          line-height: 20px;
          color: ${unsafeCSSVarV2('text/secondary')};
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      }

      .ai-session-item-delete {
        position: absolute;
        right: 2px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        align-items: center;
        justify-content: center;
        background: ${unsafeCSSVarV2('layer/background/primary')};
        border-radius: 2px;
        padding: 2px;
        cursor: pointer;
        opacity: 0;
        visibility: hidden;
        transition:
          opacity 0.2s ease,
          visibility 0.2s ease;

        svg {
          width: 16px;
          height: 16px;
          color: ${unsafeCSSVarV2('icon/primary')};
        }
      }

      .ai-session-item:hover .ai-session-item-delete {
        opacity: 1;
        visibility: visible;
      }
    }

    ${scrollbarStyle('.ai-session-history')}
  `;

  @property({ attribute: false })
  accessor session!: CopilotChatHistoryFragment | null | undefined;

  @property({ attribute: false })
  accessor workspaceId!: string;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor onSessionClick!: (sessionId: string) => void;

  @property({ attribute: false })
  accessor onSessionDelete!: (
    session: BlockSuitePresets.AIRecentSession
  ) => void;

  @property({ attribute: false })
  accessor onDocClick!: (docId: string, sessionId: string) => void;

  @query('.ai-session-history')
  accessor scrollContainer!: HTMLElement;

  @state()
  private accessor sessions: BlockSuitePresets.AIRecentSession[] | undefined;

  @state()
  private accessor loadingMore = false;

  @state()
  private accessor hasMore = true;

  private accessor currentOffset = 0;

  private readonly pageSize = 10;

  private groupSessionsByTime(
    sessions: BlockSuitePresets.AIRecentSession[]
  ): GroupedSessions {
    const now = new Date();
    const todayStart = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
    const last7DaysStart = new Date(
      todayStart.getTime() - 6 * 24 * 60 * 60 * 1000
    );
    const last30DaysStart = new Date(
      todayStart.getTime() - 29 * 24 * 60 * 60 * 1000
    );

    const grouped: GroupedSessions = {
      today: [],
      last7Days: [],
      last30Days: [],
      older: [],
    };

    sessions.forEach(session => {
      const updatedAt = new Date(session.updatedAt);

      if (updatedAt >= todayStart) {
        grouped.today.push(session);
      } else if (updatedAt >= last7DaysStart) {
        grouped.last7Days.push(session);
      } else if (updatedAt >= last30DaysStart) {
        grouped.last30Days.push(session);
      } else {
        grouped.older.push(session);
      }
    });

    // Sort each group by updatedAt in descending order (newest first)
    (Object.keys(grouped) as Array<keyof GroupedSessions>).forEach(key => {
      grouped[key].sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    });

    return grouped;
  }

  private async getRecentSessions() {
    this.loadingMore = true;

    const moreSessions =
      (await AIProvider.session?.getRecentSessions(
        this.workspaceId,
        this.pageSize,
        this.currentOffset
      )) || [];
    this.sessions = [...(this.sessions || []), ...moreSessions];

    this.currentOffset += moreSessions.length;
    this.hasMore = moreSessions.length === this.pageSize;
    this.loadingMore = false;
  }

  private readonly onScroll = () => {
    if (!this.hasMore || this.loadingMore) {
      return;
    }
    // load more when within 50px of bottom
    const { scrollTop, scrollHeight, clientHeight } = this.scrollContainer;
    const threshold = 50;
    if (scrollTop + clientHeight >= scrollHeight - threshold) {
      this.getRecentSessions().catch(console.error);
    }
  };

  override connectedCallback() {
    super.connectedCallback();
    this.getRecentSessions().catch(console.error);
  }

  override firstUpdated(changedProperties: PropertyValues) {
    super.firstUpdated(changedProperties);
    this.disposables.add(() => {
      this.scrollContainer.removeEventListener('scroll', this.onScroll);
    });
    this.scrollContainer.addEventListener('scroll', this.onScroll);
  }

  private renderSessionGroup(
    title: string,
    sessions: BlockSuitePresets.AIRecentSession[]
  ) {
    if (sessions.length === 0) {
      return nothing;
    }
    return html`
      <div class="ai-session-group">
        <div class="ai-session-group-title">${title}</div>
        ${sessions.map(session => {
          return html`
            <div
              class="ai-session-item"
              @click=${(e: MouseEvent) => {
                e.stopPropagation();
                this.onSessionClick(session.sessionId);
              }}
              aria-selected=${this.session?.sessionId === session.sessionId}
              data-session-id=${session.sessionId}
            >
              <div class="ai-session-title">
                ${session.title || 'New chat'}
                <affine-tooltip .offsetX=${60}>
                  Click to open this chat
                </affine-tooltip>
              </div>
              ${session.docId
                ? this.renderSessionDoc(session.docId, session.sessionId)
                : nothing}
              <div
                class="ai-session-item-delete"
                @click=${(e: MouseEvent) => {
                  e.stopPropagation();
                  this.onSessionDelete(session);
                }}
              >
                ${DeleteIcon()}
                <affine-tooltip>Delete</affine-tooltip>
              </div>
            </div>
          `;
        })}
      </div>
    `;
  }

  private renderSessionDoc(docId: string, sessionId: string) {
    const getIcon = this.docDisplayConfig.getIcon(docId);
    const docIcon = typeof getIcon === 'function' ? getIcon() : getIcon;
    return html`<div
      class="ai-session-doc"
      @click=${(e: MouseEvent) => {
        e.stopPropagation();
        this.onDocClick(docId, sessionId);
      }}
    >
      ${docIcon}
      <span class="doc-title"> ${this.docDisplayConfig.getTitle(docId)} </span>
      <affine-tooltip>Open this doc</affine-tooltip>
    </div>`;
  }

  private renderLoading() {
    return html`
      <div class="loading-container">
        <div class="loading-title">Loading history...</div>
      </div>
    `;
  }

  private renderEmpty() {
    return html`
      <div class="empty-container">
        <div class="empty-title">Empty history</div>
      </div>
    `;
  }

  private renderHistory() {
    if (!this.sessions) {
      return this.renderLoading();
    }

    if (this.sessions.length === 0) {
      return this.renderEmpty();
    }

    const groupedSessions = this.groupSessionsByTime(this.sessions);
    return html`
      ${this.renderSessionGroup('Today', groupedSessions.today)}
      ${this.renderSessionGroup('Last 7 days', groupedSessions.last7Days)}
      ${this.renderSessionGroup('Last 30 days', groupedSessions.last30Days)}
      ${this.renderSessionGroup('Older', groupedSessions.older)}
    `;
  }

  override render() {
    return html`
      <div class="ai-session-history">${this.renderHistory()}</div>
    `;
  }
}
