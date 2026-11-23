import { WithDisposable } from '@blocksuite/global/lit';
import { ShadowlessElement } from '@blocksuite/std';
import { computed, effect } from '@preact/signals-core';
import type { ReactiveController } from 'lit';
import { css, html } from 'lit';
import { property } from 'lit/decorators.js';
import type { Ref } from 'lit/directives/ref.js';
import { createRef, ref } from 'lit/directives/ref.js';

import { autoScrollOnBoundary } from '../../../../core/utils/auto-scroll.js';
import { startDrag } from '../../../../core/utils/drag.js';
import {
  type CellFocus,
  type MultiSelection,
  RowWithGroup,
  TableViewAreaSelection,
  TableViewRowSelection,
  type TableViewSelection,
  type TableViewSelectionWithType,
} from '../../selection';
import type { TableViewCellContainer } from '../cell.js';
import type { TableGroup } from '../group.js';
import type { TableRowView } from '../row/row.js';
import type { TableViewUILogic } from '../table-view-ui-logic.js';
import {
  DragToFillElement,
  fillSelectionWithFocusCellData,
} from './drag-to-fill.js';

export class TableSelectionController implements ReactiveController {
  private _tableViewSelection?: TableViewSelectionWithType;

  private readonly getFocusCellContainer = () => {
    if (
      !this._tableViewSelection ||
      this._tableViewSelection.selectionType !== 'area'
    )
      return null;
    const { groupKey, focus } = this._tableViewSelection;

    const dragStartCell = this.getCellContainer(
      groupKey,
      focus.rowIndex,
      focus.columnIndex
    );
    return dragStartCell ?? null;
  };

  __dragToFillElement = new DragToFillElement();

  __selectionElement;

  selectionStyleUpdateTask = 0;

  private get areaSelectionElement() {
    return this.__selectionElement.selectionRef.value;
  }

  get dragToFillDraggable() {
    return this.__dragToFillElement.dragToFillRef.value;
  }

  private get focusSelectionElement() {
    return this.__selectionElement.focusRef.value;
  }

  get selection(): TableViewSelectionWithType | undefined {
    return this._tableViewSelection;
  }

  set selection(data: TableViewSelection | undefined) {
    if (!data) {
      this.clearSelection();
      return;
    }
    const selection: TableViewSelectionWithType = {
      ...data,
      viewId: this.view.id,
      type: 'table',
    };
    if (selection.selectionType === 'area' && selection.isEditing) {
      const focus = selection.focus;
      const container = this.getCellContainer(
        selection.groupKey,
        focus.rowIndex,
        focus.columnIndex
      );
      const cell = container?.cell;
      const isEditing = cell ? cell.beforeEnterEditMode() : true;
      this.logic.setSelection({
        ...selection,
        isEditing,
      });
    } else {
      this.logic.setSelection(selection);
    }
  }

  get tableContainer() {
    return this.logic.tableContainer$.value;
  }

  get view() {
    return this.logic.view;
  }

  get viewData() {
    return this.view;
  }

  constructor(public logic: TableViewUILogic) {
    this.__selectionElement = new SelectionElement();
    this.__selectionElement.controller = this;
  }

  get host() {
    return this.logic.ui$.value;
  }

  private clearSelection() {
    this.logic.setSelection();
  }

  private handleDragEvent() {
    this.host?.disposables.add(
      this.logic.handleEvent('dragStart', context => {
        if (this.logic.view.readonly$.value) {
          return;
        }
        const event = context.get('pointerState').raw;
        const target = event.target;
        if (target instanceof HTMLElement) {
          const [cell, fillValues] = this.resolveDragStartTarget(target);

          if (cell) {
            const selection = this.selection;
            if (
              selection &&
              selection.selectionType === 'area' &&
              selection.isEditing &&
              selection.focus.rowIndex === cell.rowIndex &&
              selection.focus.columnIndex === cell.columnIndex
            ) {
              return false;
            }
            this.startDrag(event, cell, fillValues);
            event.preventDefault();
            return true;
          }
          return false;
        }
        return false;
      })
    );
  }

  private handleSelectionChange() {
    this.host?.disposables.add(
      this.logic.selection$.subscribe(tableSelection => {
        if (!this.isValidSelection(tableSelection)) {
          this.selection = undefined;
          return;
        }
        const old =
          this._tableViewSelection?.selectionType === 'area'
            ? this._tableViewSelection
            : undefined;
        const newSelection =
          tableSelection?.selectionType === 'area' ? tableSelection : undefined;
        if (
          old?.focus.rowIndex !== newSelection?.focus.rowIndex ||
          old?.focus.columnIndex !== newSelection?.focus.columnIndex
        ) {
          requestAnimationFrame(() => {
            this.scrollToFocus();
          });
        }

        if (
          this.isRowSelection() &&
          (old?.rowsSelection?.start !== newSelection?.rowsSelection?.start ||
            old?.rowsSelection?.end !== newSelection?.rowsSelection?.end)
        ) {
          requestAnimationFrame(() => {
            this.scrollToAreaSelection();
          });
        }

        if (old) {
          const container = this.getCellContainer(
            old.groupKey,
            old.focus.rowIndex,
            old.focus.columnIndex
          );
          if (container) {
            const cell = container.cell;
            if (old.isEditing) {
              cell?.beforeExitEditingMode();
              cell?.blurCell();
              container.isEditing$.value = false;
            }
          }
        }
        this._tableViewSelection = tableSelection;

        if (newSelection) {
          const container = this.getCellContainer(
            newSelection.groupKey,
            newSelection.focus.rowIndex,
            newSelection.focus.columnIndex
          );
          if (container) {
            const cell = container.cell;
            if (newSelection.isEditing) {
              container.isEditing$.value = true;
              requestAnimationFrame(() => {
                cell?.afterEnterEditingMode();
                cell?.focusCell();
              });
            }
          }
        }
      })
    );
  }

  private insertTo(
    groupKey: string | undefined,
    rowId: string,
    before: boolean
  ) {
    const id = this.view.rowAdd({ before, id: rowId });
    if (groupKey != null) {
      this.view.groupTrait.moveCardTo(id, undefined, groupKey, {
        before,
        id: rowId,
      });
    }
    const rows =
      groupKey != null
        ? this.view.groupTrait.groupDataMap$.value?.[groupKey]?.rows
        : this.view.rows$.value;
    requestAnimationFrame(() => {
      const index = this.logic.view.properties$.value.findIndex(
        v => v.type$.value === 'title'
      );
      this.selection = TableViewAreaSelection.create({
        groupKey: groupKey,
        focus: {
          rowIndex: rows?.findIndex(v => v.rowId === id) ?? 0,
          columnIndex: index,
        },
        isEditing: true,
      });
    });
  }

  private resolveDragStartTarget(
    target: HTMLElement
  ): [cell: TableViewCellContainer | null, fillValues: boolean] {
    let cell: TableViewCellContainer | null;
    const fillValues = !!target.dataset.dragToFill;
    if (fillValues) {
      const focusCellContainer = this.getFocusCellContainer();
      cell = focusCellContainer ?? null;
    } else {
      cell = target.closest('dv-table-view-cell-container');
    }
    return [cell, fillValues];
  }

  private scrollToAreaSelection() {
    this.areaSelectionElement?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }

  private scrollToFocus() {
    this.focusSelectionElement?.scrollIntoView({
      block: 'nearest',
      inline: 'nearest',
    });
  }

  areaToRows(selection: TableViewAreaSelection) {
    const rows = this.rows(selection.groupKey) ?? [];
    const ids = Array.from({
      length: selection.rowsSelection.end - selection.rowsSelection.start + 1,
    })
      .map((_, index) => index + selection.rowsSelection.start)
      .map(row => rows[row]?.rowId)
      .filter((id): id is string => id != null);
    return ids.map(id => ({ id, groupKey: selection.groupKey }));
  }

  cellPosition(groupKey: string | undefined) {
    const rows = this.rows(groupKey);
    const cells = rows
      ?.item(0)
      .querySelectorAll('dv-table-view-cell-container');

    return (x1: number, x2: number, y1: number, y2: number) => {
      const rowOffsets: number[] = Array.from(rows ?? []).map(
        v => v.getBoundingClientRect().top
      );
      const columnOffsets: number[] = Array.from(cells ?? []).map(
        v => v.getBoundingClientRect().left
      );
      const [startX, endX] = x1 < x2 ? [x1, x2] : [x2, x1];
      const [startY, endY] = y1 < y2 ? [y1, y2] : [y2, y1];
      const row: MultiSelection = {
        start: 0,
        end: 0,
      };
      const column: MultiSelection = {
        start: 0,
        end: 0,
      };
      for (let i = 0; i < rowOffsets.length; i++) {
        const offset = rowOffsets[i];
        if (offset == null) continue;
        if (offset < startY) {
          row.start = i;
        }
        if (offset < endY) {
          row.end = i;
        }
      }
      for (let i = 0; i < columnOffsets.length; i++) {
        const offset = columnOffsets[i];
        if (offset == null) continue;
        if (offset < startX) {
          column.start = i;
        }
        if (offset < endX) {
          column.end = i;
        }
      }
      return {
        row,
        column,
      };
    };
  }

  clear() {
    this.selection = undefined;
  }

  deleteRow(rowId: string) {
    this.view.rowsDelete([rowId]);
    this.focusToCell('up');
    this.logic.ui$.value?.requestUpdate();
  }

  focusFirstCell() {
    this.selection = TableViewAreaSelection.create({
      focus: {
        rowIndex: 0,
        columnIndex: 0,
      },
      isEditing: false,
    });
  }

  focusToArea(selection: TableViewAreaSelection) {
    return {
      ...selection,
      rowsSelection: selection.rowsSelection ?? {
        start: selection.focus.rowIndex,
        end: selection.focus.rowIndex,
      },
      columnsSelection: selection.columnsSelection ?? {
        start: selection.focus.columnIndex,
        end: selection.focus.columnIndex,
      },
      isEditing: false,
    } satisfies TableViewAreaSelection;
  }

  focusToCell(position: 'left' | 'right' | 'up' | 'down') {
    if (!this.selection || this.selection.selectionType !== 'area') {
      return;
    }
    const cell = this.getCellContainer(
      this.selection.groupKey,
      this.selection.focus.rowIndex,
      this.selection.focus.columnIndex
    );
    if (!cell) {
      return;
    }
    const row = cell.closest('data-view-table-row');
    const rows = Array.from(
      row
        ?.closest('.affine-database-table-container')
        ?.querySelectorAll('data-view-table-row') ?? []
    );
    const cells = Array.from(
      row?.querySelectorAll('dv-table-view-cell-container') ?? []
    );
    if (!row || !rows || !cells) {
      return;
    }
    let rowIndex = rows.indexOf(row);
    let columnIndex = cells.indexOf(cell);
    if (position === 'left') {
      if (columnIndex === 0) {
        columnIndex = cells.length - 1;
        rowIndex--;
      } else {
        columnIndex--;
      }
    }
    if (position === 'right') {
      if (columnIndex === cells.length - 1) {
        columnIndex = 0;
        rowIndex++;
      } else {
        columnIndex++;
      }
    }
    if (position === 'up') {
      if (rowIndex === 0) {
        //
      } else {
        rowIndex--;
      }
    }
    if (position === 'down') {
      if (rowIndex === rows.length - 1) {
        //
      } else {
        rowIndex++;
      }
    }
    rows[rowIndex]
      ?.querySelectorAll('dv-table-view-cell-container')
      ?.item(columnIndex)
      ?.selectCurrentCell(false);
  }

  getCellContainer(
    groupKey: string | undefined,
    rowIndex: number,
    columnIndex: number
  ): TableViewCellContainer | undefined {
    const row = this.rows(groupKey)?.item(rowIndex);
    return row
      ?.querySelectorAll('dv-table-view-cell-container')
      .item(columnIndex);
  }

  getGroup(groupKey: string | undefined) {
    const container =
      groupKey != null
        ? this.tableContainer?.querySelector(
            `affine-data-view-table-group[data-group-key="${groupKey}"]`
          )
        : this.tableContainer;
    return container ?? null;
  }

  getRect(
    groupKey: string | undefined,
    top: number,
    bottom: number,
    left: number,
    right: number
  ):
    | undefined
    | {
        top: number;
        left: number;
        width: number;
        height: number;
        scale: number;
      } {
    const rows = this.rows(groupKey);
    const topRow = rows?.item(top);
    const bottomRow = rows?.item(bottom);
    if (!topRow || !bottomRow) {
      return;
    }
    const topCells = topRow.querySelectorAll('dv-table-view-cell-container');
    const leftCell = topCells.item(left);
    const rightCell = topCells.item(right);
    if (!leftCell || !rightCell) {
      return;
    }
    const leftRect = leftCell.getBoundingClientRect();
    const scale = leftRect.width / leftCell.column.width$.value;
    return {
      top: leftRect.top / scale,
      left: leftRect.left / scale,
      width: (rightCell.getBoundingClientRect().right - leftRect.left) / scale,
      height: (bottomRow.getBoundingClientRect().bottom - leftRect.top) / scale,
      scale,
    };
  }

  getRow(groupKey: string | undefined, rowId: string) {
    return this.getGroup(groupKey)?.querySelector(
      `data-view-table-row[data-row-id='${rowId}']`
    );
  }

  getSelectionAreaBorder(position: 'left' | 'right' | 'top' | 'bottom') {
    return this.__selectionElement.selectionRef.value?.querySelector(
      `.area-border.area-${position}`
    );
  }

  hostConnected() {
    requestAnimationFrame(() => {
      this.tableContainer?.append(this.__selectionElement);
      this.tableContainer?.append(this.__dragToFillElement);
    });
    this.handleDragEvent();
    this.handleSelectionChange();
  }

  insertRowAfter(groupKey: string | undefined, rowId: string) {
    this.insertTo(groupKey, rowId, false);
  }

  insertRowBefore(groupKey: string | undefined, rowId: string) {
    this.insertTo(groupKey, rowId, true);
  }

  isRowSelection() {
    return this.selection?.selectionType === 'row';
  }

  isValidSelection(selection?: TableViewSelectionWithType): boolean {
    if (!selection || selection.selectionType === 'row') {
      return true;
    }
    if (selection.focus.rowIndex > this.view.rows$.value.length - 1) {
      this.selection = undefined;
      return false;
    }
    if (selection.focus.columnIndex > this.view.propertyIds$.value.length - 1) {
      this.selection = undefined;
      return false;
    }
    return true;
  }

  navigateRowSelection(direction: 'up' | 'down', append = false) {
    if (!TableViewRowSelection.is(this.selection)) return;
    const rows = this.selection.rows;
    const lastRow = rows[rows.length - 1];
    if (!lastRow) return;
    const lastRowIndex =
      (
        this.getGroup(lastRow?.groupKey)?.querySelector(
          `data-view-table-row[data-row-id='${lastRow?.id}']`
        ) as TableRowView | null
      )?.rowIndex ?? 0;
    const getRowByIndex = (index: number) => {
      const tableRow = this.rows(lastRow?.groupKey)?.item(index);
      if (!tableRow) {
        return;
      }
      return {
        id: tableRow.rowId,
        groupKey: lastRow?.groupKey,
      };
    };
    const prevRow = getRowByIndex(lastRowIndex - 1);
    const nextRow = getRowByIndex(lastRowIndex + 1);
    const includes = (row: RowWithGroup) => {
      if (!row) {
        return false;
      }
      return rows.some(r => RowWithGroup.equal(r, row));
    };
    if (append) {
      const addList: RowWithGroup[] = [];
      const removeList: RowWithGroup[] = [];
      if (direction === 'up' && prevRow != null) {
        if (includes(prevRow)) {
          removeList.push(lastRow);
        } else {
          addList.push(prevRow);
        }
      }
      if (direction === 'down' && nextRow != null) {
        if (includes(nextRow)) {
          removeList.push(lastRow);
        } else {
          addList.push(nextRow);
        }
      }
      this.rowSelectionChange({ add: addList, remove: removeList });
    } else {
      const target = direction === 'up' ? prevRow : nextRow;
      if (target != null) {
        this.selection = TableViewRowSelection.create({
          rows: [target],
        });
      }
    }
  }

  rows(groupKey: string | undefined) {
    const container =
      groupKey != null
        ? this.tableContainer?.querySelector(
            `affine-data-view-table-group[data-group-key="${groupKey}"]`
          )
        : this.tableContainer;
    return container?.querySelectorAll('data-view-table-row');
  }

  rowSelectionChange({
    add,
    remove,
  }: {
    add: RowWithGroup[];
    remove: RowWithGroup[];
  }) {
    const key = (r: RowWithGroup) => `${r.id}.${r.groupKey ? r.groupKey : ''}`;
    const rows = new Set(
      TableViewRowSelection.rows(this.selection).map(r => key(r))
    );
    remove.forEach(row => rows.delete(key(row)));
    add.forEach(row => rows.add(key(row)));
    const result = [...rows]
      .map(r => r.split('.'))
      .flatMap(([id, groupKey]) => {
        if (id == null) return [];
        return [
          {
            id,
            groupKey: groupKey ? groupKey : undefined,
          },
        ];
      });
    this.selection = TableViewRowSelection.create({
      rows: result,
    });
  }

  rowsToArea(rows: string[]):
    | {
        start: number;
        end: number;
        groupKey?: string;
      }
    | undefined {
    let groupKey: string | undefined = undefined;
    let minIndex: number | undefined = undefined;
    let maxIndex: number | undefined = undefined;
    const set = new Set(rows);
    if (!this.tableContainer) return;
    for (const row of this.tableContainer
      ?.querySelectorAll('data-view-table-row')
      .values() ?? []) {
      if (!set.has(row.rowId)) {
        continue;
      }
      minIndex =
        minIndex != null ? Math.min(minIndex, row.rowIndex) : row.rowIndex;
      maxIndex =
        maxIndex != null ? Math.max(maxIndex, row.rowIndex) : row.rowIndex;
      if (groupKey == null) {
        groupKey = row.groupKey;
      } else if (groupKey !== row.groupKey) {
        return;
      }
    }
    if (minIndex == null || maxIndex == null) {
      return;
    }
    return {
      groupKey,
      start: minIndex,
      end: maxIndex,
    };
  }

  selectionAreaDown() {
    const selection = this.selection;
    if (!selection || selection.selectionType !== 'area') {
      return;
    }
    const newSelection = this.focusToArea(selection);
    if (newSelection.rowsSelection.start === newSelection.focus.rowIndex) {
      newSelection.rowsSelection.end = Math.min(
        (this.rows(newSelection.groupKey)?.length ?? 0) - 1,
        newSelection.rowsSelection.end + 1
      );
      requestAnimationFrame(() => {
        this.getSelectionAreaBorder('bottom')?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    } else {
      newSelection.rowsSelection.start += 1;
      requestAnimationFrame(() => {
        this.getSelectionAreaBorder('top')?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    }
    this.selection = newSelection;
  }

  selectionAreaLeft() {
    const selection = this.selection;
    if (!selection || selection.selectionType !== 'area') {
      return;
    }
    const newSelection = this.focusToArea(selection);
    if (newSelection.columnsSelection.end === newSelection.focus.columnIndex) {
      newSelection.columnsSelection.start = Math.max(
        0,
        newSelection.columnsSelection.start - 1
      );
      requestAnimationFrame(() => {
        this.getSelectionAreaBorder('left')?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    } else {
      newSelection.columnsSelection.end -= 1;
      requestAnimationFrame(() => {
        this.getSelectionAreaBorder('right')?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    }
    this.selection = newSelection;
  }

  selectionAreaRight() {
    const selection = this.selection;
    if (!selection || selection.selectionType !== 'area') {
      return;
    }
    const newSelection = this.focusToArea(selection);
    if (
      newSelection.columnsSelection.start === newSelection.focus.columnIndex
    ) {
      const max =
        (this.rows(newSelection.groupKey)
          ?.item(0)
          .querySelectorAll('dv-table-view-cell-container').length ?? 0) - 1;
      newSelection.columnsSelection.end = Math.min(
        max,
        newSelection.columnsSelection.end + 1
      );
      requestAnimationFrame(() => {
        this.getSelectionAreaBorder('right')?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    } else {
      newSelection.columnsSelection.start += 1;
      requestAnimationFrame(() => {
        this.getSelectionAreaBorder('left')?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    }
    this.selection = newSelection;
  }

  selectionAreaUp() {
    const selection = this.selection;
    if (!selection || selection.selectionType !== 'area') {
      return;
    }
    const newSelection = this.focusToArea(selection);
    if (newSelection.rowsSelection.end === newSelection.focus.rowIndex) {
      newSelection.rowsSelection.start = Math.max(
        0,
        newSelection.rowsSelection.start - 1
      );
      requestAnimationFrame(() => {
        this.getSelectionAreaBorder('top')?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    } else {
      newSelection.rowsSelection.end -= 1;
      requestAnimationFrame(() => {
        this.getSelectionAreaBorder('bottom')?.scrollIntoView({
          block: 'nearest',
          inline: 'nearest',
          behavior: 'smooth',
        });
      });
    }
    this.selection = newSelection;
  }

  startDrag(
    evt: PointerEvent,
    cell: TableViewCellContainer,
    fillValues?: boolean
  ) {
    const groupKey = cell.closest<TableGroup>('affine-data-view-table-group')
      ?.group?.key;
    const table = this.tableContainer;
    const scrollContainer = table?.parentElement;
    if (!table || !scrollContainer) {
      return;
    }
    const tableRect = table.getBoundingClientRect();
    const startOffsetX = evt.x - tableRect.left;
    const startOffsetY = evt.y - tableRect.top;
    const offsetToSelection = this.cellPosition(groupKey);
    const select = (selection: {
      row: MultiSelection;
      column: MultiSelection;
    }) => {
      this.selection = TableViewAreaSelection.create({
        groupKey: groupKey,
        rowsSelection: selection.row,
        columnsSelection: selection.column,
        focus: {
          rowIndex: cell.rowIndex,
          columnIndex: cell.columnIndex,
        },
        isEditing: false,
      });
    };
    const drag = startDrag<
      | {
          row: MultiSelection;
          column: MultiSelection;
        }
      | undefined,
      {
        x: number;
        y: number;
      }
    >(evt, {
      transform: evt => ({
        x: evt.x,
        y: evt.y,
      }),
      onDrag: () => {
        if (fillValues) this.__dragToFillElement.dragging = true;
        return undefined;
      },
      onMove: ({ x, y }) => {
        if (!table) return;
        const tableRect = table.getBoundingClientRect();
        const startX = tableRect.left + startOffsetX;
        const startY = tableRect.top + startOffsetY;
        const selection = offsetToSelection(startX, x, startY, y);

        if (fillValues)
          selection.column = {
            start: cell.columnIndex,
            end: cell.columnIndex,
          };

        select(selection);
        return selection;
      },
      onDrop: selection => {
        if (!selection) {
          return;
        }
        select(selection);
        if (fillValues && this.selection) {
          this.__dragToFillElement.dragging = false;
          fillSelectionWithFocusCellData(
            this.logic,
            TableViewAreaSelection.create({
              groupKey: groupKey,
              rowsSelection: selection.row,
              columnsSelection: selection.column,
              focus: {
                rowIndex: cell.rowIndex,
                columnIndex: cell.columnIndex,
              },
              isEditing: false,
            })
          );
        }
      },
      onClear: () => {
        cancelScroll();
      },
    });
    const cancelScroll = autoScrollOnBoundary(
      scrollContainer,
      computed(() => {
        return {
          left: drag.mousePosition.value.x,
          right: drag.mousePosition.value.x,
          top: drag.mousePosition.value.y,
          bottom: drag.mousePosition.value.y,
        };
      }),
      {
        onScroll() {
          drag.move({ x: drag.last.x, y: drag.last.y });
        },
      }
    );
  }

  toggleRow(rowId: string, groupKey?: string) {
    const row = {
      id: rowId,
      groupKey,
    };
    const isSelected = TableViewRowSelection.includes(this.selection, row);
    this.rowSelectionChange({
      add: isSelected ? [] : [row],
      remove: isSelected ? [row] : [],
    });
  }
}

export class SelectionElement extends WithDisposable(ShadowlessElement) {
  static override styles = css`
    .database-selection {
      position: absolute;
      z-index: 2;
      box-sizing: border-box;
      background: var(--affine-primary-color-04);
      pointer-events: none;
      display: none;
    }

    .database-focus {
      position: absolute;
      width: 100%;
      z-index: 2;
      box-sizing: border-box;
      border: 1px solid var(--affine-primary-color);
      border-radius: 2px;
      pointer-events: none;
      display: none;
      outline: none;
    }

    .area-border {
      position: absolute;
      pointer-events: none;
    }

    .area-left {
      left: 0;
      height: 100%;
      width: 1px;
    }

    .area-right {
      right: 0;
      height: 100%;
      width: 1px;
    }

    .area-top {
      top: 0;
      width: 100%;
      height: 1px;
    }

    .area-bottom {
      bottom: 0;
      width: 100%;
      height: 1px;
    }

    @media print {
      data-view-table-selection {
        display: none;
      }
    }
  `;

  focusRef: Ref<HTMLDivElement> = createRef<HTMLDivElement>();

  preTask = 0;

  selectionRef: Ref<HTMLDivElement> = createRef<HTMLDivElement>();

  get selection$() {
    return this.controller.logic.selection$;
  }

  clearAreaStyle() {
    const div = this.selectionRef.value;
    if (!div) return;
    div.style.display = 'none';
  }

  clearFocusStyle() {
    const div = this.focusRef.value;
    const dragToFill = this.controller.dragToFillDraggable;
    if (!div || !dragToFill) return;
    div.style.display = 'none';
    dragToFill.style.display = 'none';
  }

  override connectedCallback() {
    super.connectedCallback();
    this.disposables.add(
      effect(() => {
        this.startUpdate(this.selection$.value);
        return () => {
          this.cancelSelectionUpdate();
        };
      })
    );
  }

  override render() {
    return html`
      <div ${ref(this.selectionRef)} class="database-selection">
        <div class="area-border area-left"></div>
        <div class="area-border area-right"></div>
        <div class="area-border area-top"></div>
        <div class="area-border area-bottom"></div>
      </div>
      <div tabindex="0" ${ref(this.focusRef)} class="database-focus"></div>
    `;
  }

  cancelSelectionUpdate() {
    if (this.preTask) {
      cancelAnimationFrame(this.preTask);
      this.preTask = 0;
    }
  }

  startUpdate(selection?: TableViewSelection) {
    this.cancelSelectionUpdate();
    if (
      selection?.selectionType === 'area' &&
      !this.controller.logic.view.readonly$.value
    ) {
      this.updateAreaSelectionStyle(
        selection.groupKey,
        selection.rowsSelection,
        selection.columnsSelection
      );

      const columnSelection = selection.columnsSelection;
      const rowSelection = selection.rowsSelection;

      const isSingleRowSelection = rowSelection.end - rowSelection.start === 0;
      const isSingleColumnSelection =
        columnSelection.end - columnSelection.start === 0;

      const isDragElemDragging = this.controller.__dragToFillElement.dragging;
      const isEditing = selection.isEditing;

      const showDragToFillHandle =
        !isEditing &&
        (isDragElemDragging || isSingleRowSelection) &&
        isSingleColumnSelection;

      this.updateFocusSelectionStyle(
        selection.groupKey,
        selection.focus,
        isEditing,
        showDragToFillHandle
      );
      this.preTask = requestAnimationFrame(() =>
        this.startUpdate(this.selection$.value)
      );
    } else {
      this.clearFocusStyle();
      this.clearAreaStyle();
    }
  }

  updateAreaSelectionStyle(
    groupKey: string | undefined,
    rowSelection: MultiSelection,
    columnSelection: MultiSelection
  ) {
    const div = this.selectionRef.value;
    if (!div) return;
    const tableContainer = this.controller.tableContainer;
    if (!tableContainer) return;
    const tableRect = tableContainer.getBoundingClientRect();
    const rect = this.controller.getRect(
      groupKey,
      rowSelection?.start ?? 0,
      rowSelection?.end ?? this.controller.view.rows$.value.length - 1,
      columnSelection?.start ?? 0,
      columnSelection?.end ?? this.controller.view.properties$.value.length - 1
    );
    if (!rect) {
      this.clearAreaStyle();
      return;
    }
    const { left, top, width, height, scale } = rect;
    div.style.left = `${left - tableRect.left / scale}px`;
    div.style.top = `${top - tableRect.top / scale}px`;
    div.style.width = `${width}px`;
    div.style.height = `${height}px`;
    div.style.display = 'block';
  }

  updateFocusSelectionStyle(
    groupKey: string | undefined,
    focus: CellFocus,
    isEditing: boolean,
    showDragToFillHandle = false
  ) {
    const div = this.focusRef.value;
    const dragToFill = this.controller.dragToFillDraggable;
    if (!div || !dragToFill) return;
    // Check if row is removed.
    const rows = this.controller.rows(groupKey) ?? [];
    if (rows.length <= focus.rowIndex) return;

    const rect = this.controller.getRect(
      groupKey,
      focus.rowIndex,
      focus.rowIndex,
      focus.columnIndex,
      focus.columnIndex
    );
    if (!rect) {
      this.clearFocusStyle();
      return;
    }
    const { left, top, width, height, scale } = rect;
    const tableContainer = this.controller.tableContainer;
    if (!tableContainer) return;
    const tableRect = tableContainer?.getBoundingClientRect();
    if (!tableRect) {
      this.clearFocusStyle();
      return;
    }

    const x = left - tableRect.left / scale;
    const y = top - 1 - tableRect.top / scale;
    const w = width + 1;
    const h = height + 1;
    div.style.left = `${x}px`;
    div.style.top = `${y}px`;
    div.style.width = `${w}px`;
    div.style.height = `${h}px`;
    div.style.borderColor = 'var(--affine-primary-color)';
    div.style.borderStyle = this.controller.__dragToFillElement.dragging
      ? 'dashed'
      : 'solid';
    div.style.boxShadow = isEditing
      ? '0px 0px 0px 2px rgba(30, 150, 235, 0.30)'
      : 'unset';
    div.style.display = 'block';

    dragToFill.style.left = `${x + w}px`;
    dragToFill.style.top = `${y + h}px`;
    dragToFill.style.display = showDragToFillHandle ? 'block' : 'none';
  }

  @property({ attribute: false })
  accessor controller!: TableSelectionController;
}
