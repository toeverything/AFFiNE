import { SignalWatcher, WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { ShadowlessElement } from '@blocksuite/affine/std';
import { CloseIcon, PlusIcon } from '@blocksuite/icons/lit';
import { css, html, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';

import type { ChipState } from './type';

export class ChatPanelChip extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .chip-card {
      display: flex;
      height: 24px;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      border-radius: 4px;
      border: 0.5px solid ${unsafeCSSVarV2('layer/insideBorder/border')};
      background: ${unsafeCSSVarV2('layer/background/primary')};
      box-sizing: border-box;
    }
    .chip-card[data-state='candidate'] {
      border-width: 1px;
      border-style: dashed;
      border-color: ${unsafeCSSVarV2('icon/tertiary')};
      background: ${unsafeCSSVarV2('layer/background/secondary')};
      color: ${unsafeCSSVarV2('icon/secondary')};
    }
    .chip-card[data-state='candidate']:hover {
      background: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }
    .chip-card[data-state='candidate'] svg {
      color: ${unsafeCSSVarV2('icon/secondary')};
    }
    .chip-card[data-state='failed'] {
      color: ${unsafeCSSVarV2('status/error')};
      background: ${unsafeCSSVarV2('layer/background/error')};
    }
    .chip-card-content {
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .chip-card[data-state='failed'] svg {
      color: ${unsafeCSSVarV2('status/error')};
    }
    .chip-card svg {
      width: 16px;
      height: 16px;
      color: ${unsafeCSSVarV2('icon/primary')};
    }
    .chip-card-title {
      display: inline-block;
      margin: 0 4px;
      font-size: 12px;
      min-width: 16px;
      max-width: 124px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chip-card[data-state='candidate'] {
      cursor: pointer;
    }
    .chip-card-close {
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      border-radius: 4px;
    }
    .chip-card-close:hover {
      background: ${unsafeCSSVarV2('layer/background/hoverOverlay')};
    }
  `;

  @property({ attribute: false })
  accessor state!: ChipState;

  @property({ attribute: false })
  accessor name!: string;

  @property({ attribute: false })
  accessor tooltip!: string;

  @property({ attribute: false })
  accessor icon!: TemplateResult<1>;

  @property({ attribute: false })
  accessor closeable: boolean = false;

  @property({ attribute: false })
  accessor onChipDelete: () => void = () => {};

  @property({ attribute: false })
  accessor onChipClick: () => void = () => {};

  override render() {
    const isCandidate = this.state === 'candidate';
    return html`
      <div
        class="chip-card"
        data-testid="chat-panel-chip"
        data-state=${this.state}
        @click=${this.onChipClick}
      >
        <div class="chip-card-content">
          ${this.icon}
          <span class="chip-card-title">
            <span data-testid="chat-panel-chip-title">${this.name}</span>
          </span>
          <affine-tooltip>${this.tooltip}</affine-tooltip>
        </div>
        ${isCandidate
          ? html`${PlusIcon()}`
          : this.closeable
            ? html`
                <div class="chip-card-close" @click=${this.onChipDelete}>
                  ${CloseIcon()}
                </div>
              `
            : ''}
      </div>
    `;
  }
}
