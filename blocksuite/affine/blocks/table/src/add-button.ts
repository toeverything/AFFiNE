import { SignalWatcher, WithDisposable } from '@blocksuite/global/lit';
import { PlusIcon } from '@blocksuite/icons/lit';
import { ShadowlessElement } from '@blocksuite/std';
import {
  autoPlacement,
  autoUpdate,
  computePosition,
  offset,
  shift,
} from '@floating-ui/dom';
import { signal } from '@preact/signals-core';
import { html } from 'lit';
import { property } from 'lit/decorators.js';
import { classMap } from 'lit/directives/class-map.js';
import { ref } from 'lit/directives/ref.js';
import { styleMap } from 'lit/directives/style-map.js';

import {
  addColumnButtonStyle,
  addRowButtonStyle,
  addRowColumnButtonStyle,
  cellCountTipsStyle,
} from './add-button-css';
import { DefaultColumnWidth, DefaultRowHeight } from './consts';
import type { TableDataManager } from './table-data-manager';

export const AddButtonComponentName = 'affine-table-add-button';
export class AddButton extends SignalWatcher(
  WithDisposable(ShadowlessElement)
) {
  @property({ type: Boolean })
  accessor vertical = false;

  @property({ attribute: false })
  accessor dataManager!: TableDataManager;

  get hoverColumnIndex$() {
    return this.dataManager.hoverColumnIndex$;
  }

  get hoverRowIndex$() {
    return this.dataManager.hoverRowIndex$;
  }

  get columns$() {
    return this.dataManager.columns$;
  }

  get rows$() {
    return this.dataManager.rows$;
  }

  addColumnButtonRef$ = signal<HTMLDivElement>();
  addRowButtonRef$ = signal<HTMLDivElement>();
  addRowColumnButtonRef$ = signal<HTMLDivElement>();

  columnDragging$ = signal(false);
  rowDragging$ = signal(false);
  rowColumnDragging$ = signal(false);

  popCellCountTips = (ele: Element) => {
    const tip = document.createElement('div');
    tip.classList.add(cellCountTipsStyle);
    document.body.append(tip);
    const dispose = autoUpdate(ele, tip, () => {
      computePosition(ele, tip, {
        middleware: [
          autoPlacement({ allowedPlacements: ['bottom'] }),
          offset(4),
          shift(),
        ],
      })
        .then(({ x, y }) => {
          tip.style.left = `${x}px`;
          tip.style.top = `${y}px`;
        })
        .catch(e => {
          console.error(e);
        });
    });
    return {
      tip,
      dispose: () => {
        dispose();
        tip.remove();
      },
    };
  };

  getEmptyRows() {
    const rows = this.rows$.value;
    const columns = this.columns$.value;
    const rowWidths: number[] = [];
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i];
      if (!row) {
        break;
      }
      const hasText = columns.some(column => {
        const cell = this.dataManager.getCell(row.rowId, column.columnId);
        if (!cell) {
          return false;
        }
        return cell.text.length > 0;
      });
      if (hasText) {
        break;
      }
      rowWidths.push((rowWidths[rowWidths.length - 1] ?? 0) + DefaultRowHeight);
    }
    return rowWidths;
  }

  getEmptyColumns() {
    const columns = this.columns$.value;
    const rows = this.rows$.value;
    const columnWidths: number[] = [];
    for (let i = columns.length - 1; i >= 0; i--) {
      const column = columns[i];
      if (!column) {
        break;
      }
      const hasText = rows.some(row => {
        const cell = this.dataManager.getCell(row.rowId, column.columnId);
        if (!cell) {
          return false;
        }
        return cell.text.length > 0;
      });
      if (hasText) {
        break;
      }
      columnWidths.push(
        (columnWidths[columnWidths.length - 1] ?? 0) +
          (column.width ?? DefaultColumnWidth)
      );
    }
    return columnWidths;
  }

  onDragStart(e: MouseEvent) {
    e.stopPropagation();
    const initialX = e.clientX;
    const initialY = e.clientY;
    const target = e.target as HTMLElement;
    const isColumn = target.closest('.column-add');
    const isRow = target.closest('.row-add');
    const isRowColumn = target.closest('.row-column-add');
    const realTarget = isColumn || isRowColumn || isRow;
    if (!realTarget) {
      return;
    }
    const tipsHandler = this.popCellCountTips(realTarget);
    let emptyRows: number[] = [];
    let emptyColumns: number[] = [];
    if (isColumn) {
      this.columnDragging$.value = true;
      emptyColumns = this.getEmptyColumns();
    }
    if (isRow) {
      this.rowDragging$.value = true;
      emptyRows = this.getEmptyRows();
    }
    if (isRowColumn) {
      this.rowColumnDragging$.value = true;
      emptyRows = this.getEmptyRows();
      emptyColumns = this.getEmptyColumns();
    }
    const onMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - initialX;
      const deltaY = e.clientY - initialY;
      const addColumn = isColumn || isRowColumn;
      const addRow = isRow || isRowColumn;
      if (addColumn) {
        if (deltaX > 0) {
          this.dataManager.virtualColumnCount$.value = Math.floor(
            (deltaX + 30) / DefaultColumnWidth
          );
        } else {
          let count = 0;
          while (count < emptyColumns.length) {
            const emptyColumnWidth = emptyColumns[count];
            if (!emptyColumnWidth) {
              continue;
            }
            if (-deltaX > emptyColumnWidth) {
              count++;
            } else {
              break;
            }
          }
          this.dataManager.virtualColumnCount$.value = -count;
        }
      }
      if (addRow) {
        if (deltaY > 0) {
          this.dataManager.virtualRowCount$.value = Math.floor(
            deltaY / DefaultRowHeight
          );
        } else {
          let count = 0;
          while (count < emptyRows.length) {
            const emptyRowHeight = emptyRows[count];
            if (!emptyRowHeight) {
              continue;
            }
            if (-deltaY > emptyRowHeight) {
              count++;
            } else {
              break;
            }
          }
          this.dataManager.virtualRowCount$.value = -count;
        }
      }
      tipsHandler.tip.textContent = this.dataManager.cellCountTips$.value;
    };
    const onMouseUp = () => {
      this.columnDragging$.value = false;
      this.rowDragging$.value = false;
      this.rowColumnDragging$.value = false;
      const rowCount = this.dataManager.virtualRowCount$.value;
      const columnCount = this.dataManager.virtualColumnCount$.value;
      this.dataManager.virtualColumnCount$.value = 0;
      this.dataManager.virtualRowCount$.value = 0;
      this.dataManager.addNRow(rowCount);
      this.dataManager.addNColumn(columnCount);

      tipsHandler.dispose();
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }

  override connectedCallback(): void {
    super.connectedCallback();
    this.disposables.addFromEvent(this, 'mousedown', (e: MouseEvent) => {
      this.onDragStart(e);
    });
  }

  renderAddColumnButton() {
    const hovered =
      this.hoverColumnIndex$.value === this.columns$.value.length - 1;
    const dragging = this.columnDragging$.value;
    return html` <div
      data-testid="add-column-button"
      class="${classMap({
        [addColumnButtonStyle]: true,
        active: dragging,
        'column-add': true,
      })}"
      ${ref(this.addColumnButtonRef$)}
      style=${styleMap({
        opacity: hovered || dragging ? 1 : undefined,
      })}
      @click="${(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.dataManager.addColumn(this.columns$.value.length - 1);
      }}"
    >
      ${PlusIcon()}
    </div>`;
  }

  renderAddRowButton() {
    const hovered = this.hoverRowIndex$.value === this.rows$.value.length - 1;
    const dragging = this.rowDragging$.value;
    return html` <div
      data-testid="add-row-button"
      class="${classMap({
        [addRowButtonStyle]: true,
        active: dragging,
        'row-add': true,
      })}"
      ${ref(this.addRowButtonRef$)}
      style=${styleMap({
        opacity: hovered || dragging ? 1 : undefined,
      })}
      @click="${(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.dataManager.addRow(this.rows$.value.length - 1);
      }}"
    >
      ${PlusIcon()}
    </div>`;
  }

  renderAddRowColumnButton() {
    const hovered =
      this.hoverRowIndex$.value === this.rows$.value.length - 1 &&
      this.hoverColumnIndex$.value === this.columns$.value.length - 1;
    const dragging = this.rowColumnDragging$.value;
    return html` <div
      class="${classMap({
        [addRowColumnButtonStyle]: true,
        active: dragging,
        'row-column-add': true,
      })}"
      ${ref(this.addRowColumnButtonRef$)}
      style=${styleMap({
        opacity: hovered || dragging ? 1 : undefined,
      })}
      @click="${(e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        this.dataManager.addRow(this.rows$.value.length - 1);
        this.dataManager.addColumn(this.columns$.value.length - 1);
      }}"
    >
      ${PlusIcon()}
    </div>`;
  }

  override render() {
    return html`
      ${this.renderAddColumnButton()} ${this.renderAddRowButton()}
      ${this.renderAddRowColumnButton()}
    `;
  }
}
declare global {
  interface HTMLElementTagNameMap {
    [AddButtonComponentName]: AddButton;
  }
}
