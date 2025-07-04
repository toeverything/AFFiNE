import type { CopilotSessionType } from '@affine/graphql';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import {
  ArrowDownSmallIcon,
  PinedIcon,
  PinIcon,
  PlusIcon,
} from '@blocksuite/icons/lit';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';

export class AIChatToolbar extends WithDisposable(ShadowlessElement) {
  @property({ attribute: false })
  accessor session!: CopilotSessionType | null | undefined;

  @property({ attribute: false })
  accessor onNewSession!: () => void;

  @property({ attribute: false })
  accessor onTogglePin!: () => void;

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
      }
    }
  `;

  override render() {
    const pined = this.session?.pinned;
    return html`
      <div class="ai-chat-toolbar">
        <div class="chat-toolbar-icon" @click=${this.onNewSession}>
          ${PlusIcon()}
          <affine-tooltip>New Chat</affine-tooltip>
        </div>
        <div class="chat-toolbar-icon" @click=${this.onTogglePin}>
          ${pined ? PinedIcon() : PinIcon()}
          <affine-tooltip
            >${pined ? 'Unpin this Chat' : 'Pin this Chat'}</affine-tooltip
          >
        </div>
        <div class="chat-toolbar-icon">
          ${ArrowDownSmallIcon()}
          <affine-tooltip>Chat History</affine-tooltip>
        </div>
      </div>
    `;
  }
}
