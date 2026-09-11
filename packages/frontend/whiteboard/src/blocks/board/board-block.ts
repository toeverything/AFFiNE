import { I18n } from '@affine/i18n';
import { PeekViewProvider } from '@blocksuite/affine/components/peek';
import type { DatabaseBlockModel } from '@blocksuite/affine/model';
import { CommentProviderIdentifier } from '@blocksuite/affine/shared/services';
import { BlockComponent, BlockSelection } from '@blocksuite/affine/std';
import { GfxControllerIdentifier } from '@blocksuite/affine/std/gfx';
import { html, nothing } from 'lit';
import { state } from 'lit/decorators.js';
import type { Root } from 'react-dom/client';

import {
  publishWidgetEditing,
  remoteOwnsLiveEditor,
} from '../../collab/awareness';
import { WHITEBOARD_LOD } from '../../const';
import { detach } from '../../detach';
import { canEditBoardWidgets } from '../../infra/permissions';
import {
  tryLive,
  whiteboardPerfPolicy,
  xywhCenterDistance,
} from '../../perf/policy';
import { whiteboardTelemetry } from '../../perf/telemetry';
import type { BoardSettingsPanelProps } from './board-settings-panel';
import { databaseToSnapshot } from './column-snapshot';
import { readBoardGrid } from './grid';
import {
  applyCardMove,
  applyChecklistToggle,
  applyTimeLog,
  applyViewMeta,
  resolveBoardDatabase,
} from './hub';
import { createBoardKanbanLogic } from './kanban-host';
import { getBoardLodLevel, liveKanbanBudget } from './live-budget';
import {
  type BoardCardScroll,
  boardLodKicker,
  renderBoardGrid,
  renderBoardLod,
} from './lod-view';
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

  @state()
  accessor cardScroll: Record<string, number> = {};

  private _kanban?: ReturnType<typeof createBoardKanbanLogic>;
  private _databaseId?: string;
  private _columnViewport = 720;
  private _cardViewport = 240;
  private _panelRoot: Root | null = null;

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

  private get showSettings() {
    return this.selected && canEditBoardWidgets(this.std.store, this.model);
  }

  private canUseLive(preview = false) {
    if (preview || !this.intersecting) return false;
    if (remoteOwnsLiveEditor(this.std.store, this.model.id)) return false;
    return this.lod === 'l2';
  }

  private boardGrid() {
    const database = this.databaseModel;
    if (!database) return;
    return readBoardGrid(databaseToSnapshot(database));
  }

  private kanban() {
    const database = this.databaseModel;
    if (!database) {
      this._kanban?.dispose();
      this._kanban = undefined;
      this._databaseId = undefined;
      return;
    }
    if (!this._kanban || this._databaseId !== database.id) {
      this._kanban?.dispose();
      this._databaseId = database.id;
      this._kanban = createBoardKanbanLogic(this.std, database);
    }
    return this._kanban;
  }

  private disposeLive() {
    this._kanban?.dispose();
    this._kanban = undefined;
    this._databaseId = undefined;
    liveKanbanBudget.release(this.model.id);
    publishWidgetEditing(this.std.store, this.model.flavour, null);
  }

  private syncLive(preview = false) {
    const had = liveKanbanBudget.has(this.model.id);
    const viewport = this.std.getOptional(GfxControllerIdentifier)?.viewport;
    if (
      this.canUseLive(preview) &&
      tryLive(liveKanbanBudget, {
        id: this.model.id,
        kind: 'kanban',
        selected: this.selected,
        hovered: this.hovered,
        intersecting: this.intersecting,
        distanceToCenter: xywhCenterDistance(
          this.model.xywh,
          viewport?.center.x ?? 0,
          viewport?.center.y ?? 0
        ),
        exempt: !!this.model.props.liveBudgetExempt,
      })
    ) {
      publishWidgetEditing(this.std.store, this.model.flavour, this.model.id);
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

  private handlers() {
    const database = this.databaseModel;
    const grid = this.boardGrid();
    if (!database || !grid) return;
    return {
      interactive: canEditBoardWidgets(this.std.store, this.model),
      onMove: (rowId: string, x: string, y: string) => {
        if (!canEditBoardWidgets(this.std.store, this.model)) return;
        if (!grid.axes.x) return;
        const yColumn = database.props.columns.find(
          column => column.id === grid.axes.y
        );
        applyCardMove(this.model.store, database.id, rowId, {
          xPropertyId: grid.axes.x,
          xValue: x,
          yPropertyId: grid.axes.y,
          yValue: y,
          yIsMember: yColumn?.type === 'member',
        });
        this.requestUpdate();
      },
      onOpen: (rowId: string) => {
        detach(
          this.std.getOptional(PeekViewProvider)?.peek({
            docId: database.store.id,
            databaseId: database.id,
            databaseDocId: database.store.id,
            databaseRowId: rowId,
            target: this,
          })
        );
      },
      onComment: (rowId: string) => {
        this.std
          .getOptional(CommentProviderIdentifier)
          ?.addComment([new BlockSelection({ blockId: rowId })]);
      },
      onLogTime: (rowId: string) => {
        if (!canEditBoardWidgets(this.std.store, this.model)) return;
        applyTimeLog(this.model.store, database.id, rowId, 15);
        this.requestUpdate();
      },
      onToggleTask: (rowId: string, index: number) => {
        if (!canEditBoardWidgets(this.std.store, this.model)) return;
        applyChecklistToggle(this.model.store, database.id, rowId, index);
        this.requestUpdate();
      },
    };
  }

  private cardScrollConfig(): BoardCardScroll {
    return {
      offsets: this.cardScroll,
      viewport: this._cardViewport,
      onScroll: (key, offset, viewport) => {
        this._cardViewport = viewport || this._cardViewport;
        if (this.cardScroll[key] === offset) return;
        this.cardScroll = { ...this.cardScroll, [key]: offset };
      },
    };
  }

  private settingsProps(): BoardSettingsPanelProps | undefined {
    const database = this.databaseModel;
    const grid = this.boardGrid();
    if (!database || !grid) return;
    const laneProperties = database.props.columns
      .filter(
        column =>
          column.id !== grid.axes.x &&
          (column.type === 'member' || column.type === 'select')
      )
      .map(column => ({ id: column.id, name: column.name }));
    return {
      axes: grid.axes,
      laneProperties,
      columns: grid.columns,
      lanes: grid.lanes,
      wipLimits: grid.wipLimits,
      laneFilter: (
        database.props.views.find(view => view.mode === 'kanban') as
          | { laneFilter?: string }
          | undefined
      )?.laneFilter,
      onAxesChange: axes => {
        applyViewMeta(this.model.store, database.id, { groupByAxes: axes });
        this.requestUpdate();
      },
      onWipChange: wipLimits => {
        applyViewMeta(this.model.store, database.id, { wipLimits });
        this.requestUpdate();
      },
      onLaneFilterChange: laneFilter => {
        applyViewMeta(this.model.store, database.id, { laneFilter });
        this.requestUpdate();
      },
    };
  }

  private async syncSettingsPanel() {
    const host = this.renderRoot.querySelector('.wb-board-settings-host');
    const props = this.settingsProps();
    if (!this.showSettings || !host || !props) {
      this._panelRoot?.unmount();
      this._panelRoot = null;
      return;
    }
    const [{ createElement }, { BoardSettingsPanel }, { createRoot }] =
      await Promise.all([
        import('react'),
        import('./board-settings-panel'),
        import('react-dom/client'),
      ]);
    if (!this._panelRoot) {
      this._panelRoot = createRoot(host);
    }
    this._panelRoot.render(createElement(BoardSettingsPanel, props));
  }

  protected renderSettings() {
    if (!this.showSettings) return nothing;
    return html`<div class="wb-board-settings-host"></div>`;
  }

  protected renderFrame(preview = false) {
    const snapshot = this.model.props.snapshotBlobId$.value;
    const level = this.displayLevel(preview);
    const live = level === 'l2';
    const grid = this.boardGrid();
    const useSwimlanes = !!grid?.axes.y;
    const kanban = live && !useSwimlanes ? this.kanban() : undefined;
    const columns = grid?.columns ?? [];
    const columnWindow =
      !useSwimlanes && columns.length > 6
        ? windowRange(
            columns.length,
            this.columnScroll,
            this._columnViewport,
            WHITEBOARD_LOD.kanbanColumnEstimatePx
          )
        : undefined;
    const handlers = live ? this.handlers() : undefined;
    const kanbanView = this.databaseModel?.props.views.find(
      view => view.mode === 'kanban'
    );

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
          ${
            live && kanban
              ? kanban.render()
              : grid && (useSwimlanes || live)
                ? renderBoardGrid({
                    grid,
                    level,
                    laneFilter: (
                      kanbanView as { laneFilter?: string } | undefined
                    )?.laneFilter,
                    handlers,
                    cardScroll: live ? this.cardScrollConfig() : undefined,
                  })
                : columns.length
                  ? renderBoardLod({
                      columns,
                      level: level === 'l2' ? 'l1' : level,
                      columnWindow,
                      wipLimits: grid?.wipLimits,
                    })
                  : snapshot
                    ? html`<img
                        class="wb-board__snapshot"
                        src=${snapshot}
                        alt=${this.titleText}
                      />`
                    : html`<div class="wb-board__placeholder">
                        ${I18n['com.affine.whiteboard.board.empty']()}
                      </div>`
          }
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
          detach(this.syncSettingsPanel());
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
          detach(this.syncSettingsPanel());
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
    detach(this.syncSettingsPanel());
  }

  override disconnectedCallback() {
    this.disposeLive();
    whiteboardPerfPolicy.forget(this.model.id);
    whiteboardTelemetry.forgetWidget(this.model.id);
    this._panelRoot?.unmount();
    this._panelRoot = null;
    super.disconnectedCallback();
  }

  override renderBlock() {
    return html`${this.renderFrame(false)}${this.renderSettings()}`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'wb-board': BoardBlockComponent;
  }
}
