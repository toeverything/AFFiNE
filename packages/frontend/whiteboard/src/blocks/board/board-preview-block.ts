import { I18n } from '@affine/i18n';
import { BlockComponent } from '@blocksuite/affine/std';
import { html } from 'lit';

import type { BoardBlockModel } from './model';
import { boardBlockStyles } from './styles';

export class BoardPreviewBlockComponent extends BlockComponent<BoardBlockModel> {
  static override styles = boardBlockStyles;

  override renderBlock() {
    const title =
      this.model.props.title?.toString() ||
      I18n['com.affine.whiteboard.board.title']();
    const snapshot = this.model.props.snapshotBlobId$.value;

    return html`
      <div class="wb-board">
        <div class="wb-board__header">
          <div class="wb-board__title">${title}</div>
          <div class="wb-board__kicker">
            ${I18n['com.affine.whiteboard.board.preview-label']()}
          </div>
        </div>
        <div class="wb-board__body">
          ${
            snapshot
              ? html`<img
                  class="wb-board__snapshot"
                  src=${snapshot}
                  alt=${title}
                />`
              : html`<div class="wb-board__placeholder">
                  ${I18n['com.affine.whiteboard.board.preview-label']()}
                </div>`
          }
        </div>
      </div>
    `;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-board-preview': BoardPreviewBlockComponent;
  }
}
