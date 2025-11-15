import { popupTargetFromElement } from '@blocksuite/affine-components/context-menu';
import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { CenterPeekIcon, MoreHorizontalIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { cssVarV2 } from '@toeverything/theme/v2';
import { css, nothing, unsafeCSS } from 'lit';
import { property } from 'lit/decorators.js';
import { repeat } from 'lit/directives/repeat.js';
import { styleMap } from 'lit/directives/style-map.js';
import { html } from 'lit/static-html.js';

import {
  TableViewRowSelection,
  type TableViewSelection,
} from '../../selection';
import { cellDivider } from '../../styles';
import type { TableGroup } from '../group.js';
import { openDetail, popRowMenu } from '../menu.js';
import type { TableViewUILogic } from '../table-view-ui-logic.js';

export class TableRowView extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  static override styles = css`
    .affine-database-block-row:has(.row-select-checkbox.selected) {
      background: var(--affine-primary-color-04);
    }
    .affine-database-block-row:has(.row-select-checkbox.selected)
      .row-selected-bg {
      position: relative;
    }
    .affine-database-block-row:has(.row-select-checkbox.selected)
      .row-selected-bg:before {
      content: '';
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      background: var(--affine-primary-color-04);
    }
    .affine-database-block-row {
      width: 100%;
      display: flex;
      flex-direction: row;
      border-bottom: 1px solid ${unsafeCSS(cssVarV2.layer.insideBorder.border)};
      position: relative;
    }

    .affine-database-block-row.selected > .database-cell {
      background: transparent;
    }

    .row-ops {
      position: relative;
      width: 0;
      margin-top: 4px;
      height: max-content;
      visibility: hidden;
      display: flex;
      gap: 4px;
      cursor: pointer;
      justify-content: end;
    }

    .row-op:last-child {
      margin-right: 8px;
    }

    .affine-database-block-row .show-on-hover-row {
      visibility: hidden;
      opacity: 0;
    }
    .affine-database-block-row:hover .show-on-hover-row {
      visibility: visible;
      opacity: 1;
    }
    .affine-database-block-row:has(.active) .show-on-hover-row {
      visibility: visible;
      opacity: 1;
    }
    .affine-database-block-row:has([data-editing='true']) .show-on-hover-row {
      visibility: hidden;
      opacity: 0;
    }

    .row-op {
      display: flex;
      padding: 4px;
      border-radius: 4px;
      box-shadow: var(--affine-button-shadow);
      background-color: var(--affine-background-primary-color);
      position: relative;
    }

    .row-op:hover:before {
      content: '';
      border-radius: 4px;
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      bottom: 0;
      background-color: var(--affine-hover-color);
    }

    .row-op svg {
      fill: var(--affine-icon-color);
      color: var(--affine-icon-color);
      width: 16px;
      height: 16px;
    }
    .data-view-table-view-drag-handler {
      width: 4px;
      height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      background-color: var(--affine-background-primary-color);
    }
  `;

  private readonly _clickDragHandler = () => {
    if (this.view.readonly$.value) {
      return;
    }
    this.selectionController?.toggleRow(this.rowId, this.groupKey);
  };

  contextMenu = (e: MouseEvent) => {
    if (this.view.readonly$.value) {
      return;
    }
    const selection = this.selectionController;
    if (!selection) {
      return;
    }
    e.preventDefault();
    const ele = e.target as HTMLElement;
    const cell = ele.closest('dv-table-view-cell-container');
    const row = { id: this.rowId, groupKey: this.groupKey };
    if (!TableViewRowSelection.includes(selection.selection, row)) {
      selection.selection = TableViewRowSelection.create({
        rows: [row],
      });
    }
    const target =
      cell ??
      (e.target as HTMLElement).closest('.database-cell') ?? // for last add btn cell
      (e.target as HTMLElement);

    popRowMenu(this.tableViewLogic, popupTargetFromElement(target), selection);
  };

  setSelection = (selection?: TableViewSelection) => {
    if (this.selectionController) {
      this.selectionController.selection = selection;
    }
  };

  get groupKey() {
    return this.closest<TableGroup>('affine-data-view-table-group')?.group?.key;
  }

  get selectionController() {
    return this.tableViewLogic.selectionController;
  }

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.addFromEvent(this, 'contextmenu', this.contextMenu);

    this.classList.add('affine-database-block-row', 'database-row');
  }

  protected override render(): unknown {
    const view = this.view;
    return html`
      ${view.readonly$.value
        ? nothing
        : html`<div class="data-view-table-left-bar" style="height: 34px">
            <div style="display: flex;">
              <div
                class="data-view-table-view-drag-handler show-on-hover-row row-selected-bg"
                @click=${this._clickDragHandler}
              >
                <div
                  style="width: 4px;
                  border-radius: 2px;
                  height: 12px;
                  background-color: var(--affine-placeholder-color);"
                ></div>
              </div>
              <row-select-checkbox
                .tableViewLogic="${this.tableViewLogic}"
                .rowId="${this.rowId}"
                .groupKey="${this.groupKey}"
              ></row-select-checkbox>
            </div>
          </div>`}
      ${repeat(
        view.properties$.value,
        v => v.id,
        (column, i) => {
          const clickDetail = () => {
            if (!this.selectionController) {
              return;
            }
            this.setSelection(
              TableViewRowSelection.create({
                rows: [{ id: this.rowId, groupKey: this.groupKey }],
              })
            );
            openDetail(
              this.tableViewLogic,
              this.rowId,
              this.selectionController
            );
          };
          const openMenu = (e: MouseEvent) => {
            if (!this.selectionController) {
              return;
            }
            const ele = e.currentTarget as HTMLElement;
            const selection = this.selectionController.selection;
            if (
              !TableViewRowSelection.is(selection) ||
              !selection.rows.some(
                row => row.id === this.rowId && row.groupKey === this.groupKey
              )
            ) {
              const row = { id: this.rowId, groupKey: this.groupKey };
              this.setSelection(
                TableViewRowSelection.create({
                  rows: [row],
                })
              );
            }
            popRowMenu(
              this.tableViewLogic,
              popupTargetFromElement(ele),
              this.selectionController
            );
          };
          return html`
            <div style="display: flex;">
              <dv-table-view-cell-container
                class="database-cell"
                style=${styleMap({
                  width: `${column.width$.value}px`,
                  border: i === 0 ? 'none' : undefined,
                })}
                .tableViewLogic="${this.tableViewLogic}"
                .column="${column}"
                .rowId="${this.rowId}"
                data-row-id="${this.rowId}"
                .rowIndex="${this.rowIndex}"
                data-row-index="${this.rowIndex}"
                .columnId="${column.id}"
                data-column-id="${column.id}"
                .columnIndex="${i}"
                data-column-index="${i}"
              >
              </dv-table-view-cell-container>
              <div class="${cellDivider}"></div>
            </div>
            ${!column.readonly$.value &&
            column.view.mainProperties$.value.titleColumn === column.id
              ? html`<div class="row-ops show-on-hover-row">
                  <div class="row-op" @click="${clickDetail}">
                    ${CenterPeekIcon()}
                  </div>
                  ${!view.readonly$.value
                    ? html`<div class="row-op" @click="${openMenu}">
                        ${MoreHorizontalIcon()}
                      </div>`
                    : nothing}
                </div>`
              : nothing}
          `;
        }
      )}
      <div class="database-cell add-column-button"></div>
    `;
  }

  @property({ attribute: false })
  accessor tableViewLogic!: TableViewUILogic;

  @property({ attribute: false })
  accessor rowId!: string;

  @property({ attribute: false })
  accessor rowIndex!: number;

  get view() {
    return this.tableViewLogic.view;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    'data-view-table-row': TableRowView;
  }
}
