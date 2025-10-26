import track from '@affine/track';
import { WithDisposable } from '@blocksuite/affine/global/lit';
import { unsafeCSSVar, unsafeCSSVarV2 } from '@blocksuite/affine/shared/theme';
import { CloseIcon, DoneIcon } from '@blocksuite/icons/lit';
import { css, html, LitElement } from 'lit';
import { property } from 'lit/decorators.js';

import type { PatchOp } from '../../utils/apply-model/markdown-diff';

export class BlockDiffOptions extends WithDisposable(LitElement) {
  static override styles = css`
    :host {
      position: absolute;
      right: -20px;
      top: 0;

      display: flex;
      flex-direction: column;
      gap: 4px;
      cursor: pointer;
      pointer-events: auto;
    }

    .ai-block-diff-option {
      padding: 2px;
      border-radius: 4px;
      box-shadow: ${unsafeCSSVar('shadow1')};
      display: flex;
      background-color: ${unsafeCSSVarV2('layer/background/overlayPanel')};
      align-items: center;
      justify-content: center;
      border-radius: 4px;
    }

    .ai-block-diff-option.accept {
      color: ${unsafeCSSVarV2('icon/activated')};
    }

    .ai-block-diff-option.reject {
      color: ${unsafeCSSVarV2('icon/secondary')};
    }
  `;

  @property({ attribute: false })
  accessor onAccept!: (op: PatchOp) => void;

  @property({ attribute: false })
  accessor op!: PatchOp;

  @property({ attribute: false })
  accessor onReject!: (op: PatchOp) => void;

  private readonly _handleAcceptClick = () => {
    track.applyModel.widget.block.accept();
    this.onAccept(this.op);
  };

  private readonly _handleRejectClick = () => {
    track.applyModel.widget.block.reject();
    this.onReject(this.op);
  };

  override render() {
    return html`
      <div
        class="ai-block-diff-option accept"
        @click=${this._handleAcceptClick}
      >
        ${DoneIcon()}
      </div>
      <div
        class="ai-block-diff-option reject"
        @click=${this._handleRejectClick}
      >
        ${CloseIcon()}
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'ai-block-diff-options': BlockDiffOptions;
  }
}
