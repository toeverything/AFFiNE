import type { CopilotSessionType } from '@affine/graphql';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { NotificationService } from '@blocksuite/affine/shared/services';
import { scrollbarStyle } from '@blocksuite/affine/shared/styles';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { css, html, nothing } from 'lit';
import { property, state } from 'lit/decorators.js';

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
        display: flex;
        height: 24px;
        padding: 2px 4px;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
      }

      .ai-session-item:hover {
        background: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
        border-color: ${unsafeCSSVarV2('layer/insideBorder/border')};
      }

      .ai-session-title {
        font-size: 12px;
        font-weight: 400;
        line-height: 20px;
        color: ${unsafeCSSVarV2('text/primary')};
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .ai-session-doc {
        display: flex;
        width: 120px;
        padding: 0px 4px;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
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
    }

    ${scrollbarStyle('.ai-session-history')}
  `;

  @property({ attribute: false })
  accessor session!: CopilotSessionType | null | undefined;

  @property({ attribute: false })
  accessor workspaceId!: string;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor onSessionClick!: (sessionId: string) => void;

  @property({ attribute: false })
  accessor notification: NotificationService | null | undefined;

  @state()
  private accessor sessions: BlockSuitePresets.AIRecentSession[] = [];

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
    const limit = 50;
    const sessions = await AIProvider.session?.getRecentSessions(
      this.workspaceId,
      limit
    );
    if (sessions) {
      this.sessions = sessions;
    }
  }

  override connectedCallback() {
    super.connectedCallback();
    this.getRecentSessions().catch(console.error);
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
              @click=${() => this.onSessionClick(session.sessionId)}
            >
              <div class="ai-session-title">${session.sessionId}</div>
              ${session.docId ? this.renderSessionDoc(session.docId) : nothing}
            </div>
          `;
        })}
      </div>
    `;
  }

  private renderSessionDoc(docId: string) {
    const getIcon = this.docDisplayConfig.getIcon(docId);
    const docIcon = typeof getIcon === 'function' ? getIcon() : getIcon;
    return html`<div class="ai-session-doc">
      ${docIcon}
      <span class="doc-title">${this.docDisplayConfig.getTitle(docId)}</span>
    </div>`;
  }

  override render() {
    if (this.sessions.length === 0) {
      return nothing;
    }
    const groupedSessions = this.groupSessionsByTime(this.sessions);

    return html`
      <div class="ai-session-history">
        ${this.renderSessionGroup('Today', groupedSessions.today)}
        ${this.renderSessionGroup('Last 7 days', groupedSessions.last7Days)}
        ${this.renderSessionGroup('Last 30 days', groupedSessions.last30Days)}
        ${this.renderSessionGroup('Older', groupedSessions.older)}
      </div>
    `;
  }
}
