import { I18n } from '@affine/i18n';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { BlockComponent, BlockSelection } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import { html } from 'lit';
import { state } from 'lit/decorators.js';

import { WHITEBOARD_LOD } from '../../const';
import { databaseToSnapshot, readBoardColumns } from './column-snapshot';
import { resolveBoardDatabase } from './hub';
import { createBoardKanbanLogic } from './kanban-host';
import { getBoardLodLevel, liveKanbanBudget } from './live-budget';
import { boardLodKicker, renderBoardLod } from './lod-view';
import type { BoardBlockModel } from './model';
import { boardBlockStyles } from './styles';
import { windowRange } from './virtualize';

export class BoardBlockComponent extends BlockComponent<BoardBlockModel> {
  static override styles = boardBlockStyles;

  @state()
  accessor selected = false;

  @state()
  accessor hovered = false;

  @state()
  accessor intersecting = true;

  @state()
  accessor columnScroll = 0;

  private _kanban?: ReturnType<typeof createBoardKanbanLogic>;
  private _databaseId?: string;
  private _columnViewport = 720;

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

  private get zoom() {
    return this.std.getOptional(GfxControllerIdentifier)?.viewport.zoom ?? 1;
  }

  private get lod() {
    return getBoardLodLevel(this.zoom, this.selected, this.hovered);
  }

  private canUseLive(preview = false) {
    if (preview || !this.intersecting) return false;
    return this.lod === 'l2';
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

  private disposeLive() {
    this._kanban = undefined;
    this._databaseId = undefined;
    liveKanbanBudget.release(this.model.id);
  }

  private syncLive(preview = false) {
    const had = liveKanbanBudget.has(this.model.id);
    if (
      this.canUseLive(preview) &&
      liveKanbanBudget.acquire(
        this.model.id,
        !!this.model.props.liveBudgetExempt
      )
    ) {
      if (!had) this.requestUpdate();
      return;
    }
    if (had || this._kanban) {
      this.disposeLive();
      this.requestUpdate();
    }
  }

  private displayLevel(preview: boolean) {
    if (!preview && liveKanbanBudget.has(this.model.id) && this.canUseLive()) {
      return 'l2' as const;
    }
    if (!this.intersecting) return 'l0' as const;
    const lod = this.lod;
    return lod === 'l2' ? ('l1' as const) : lod;
  }

  private columnPreviews() {
    const database = this.databaseModel;
    if (!database) return [];
    return readBoardColumns(databaseToSnapshot(database));
  }

  protected renderFrame(preview = false) {
    const snapshot = this.model.props.snapshotBlobId$.value;
    const level = this.displayLevel(preview);
    const live = level === 'l2';
    const kanban = live ? this.kanban() : undefined;
    const columns = this.columnPreviews();
    const columnWindow =
      columns.length > 6
        ? windowRange(
            columns.length,
            this.columnScroll,
            this._columnViewport,
            WHITEBOARD_LOD.kanbanColumnEstimatePx
          )
        : undefined;

    return html`
      <div
        class="wb-board wb-board--${level}"
        @pointerenter=${() => {
          this.hovered = true;
          this.syncLive(preview);
        }}
        @pointerleave=${() => {
          this.hovered = false;
          this.syncLive(preview);
        }}
      >
        <div class="wb-board__header">
          <div class="wb-board__title">${this.titleText}</div>
          <div class="wb-board__kicker">${boardLodKicker(level, preview)}</div>
        </div>
        <div
          class="wb-board__body"
          @pointerdown=${(event: PointerEvent) => event.stopPropagation()}
          @wheel=${(event: WheelEvent) => event.stopPropagation()}
          @scroll=${(event: Event) => {
            const target = event.currentTarget as HTMLElement;
            this.columnScroll = target.scrollLeft;
            this._columnViewport = target.clientWidth || this._columnViewport;
          }}
        >
          ${live && kanban
            ? kanban.render()
            : columns.length
              ? renderBoardLod({
                  columns,
                  level: level === 'l2' ? 'l1' : level,
                  columnWindow,
                })
              : snapshot
                ? html`<img
                    class="wb-board__snapshot"
                    src=${snapshot}
                    alt=${this.titleText}
                  />`
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

    const gfx = this.std.getOptional(GfxControllerIdentifier);
    if (gfx) {
      this.disposables.add(
        gfx.selection.slots.updated.subscribe(() => {
          this.selected = gfx.selection.has(this.model.id);
          this.syncLive();
        })
      );
      this.disposables.add(
        gfx.viewport.viewportUpdated.subscribe(() => {
          this.syncLive();
        })
      );
      this.selected = gfx.selection.has(this.model.id);
    } else {
      this.disposables.add(
        this.std.selection.slots.changed.subscribe(() => {
          this.selected = this.std.selection
            .filter(BlockSelection)
            .some(selection => selection.blockId === this.model.id);
          this.syncLive();
        })
      );
    }
  }

  override firstUpdated() {
    const observer = new IntersectionObserver(
      entries => {
        this.intersecting = entries.some(entry => entry.isIntersecting);
        this.syncLive();
      },
      { rootMargin: '200px' }
    );
    observer.observe(this);
    this.disposables.add(() => observer.disconnect());
    this.syncLive();
  }

  override updated() {
    this.syncLive();
  }

  override disconnectedCallback() {
    this.disposeLive();
    super.disconnectedCallback();
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
