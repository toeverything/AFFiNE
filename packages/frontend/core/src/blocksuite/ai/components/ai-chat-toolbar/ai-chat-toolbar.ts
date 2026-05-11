import type { CopilotChatHistoryFragment } from '@affine/graphql';
import { createLitPortal } from '@blocksuite/affine/components/portal';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import type { NotificationService } from '@blocksuite/affine/shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import {
  HistoryIcon,
  PinedIcon,
  PinIcon,
  PlusIcon,
} from '@blocksuite/icons/lit';
import { flip, offset } from '@floating-ui/dom';
import { css, html } from 'lit';
import { property, query } from 'lit/decorators.js';

import type { AIChatRuntime, AIChatSnapshot } from '../../runtime/chat';
import type { DocDisplayConfig } from '../ai-chat-chips';

export class AIChatToolbar extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor session!: CopilotChatHistoryFragment | null | undefined;

  @property({ attribute: false })
  accessor runtime!: AIChatRuntime;

  @property({ attribute: false })
  accessor runtimeSnapshot!: AIChatSnapshot;

  @property({ attribute: false })
  accessor docId: string | undefined;

  @property({ attribute: false })
  accessor onOpenDoc!: (docId: string, sessionId: string) => void;

  @property({ attribute: false })
  accessor onSessionDelete!: (
    session: BlockSuitePresets.AIRecentSession
  ) => void;

  @property({ attribute: false })
  accessor docDisplayConfig!: DocDisplayConfig;

  @property({ attribute: false })
  accessor notificationService!: NotificationService;

  @query('.history-button')
  accessor historyButton!: HTMLDivElement;

  private abortController: AbortController | null = null;

  get isGenerating() {
    const status = this.runtimeSnapshot.status;
    return status === 'transmitting' || status === 'loading';
  }

  get canCreateNewSession() {
    return this.runtimeSnapshot.uiPolicy.canCreateNewSession;
  }

  static override styles = css`
    .ai-chat-toolbar {
      display: flex;
      gap: 8px;
      align-items: center;

      .chat-toolbar-icon {
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        width: 24px;
        height: 24px;
        border-radius: 4px;
        &:hover {
          background-color: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
        }

        svg {
          width: 16px;
          height: 16px;
          color: ${unsafeCSSVarV2('icon/primary')};
        }

        &[data-disabled='true'] {
          cursor: not-allowed;
        }
      }
    }
  `;

  override render() {
    const pinned = this.session?.pinned;
    return html`
      <div class="ai-chat-toolbar">
        ${this.canCreateNewSession
          ? html` <div
              class="chat-toolbar-icon"
              @click=${this.onPlusClick}
              data-testid="ai-panel-new-chat"
            >
              ${PlusIcon()}
              <affine-tooltip>New Chat</affine-tooltip>
            </div>`
          : null}
        <div
          class="chat-toolbar-icon"
          @click=${this.onPinClick}
          data-pinned=${!!pinned}
          data-disabled=${this.isGenerating}
          data-testid="ai-panel-pin-chat"
        >
          ${pinned ? PinedIcon() : PinIcon()}
          <affine-tooltip>
            ${pinned ? 'Unpin this Chat' : 'Pin this Chat'}
          </affine-tooltip>
        </div>
        <div
          class="chat-toolbar-icon history-button"
          @click=${this.toggleHistoryMenu}
          data-testid="ai-panel-chat-history"
        >
          ${HistoryIcon()}
          <affine-tooltip>Chat History</affine-tooltip>
        </div>
      </div>
    `;
  }

  private readonly onPinClick = async () => {
    if (this.isGenerating) {
      this.notificationService.toast(
        'Cannot pin a chat while generating an answer'
      );
      return;
    }
    await this.runtime.dispatch({ type: 'togglePinActiveSession' });
  };

  private readonly unpinConfirm = async () => {
    if (this.session && this.session.pinned) {
      try {
        const confirm = await this.notificationService.confirm({
          title: 'Switch Chat? Current chat is pinned',
          message:
            'Switching will unpinned the current chat. This will change the active chat panel, allowing you to navigate between different conversation histories.',
          confirmText: 'Switch Chat',
          cancelText: 'Cancel',
        });
        if (!confirm) {
          return false;
        }
        await this.runtime.dispatch({ type: 'togglePinActiveSession' });
      } catch {
        this.notificationService.toast('Failed to unpin the chat');
      }
    }
    return true;
  };

  private readonly onPlusClick = async () => {
    const confirm = await this.unpinConfirm();
    if (confirm) {
      await this.runtime.dispatch({ type: 'createNewSession' });
    }
  };

  private readonly onSessionClick = async (sessionId: string) => {
    if (this.session?.sessionId === sessionId) {
      this.notificationService.toast('You are already in this chat');
      return;
    }
    const confirm = await this.unpinConfirm();
    if (confirm) {
      await this.runtime.dispatch({
        type: 'openSession',
        sessionId,
      });
      this.closeHistoryMenu();
    }
  };

  private readonly onDocClick = async (docId: string, sessionId: string) => {
    if (this.docId === docId && this.session?.sessionId === sessionId) {
      this.notificationService.toast('You are already in this chat');
      return;
    }
    this.onOpenDoc(docId, sessionId);
  };

  private readonly toggleHistoryMenu = async () => {
    if (this.abortController) {
      this.abortController.abort();
      return;
    }

    this.abortController = new AbortController();
    this.abortController.signal.addEventListener('abort', () => {
      this.abortController = null;
    });

    try {
      await this.runtime.dispatch({ type: 'refreshHistory' });
    } catch (error) {
      console.error(error);
    }
    if (this.abortController.signal.aborted) {
      return;
    }

    createLitPortal({
      template: html`
        <ai-session-history
          .session=${this.session}
          .docId=${this.docId}
          .recentSessions=${this.runtime.getSnapshot().history.recent}
          .currentDocSessions=${this.runtime.getSnapshot().history.currentDoc}
          .loading=${this.runtime.getSnapshot().history.loading}
          .docDisplayConfig=${this.docDisplayConfig}
          .onSessionClick=${this.onSessionClick}
          .onSessionDelete=${this.onSessionDelete}
          .onDocClick=${this.onDocClick}
          .notificationService=${this.notificationService}
        ></ai-session-history>
      `,
      portalStyles: {
        zIndex: 'var(--affine-z-index-popover)',
      },
      container: document.body,
      computePosition: {
        referenceElement: this.historyButton,
        placement: 'bottom-end',
        middleware: [offset({ crossAxis: 0, mainAxis: 5 }), flip()],
        autoUpdate: { animationFrame: true },
      },
      abortController: this.abortController,
      closeOnClickAway: true,
    });
  };

  public closeHistoryMenu() {
    this.abortController?.abort();
  }
}
