import { WithDisposable } from '@blocksuite/affine/global/lit';
import { NotificationProvider } from '@blocksuite/affine/shared/services';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import type { EditorHost } from '@blocksuite/affine/std';
import { ShadowlessElement } from '@blocksuite/affine/std';
import type { Store } from '@blocksuite/affine/store';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';

import type { ChatContextValue } from '../../chat-panel/chat-context';
import { AIProvider } from '../../provider';

export class AIHistoryClear extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor chatContextValue!: ChatContextValue;

  @property({ attribute: false })
  accessor getSessionId!: () => Promise<string | undefined>;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @property({ attribute: false })
  accessor doc!: Store;

  @property({ attribute: false })
  accessor onHistoryCleared!: () => void;

  static override styles = css`
    .chat-history-clear {
      cursor: pointer;
      color: ${unsafeCSSVarV2('icon/primary')};
    }
    .chat-history-clear[aria-disabled='true'] {
      cursor: not-allowed;
      color: ${unsafeCSSVarV2('icon/secondary')};
    }
  `;

  private get _isHistoryClearDisabled() {
    return (
      this.chatContextValue.status === 'loading' ||
      this.chatContextValue.status === 'transmitting' ||
      !this.chatContextValue.messages.length
    );
  }

  private readonly _cleanupHistories = async () => {
    if (this._isHistoryClearDisabled) {
      return;
    }
    const sessionId = await this.getSessionId();
    const notification = this.host.std.getOptional(NotificationProvider);
    if (!notification) return;
    try {
      if (
        await notification.confirm({
          title: 'Clear History',
          message:
            'Are you sure you want to clear all history? This action will permanently delete all content, including all chat logs and data, and cannot be undone.',
          confirmText: 'Confirm',
          cancelText: 'Cancel',
        })
      ) {
        const actionIds = this.chatContextValue.messages
          .filter(item => 'sessionId' in item)
          .map(item => item.sessionId);
        await AIProvider.histories?.cleanup(
          this.doc.workspace.id,
          this.doc.id,
          [...(sessionId ? [sessionId] : []), ...(actionIds || [])]
        );
        notification.toast('History cleared');
        this.onHistoryCleared?.();
      }
    } catch {
      notification.toast('Failed to clear history');
    }
  };

  override render() {
    return html`
      <div
        class="chat-history-clear"
        aria-disabled=${this._isHistoryClearDisabled}
        @click=${this._cleanupHistories}
        data-testid="chat-panel-clear"
      >
        Clear
      </div>
    `;
  }
}
