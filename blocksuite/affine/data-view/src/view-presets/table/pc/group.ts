import {
  menu,
  popFilterableSimpleMenu,
  popupTargetFromElement,
} from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import {
  PlusIcon,
  ToggleDownIcon,
  ToggleRightIcon,
} from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { effect, signal } from '@preact/signals-core';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, html, nothing, unsafeCSS } from 'lit';
import { property, query } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';

import { GroupTitle } from '../../../core/group-by/group-title.js';
import type { Group } from '../../../core/group-by/trait.js';
import type { Row } from '../../../core/index.js';
import { createDndContext } from '../../../core/utils/wc-dnd/dnd-context.js';
import { defaultActivators } from '../../../core/utils/wc-dnd/sensors/index.js';
import { linearMove } from '../../../core/utils/wc-dnd/utils/linear-move.js';
import { getCollapsedState, setCollapsedState } from '../collapsed-state.js';
import { LEFT_TOOL_BAR_WIDTH } from '../consts.js';
import { TableViewAreaSelection } from '../selection';
import { DataViewColumnPreview } from './header/column-renderer.js';
import { getVerticalIndicator } from './header/vertical-indicator.js';
import type { TableViewUILogic } from './table-view-ui-logic.js';

const styles = css`
  affine-data-view-table-group:hover .group-header-op {
    visibility: visible;
    opacity: 1;
  }

  affine-data-view-table-group {
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid var(--affine-border-color);
  }

  .data-view-table-group-add-row {
    display: flex;
    width: 100%;
    height: 28px;
    position: relative;
    z-index: 0;
    cursor: pointer;
    transition: opacity 0.2s ease-in-out;
    padding: 4px 8px;
    border-bottom: 1px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
  }

  .affine-data-view-table-group:hover svg {
    fill: var(--affine-icon-color);
  }

  @media print {
    .data-view-table-group-add-row {
      display: none;
    }
  }

  .data-view-table-group-add-row-button {
    position: sticky;
    left: ${8 + LEFT_TOOL_BAR_WIDTH}px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    user-select: none;
    font-size: 12px;
    line-height: 20px;
    color: var(--affine-text-secondary-color);
  }

  .group-toggle-btn {
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 150ms cubic-bezier(0.42, 0, 1, 1);
  }

  .group-toggle-btn:hover {
    background: var(--affine-hover-color);
  }

  .group-toggle-btn svg {
    width: 16px;
    height: 16px;
    flex-shrink: 0;
    user-select: none;
  }
`;

export class TableGroup extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = styles;

  collapsed$ = signal(false);

  private storageLoaded = false;

  private _loadCollapsedState() {
    if (this.storageLoaded) return;
    this.storageLoaded = true;
    const view = this.tableViewLogic?.view;
    if (!view) return;
    const value = getCollapsedState(view.id, this.group?.key ?? 'all');
    this.collapsed$.value = value;
  }

  private readonly _toggleCollapse = (e?: MouseEvent) => {
    e?.stopPropagation();
    const next = !this.collapsed$.value;
    this.collapsed$.value = next;
    const view = this.tableViewLogic?.view;
    if (view) {
      setCollapsedState(view.id, this.group?.key ?? 'all', next);
    }
  };

  private readonly clickAddRow = () => {
    this.view.rowAdd('end', this.group?.key);
    const selectionController = this.tableViewLogic.selectionController;
    selectionController.selection = undefined;
    requestAnimationFrame(() => {
      const index = this.view.properties$.value.findIndex(
        v => v.type$.value === 'title'
      );
      selectionController.selection = TableViewAreaSelection.create({
        groupKey: this.group?.key,
        focus: {
          rowIndex: this.rows.length - 1,
          columnIndex: index,
        },
        isEditing: true,
      });
      this.requestUpdate();
    });
  };

  private readonly clickAddRowInStart = () => {
    this.view.rowAdd('start', this.group?.key);
    const selectionController = this.tableViewLogic.selectionController;
    selectionController.selection = undefined;
    requestAnimationFrame(() => {
      const index = this.view.properties$.value.findIndex(
        v => v.type$.value === 'title'
      );
      selectionController.selection = TableViewAreaSelection.create({
        groupKey: this.group?.key,
        focus: {
          rowIndex: 0,
          columnIndex: index,
        },
        isEditing: true,
      });
      this.requestUpdate();
    });
  };

  private readonly clickGroupOptions = (e: MouseEvent) => {
    const group = this.group;
    if (!group) {
      return;
    }
    const ele = e.currentTarget as HTMLElement;
    popFilterableSimpleMenu(popupTargetFromElement(ele), [
      menu.action({
        name: 'Ungroup',
        hide: () => group.value == null,
        select: () => {
          group.rows.forEach(row => {
            group.manager.removeFromGroup(row.rowId, group.key);
          });
        },
      }),
      menu.action({
        name: 'Delete Cards',
        select: () => {
          this.view.rowsDelete(group.rows.map(row => row.rowId));
          this.requestUpdate();
        },
      }),
    ]);
  };

  private readonly renderGroupHeader = () => {
    if (!this.group) {
      return null;
    }

    return html`
      <div
        style="position: sticky;left: 0;width: max-content;padding: 6px 0;margin-bottom: 4px;display:flex;align-items:center;gap: 8px;max-width: 400px"
      >
        <div
          class=${`group-toggle-btn ${this.collapsed$.value ? '' : 'expanded'}`}
          role="button"
          aria-expanded=${this.collapsed$.value ? 'false' : 'true'}
          aria-label=${this.collapsed$.value
            ? 'Expand group'
            : 'Collapse group'}
          tabindex="0"
          @click=${this._toggleCollapse}
          @keydown=${(e: KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              this._toggleCollapse();
            }
          }}
        >
          ${this.collapsed$.value
            ? ToggleRightIcon({ width: '16px', height: '16px' })
            : ToggleDownIcon({ width: '16px', height: '16px' })}
        </div>

        ${GroupTitle(this.group, {
          readonly: this.view.readonly$.value,
          clickAdd: this.clickAddRowInStart,
          clickOps: this.clickGroupOptions,
        })}
      </div>
    `;
  };

  @property({ attribute: false })
  accessor group: Group | undefined = undefined;

  dndContext = createDndContext({
    activators: defaultActivators,
    container: this,
    modifiers: [
      ({ transform }) => {
        return {
          ...transform,
          y: 0,
        };
      },
    ],
    onDragEnd: ({ over, active }) => {
      if (over && over.id !== active.id) {
        const activeIndex = this.view.properties$.value.findIndex(
          data => data.id === active.id
        );
        const overIndex = this.view.properties$.value.findIndex(
          data => data.id === over.id
        );
        this.view.propertyGetOrCreate(active.id).move({
          before: activeIndex > overIndex,
          id: over.id,
        });
      }
    },
    collisionDetection: linearMove(true),
    createOverlay: active => {
      const column = this.view.propertyGetOrCreate(active.id);
      const preview = new DataViewColumnPreview();
      preview.column = column;
      preview.group = this.group;
      preview.container = this;
      preview.tableViewLogic = this.tableViewLogic;
      preview.style.position = 'absolute';
      preview.style.zIndex = '999';
      const scale = this.dndContext.scale$.value;
      const offsetParentRect = this.offsetParent?.getBoundingClientRect();
      if (!offsetParentRect) {
        return;
      }
      preview.style.width = `${column.width$.value}px`;
      preview.style.top = `${(active.rect.top - offsetParentRect.top - 1) / scale.y}px`;
      preview.style.left = `${(active.rect.left - offsetParentRect.left) / scale.x}px`;
      const cells = Array.from(
        this.querySelectorAll(`[data-column-id="${active.id}"]`)
      ) as HTMLElement[];
      cells.forEach(ele => {
        ele.style.opacity = '0.1';
      });
      this.append(preview);
      return {
        overlay: preview,
        cleanup: () => {
          preview.remove();
          cells.forEach(ele => {
            ele.style.opacity = '1';
          });
        },
      };
    },
  });

  showIndicator = () => {
    const columnMoveIndicator = getVerticalIndicator();
    this.disposables.add(
      effect(() => {
        const active = this.dndContext.active$.value;
        const over = this.dndContext.over$.value;
        if (!active || !over) {
          columnMoveIndicator.remove();
          return;
        }
        const scrollX = this.dndContext.scrollOffset$.value.x;
        const bottom =
          this.rowsContainer?.getBoundingClientRect().bottom ??
          this.getBoundingClientRect().bottom;
        const left =
          over.rect.left < active.rect.left ? over.rect.left : over.rect.right;
        const height = bottom - over.rect.top;
        columnMoveIndicator.display(left - scrollX, over.rect.top, height);
      })
    );
  };

  get rows() {
    return this.group?.rows ?? this.view.rows$.value;
  }

  private renderRows(rows: Row[]) {
    return html`
      <affine-database-column-header
        .renderGroupHeader=${this.renderGroupHeader}
        .tableViewLogic=${this.tableViewLogic}
      ></affine-database-column-header>
      <div class="affine-database-block-rows">
        ${repeat(
          rows,
          row => row.rowId,
          (row, idx) => {
            return html` <data-view-table-row
              data-row-index="${idx}"
              data-row-id="${row.rowId}"
              .tableViewLogic="${this.tableViewLogic}"
              .rowId="${row.rowId}"
              .rowIndex="${idx}"
            ></data-view-table-row>`;
          }
        )}
      </div>
      ${this.view.readonly$.value
        ? null
        : html` <div
            class="data-view-table-group-add-row dv-hover"
            @click="${this.clickAddRow}"
          >
            <div
              class="data-view-table-group-add-row-button dv-icon-16"
              data-test-id="affine-database-add-row-button"
              role="button"
            >
              ${PlusIcon()}<span style="font-size: 12px">New Record</span>
            </div>
          </div>`}
      <affine-database-column-stats
        .tableViewLogic="${this.tableViewLogic}"
        .group="${this.group}"
      >
      </affine-database-column-stats>
    `;
  }

  override willUpdate(changed: Map<PropertyKey, unknown>): void {
    super.willUpdate(changed);
    if (
      !this.storageLoaded &&
      (changed.has('group') || changed.has('tableViewLogic'))
    ) {
      this._loadCollapsedState();
    }
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this._loadCollapsedState();
    this.showIndicator();
  }

  override render() {
    return html`
      ${this.collapsed$.value ? this.renderGroupHeader() : nothing}
      ${this.collapsed$.value ? nothing : this.renderRows(this.rows)}
    `;
  }

  @query('.affine-database-block-rows')
  accessor rowsContainer: HTMLElement | null = null;

  @property({ attribute: false })
  accessor tableViewLogic!: TableViewUILogic;

  get view() {
    return this.tableViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'affine-data-view-table-group': TableGroup;
  }
}
