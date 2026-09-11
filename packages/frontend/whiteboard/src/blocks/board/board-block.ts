import { I18n } from '@affine/i18n';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { BlockComponent } from '@blocksuite/affine/std';
import { html } from 'lit';

import { resolveBoardDatabase } from './hub';
import { createBoardKanbanLogic } from './kanban-host';
import type { BoardBlockModel } from './model';
import { boardBlockStyles } from './styles';

export class BoardBlockComponent extends BlockComponent<BoardBlockModel> {
  static override styles = boardBlockStyles;

  private _kanban?: ReturnType<typeof createBoardKanbanLogic>;
  private _databaseId?: string;

  protected get databaseModel() {
    const model = resolveBoardDatabase(
      this.model.store,
      this.model.props.blockId,
      this.model.props.linkedDocId
    );
    if (model?.flavour === 'affine:database') {
      return model as DatabaseBlockModel;
    }
    return undefined;
  }

  protected get titleText() {
    const title = this.model.props.title;
    const value = typeof title === 'string' ? title : title?.toString();
    return value || I18n['com.affine.whiteboard.board.title']();
  }

  private kanban() {
    const database = this.databaseModel;
    if (!database) {
      this._kanban = undefined;
      this._databaseId = undefined;
      return;
    }
    if (!this._kanban || this._databaseId !== database.id) {
      this._databaseId = database.id;
      this._kanban = createBoardKanbanLogic(this.std, database);
    }
    return this._kanban;
  }

  protected renderFrame(preview = false) {
    const snapshot = this.model.props.snapshotBlobId$.value;
    const kanban = preview ? undefined : this.kanban();

    return html`
      <div class="wb-board">
        <div class="wb-board__header">
          <div class="wb-board__title">${this.titleText}</div>
          <div class="wb-board__kicker">
            ${preview
              ? I18n['com.affine.whiteboard.board.preview-label']()
              : I18n['com.affine.whiteboard.board.kicker']()}
          </div>
        </div>
        <div
          class="wb-board__body"
          @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
          @wheel=${(event: WheelEvent) => event.stopPropagation()}
        >
          ${snapshot
            ? html`<img
                class="wb-board__snapshot"
                src=${snapshot}
                alt=${this.titleText}
              />`
            : kanban
              ? kanban.render()
              : html`<div class="wb-board__placeholder">
                  ${I18n['com.affine.whiteboard.board.empty']()}
                </div>`}
        </div>
      </div>
    `;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.add(
      this.model.propsUpdated.subscribe(() => this.requestUpdate())
    );
    const database = this.databaseModel;
    if (database) {
      this.disposables.add(
        database.propsUpdated.subscribe(() => this.requestUpdate())
      );
    }
  }

  override renderBlock() {
    return this.renderFrame(false);
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-board': BoardBlockComponent;
  }
}
