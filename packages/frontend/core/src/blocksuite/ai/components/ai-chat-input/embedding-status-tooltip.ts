import { SignalWatcher } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar } from '@blocksuite/affine/shared/theme';
import type { EditorHost } from '@blocksuite/affine/std';
import { css, html, LitElement } from 'lit';
import { property, state } from 'lit/decorators.js';
import { debounce, noop } from 'lodash-es';

import { AIProvider } from '../../provider/ai-provider';

export class AIChatEmbeddingStatusTooltip extends SignalWatcher(LitElement) {
  static override styles = css`
    :host {
      width: 100%;
    }
    .embedding-status {
      display: flex;
      width: 100%;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      user-select: none;
    }
    .embedding-status-text {
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 500px;
    }
    .check-status {
      padding: 4px;
      cursor: pointer;
      border-radius: 4px;
    }
    .check-status:hover {
      background-color: ${unsafeCSSVar('--affine-hover-color')};
    }
  `;

  @property({ attribute: false })
  accessor host!: EditorHost;

  @state()
  accessor progressText = 'Loading embedding status...';

  override connectedCallback() {
    super.connectedCallback();
    this._updateEmbeddingStatus().catch(noop);
  }

  private async _updateEmbeddingStatus() {
    try {
      const status = await AIProvider.embedding?.getEmbeddingStatus(
        this.host.std.workspace.id
      );
      if (!status) {
        this.progressText = 'Loading embedding status...';
        return;
      }
      const completed = status.embedded === status.total;
      if (completed) {
        this.progressText =
          'Embedding finished. You are getting the best results!';
      } else {
        this.progressText =
          'File not embedded yet. Results will improve after embedding.';
      }
      this.requestUpdate();
    } catch {
      this.progressText = 'Failed to load embedding status...';
    }
  }

  private readonly _handleCheckStatusMouseEnter = debounce(
    () => {
      this._updateEmbeddingStatus().catch(noop);
    },
    1000,
    { leading: true }
  );

  override render() {
    return html`
      <div
        class="embedding-status"
        data-testid="ai-chat-embedding-status-tooltip"
      >
        <div class="embedding-status-text">
          Better results after embedding finished.
        </div>
        <div
          class="check-status"
          data-testid="ai-chat-embedding-status-tooltip-check"
          @mouseenter=${this._handleCheckStatusMouseEnter}
        >
          Check status
          <affine-tooltip tip-position="top-start"
            >${this.progressText}</affine-tooltip
          >
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-chat-embedding-status-tooltip': AIChatEmbeddingStatusTooltip;
  }
}
